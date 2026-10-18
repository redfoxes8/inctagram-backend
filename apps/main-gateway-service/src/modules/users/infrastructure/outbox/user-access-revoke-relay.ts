import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { COMMON_RABBITMQ_EXCHANGE } from '../../../../core/gateway-rabbitmq.constants';
import { UserAccessClock } from '../../../sessions/application/user-access-check';
import {
  USER_ACCESS_REVOKED_EVENT_TYPE,
  USER_ACCESS_REVOKED_ROUTING_KEY,
  type UserAccessRevoked,
} from '../../../../../../../libs/contracts/src/user-access-revoked';

type ClaimedRevoke = {
  id: string;
  userId: string;
  sessionIds: string[];
  createdAt: Date;
  attempts: number;
};

@Injectable()
export class UserAccessRevokeRelay {
  private readonly logger = new Logger(UserAccessRevokeRelay.name);
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
    private readonly clock: UserAccessClock,
  ) {}

  @Cron('* * * * * *')
  async relay(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Claim ONE per lease: no queued batch can expire while waiting for other network publishes.
      const now = this.clock.now();
      const leaseId = randomUUID();
      const rows = await this.prisma.$queryRaw<ClaimedRevoke[]>`
        UPDATE "UserAccessRevokeOutbox" SET "leaseId" = ${leaseId}, "leaseUntil" = ${new Date(now.getTime() + 30000)}, "attempts" = "attempts" + 1
        WHERE "id" IN (SELECT "id" FROM "UserAccessRevokeOutbox"
          WHERE "publishedAt" IS NULL AND "availableAt" <= ${now}
            AND ("leaseUntil" IS NULL OR "leaseUntil" <= ${now})
          ORDER BY "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING "id", "userId", "sessionIds", "createdAt", "attempts"`;
      const row = rows[0];
      if (!row) return;
      try {
        if (!this.amqp.connected) throw new Error('BROKER_UNAVAILABLE');
        const event: UserAccessRevoked = {
          eventId: row.id,
          version: 1,
          eventType: USER_ACCESS_REVOKED_EVENT_TYPE,
          userId: row.userId,
          sessionIds: row.sessionIds,
          occurredAt: row.createdAt.toISOString(),
        };
        // The existing AmqpConnection managed channel uses publisher confirms. Timeout <= lease.
        const options = { persistent: true, mandatory: true, messageId: row.id, timeout: 5000 };
        const confirmed = await this.amqp.publish(
          COMMON_RABBITMQ_EXCHANGE,
          USER_ACCESS_REVOKED_ROUTING_KEY,
          event,
          options,
        );
        if (!confirmed) throw new Error('UNCONFIRMED');
        await this.prisma.userAccessRevokeOutbox.updateMany({
          where: { id: row.id, leaseId, publishedAt: null },
          data: {
            publishedAt: this.clock.now(),
            leaseId: null,
            leaseUntil: null,
            lastErrorCode: null,
          },
        });
      } catch {
        const delay = Math.min(60000, 1000 * 2 ** Math.min(row.attempts, 6));
        await this.prisma.userAccessRevokeOutbox.updateMany({
          where: { id: row.id, leaseId, publishedAt: null },
          data: {
            leaseId: null,
            leaseUntil: null,
            availableAt: new Date(this.clock.now().getTime() + delay),
            lastErrorCode: 'PUBLISH_FAILED',
          },
        });
        this.logger.warn({
          event: 'user.access.revoke.retry',
          eventId: row.id,
          attempts: row.attempts,
          code: 'PUBLISH_FAILED',
        });
      }
    } catch {
      this.logger.error({ event: 'user.access.revoke.storage', code: 'STORAGE_UNAVAILABLE' });
    } finally {
      this.running = false;
    }
  }
}
