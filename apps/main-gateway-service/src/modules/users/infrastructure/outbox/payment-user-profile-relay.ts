import {
  BACKGROUND_IDLE_MS,
  BACKGROUND_RETRY_MS,
  OUTBOX_DRAIN_LIMIT,
  OUTBOX_CONTINUE_MS,
} from '../../../../../../../libs/common/src/constants/background-polling';
import { listenForGatewayOutbox } from '../../../../core/prisma/transactions/gateway-outbox-wakeup';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
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
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private requested = false;
  private scheduledAt = 0;
  private retryAt = 0;
  private failures = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: GatewayConfig,
  ) {
    this.publisher = new PaymentProfileConfirmPublisher(config.rabbitmqUrl);
  }

  onModuleInit(): void {
    this.unsubscribe = listenForGatewayOutbox({
      client: this.prisma,
      outbox: 'PAYMENT_PROFILE',
      wake: () => this.wake(),
    });
    this.wake();
  }

  wake(): void {
    if (this.stopped) return;
    this.requested = true;
    if (!this.running) this.scheduleAt(Math.max(Date.now(), this.retryAt));
  }

  private scheduleAt(when: number): void {
    if (this.stopped || (this.timer && this.scheduledAt <= when)) return;
    if (this.timer) clearTimeout(this.timer);
    this.scheduledAt = when;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.relay();
      },
      Math.max(0, when - Date.now()),
    );
    this.timer.unref();
  }

  async relay(): Promise<void> {
    if (this.stopped || this.running) return;
    if (Date.now() < this.retryAt) {
      this.scheduleAt(this.retryAt);
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = null;
      this.scheduleAt(
        this.retryAt > Date.now()
          ? this.retryAt
          : Date.now() + (this.requested ? OUTBOX_CONTINUE_MS : BACKGROUND_IDLE_MS),
      );
    }
  }

  private async drain(): Promise<void> {
    for (let count = 0; count < OUTBOX_DRAIN_LIMIT && !this.stopped; count++) {
      this.requested = false;
      const outcome = await this.deliver();
      if (outcome === 'RETRY') return;
      if (outcome === 'EMPTY' && !this.requested) return;
    }
    if (!this.stopped) this.requested = true;
  }

  private pauseAfterFailure(): void {
    this.failures = Math.min(this.failures + 1, 7);
    this.retryAt =
      Date.now() + Math.min(BACKGROUND_IDLE_MS, BACKGROUND_RETRY_MS * 2 ** (this.failures - 1));
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.running,
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 10000);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
      await this.publisher.close();
    }
  }

  private async deliver(): Promise<'EMPTY' | 'PUBLISHED' | 'RETRY'> {
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
      if (!row || this.stopped) return 'EMPTY';
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
        this.failures = 0;
        this.retryAt = 0;
        return 'PUBLISHED';
      } catch {
        this.pauseAfterFailure();
        const delay = Math.min(60000, 1000 * 2 ** Math.min(row.attempts, 6));
        await this.prisma.$executeRaw`
          UPDATE "PaymentUserProfileOutbox" SET "leaseId" = NULL, "leaseUntil" = NULL,
            "availableAt" = clock_timestamp() + ${delay} * interval '1 millisecond', "lastErrorCode" = 'PUBLISH_FAILED'
          WHERE "id" = ${row.id}::uuid AND "leaseId" = ${leaseId}::uuid
            AND "publishedAt" IS NULL AND "leaseUntil" > clock_timestamp()
        `;
        this.logger.warn({ event: 'payment.profile.retry', code: 'PUBLISH_FAILED' });
        return 'RETRY';
      }
    } catch {
      this.pauseAfterFailure();
      this.logger.error({ event: 'payment.profile.storage', code: 'STORAGE_UNAVAILABLE' });
      return 'RETRY';
    }
  }
}
