import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { GatewayConfig } from '../../../../core/gateway.config';
import { PaymentProfileConfirmPublisher } from '../../../../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import { parsePaymentUserProfileChangedV1 } from '../../../../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';
import { PAYMENT_PROFILE_ROUTING_KEY } from '../../../../../../../libs/contracts/src/events/payment-user-profile-delivery';

type ClaimedProfile = {
  id: string;
  userId: string;
  sourceVersion: bigint;
  payload: unknown;
  attempts: number;
};

@Injectable()
export class PaymentUserProfileRelay implements OnModuleDestroy {
  private readonly logger = new Logger(PaymentUserProfileRelay.name);
  private readonly publisher: PaymentProfileConfirmPublisher;
  private running: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    config: GatewayConfig,
  ) {
    this.publisher = new PaymentProfileConfirmPublisher(config.rabbitmqUrl);
  }

  @Cron('* * * * * *')
  async relay(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = this.deliver();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.running;
    await this.publisher.close();
  }

  private async deliver(): Promise<void> {
    const leaseId = randomUUID();
    try {
      const rows = await this.prisma.$queryRaw<ClaimedProfile[]>`
        UPDATE "PaymentUserProfileOutbox"
        SET "leaseId" = ${leaseId}::uuid, "leaseUntil" = clock_timestamp() + interval '30 seconds',
            "attempts" = "attempts" + 1
        WHERE "id" IN (
          SELECT "id" FROM "PaymentUserProfileOutbox"
          WHERE "publishedAt" IS NULL AND "availableAt" <= clock_timestamp()
            AND ("leaseUntil" IS NULL OR "leaseUntil" <= clock_timestamp())
          ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING "id", "userId", "sourceVersion", "payload", "attempts"
      `;
      const row = rows[0];
      if (!row) return;
      try {
        const event = parsePaymentUserProfileChangedV1(row.payload);
        if (
          event.eventId !== row.id ||
          event.userId !== row.userId ||
          event.sourceVersion !== row.sourceVersion.toString()
        ) {
          throw new Error('PROFILE_OUTBOX_CONTRACT');
        }
        await this.publisher.publish({
          routingKey: PAYMENT_PROFILE_ROUTING_KEY,
          messageId: row.id,
          content: Buffer.from(JSON.stringify(row.payload)),
        });
        await this.prisma.$executeRaw`
          UPDATE "PaymentUserProfileOutbox" SET "publishedAt" = clock_timestamp(),
            "leaseId" = NULL, "leaseUntil" = NULL, "lastErrorCode" = NULL
          WHERE "id" = ${row.id}::uuid AND "leaseId" = ${leaseId}::uuid
            AND "publishedAt" IS NULL AND "leaseUntil" > clock_timestamp()
        `;
      } catch {
        const delay = Math.min(60000, 1000 * 2 ** Math.min(row.attempts, 6));
        await this.prisma.$executeRaw`
          UPDATE "PaymentUserProfileOutbox" SET "leaseId" = NULL, "leaseUntil" = NULL,
            "availableAt" = clock_timestamp() + ${delay} * interval '1 millisecond', "lastErrorCode" = 'PUBLISH_FAILED'
          WHERE "id" = ${row.id}::uuid AND "leaseId" = ${leaseId}::uuid
            AND "publishedAt" IS NULL AND "leaseUntil" > clock_timestamp()
        `;
        this.logger.warn({ event: 'payment.profile.retry', code: 'PUBLISH_FAILED' });
      }
    } catch {
      this.logger.error({ event: 'payment.profile.storage', code: 'STORAGE_UNAVAILABLE' });
    }
  }
}
