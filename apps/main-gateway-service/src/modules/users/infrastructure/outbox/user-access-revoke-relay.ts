import {
  BACKGROUND_IDLE_MS,
  BACKGROUND_RETRY_MS,
  OUTBOX_DRAIN_LIMIT,
  OUTBOX_CONTINUE_MS,
} from '../../../../../../../libs/common/src/constants/background-polling';
import { listenForGatewayOutbox } from '../../../../core/prisma/transactions/gateway-outbox-wakeup';
import { Injectable, Logger } from '@nestjs/common';
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
    private readonly amqp: AmqpConnection,
    private readonly clock: UserAccessClock,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = listenForGatewayOutbox({
      client: this.prisma,
      outbox: 'ACCESS_REVOKE',
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
    }
  }

  private async deliver(): Promise<'EMPTY' | 'PUBLISHED' | 'RETRY'> {
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
      if (!row || this.stopped) return 'EMPTY';
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
        this.failures = 0;
        this.retryAt = 0;
        return 'PUBLISHED';
      } catch {
        this.pauseAfterFailure();
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
        return 'RETRY';
      }
    } catch {
      this.pauseAfterFailure();
      this.logger.error({ event: 'user.access.revoke.storage', code: 'STORAGE_UNAVAILABLE' });
      return 'RETRY';
    }
  }
}
