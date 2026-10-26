import {
  BACKGROUND_IDLE_MS,
  BACKGROUND_RETRY_MS,
  OUTBOX_DRAIN_LIMIT,
  OUTBOX_CONTINUE_MS,
} from '../../../../../../libs/common/src/constants/background-polling';
import { listenForPostPublished } from './post-published-wakeup';
import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PostConfig } from '../../../core/post.config';
import { PaymentProfileConfirmPublisher } from '../../../../../../libs/common/src/messaging/payment-profile-confirm-publisher';
import {
  parsePostPublishedV1,
  POST_PUBLISHED_ROUTING_KEY,
} from '../../../../../../libs/contracts/src/events/post-published-v1.event';

type ClaimedPost = { id: string; postId: string; payload: unknown; attempts: number };

@Injectable()
export class PostPublishedRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostPublishedRelay.name);
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
    config: PostConfig,
  ) {
    this.publisher = new PaymentProfileConfirmPublisher(config.rabbitUrl);
  }

  onModuleInit(): void {
    this.unsubscribe = listenForPostPublished({ client: this.prisma, wake: () => this.wake() });
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
      // Claim only one row: at concurrency1 a 5s publish cannot consume a later row's 30s lease.
      const rows = await this.prisma.$queryRaw<ClaimedPost[]>`
        UPDATE "PostPublishedOutbox"
        SET "leaseId" = ${leaseId}::uuid, "leaseUntil" = clock_timestamp() + interval '30 seconds',
            "attempts" = CASE WHEN "attempts" < 2147483647 THEN "attempts" + 1 ELSE "attempts" END
        WHERE "id" IN (
          SELECT "id" FROM "PostPublishedOutbox"
          WHERE "publishedAt" IS NULL AND "availableAt" <= clock_timestamp()
            AND ("leaseUntil" IS NULL OR "leaseUntil" <= clock_timestamp())
          ORDER BY "availableAt", "createdAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING "id", "postId", "payload", "attempts"
      `;
      const row = rows[0];
      if (!row || this.stopped) return 'EMPTY';
      let event: ReturnType<typeof parsePostPublishedV1>;
      try {
        event = parsePostPublishedV1(row.payload);
        if (event.eventId.toLowerCase() !== row.id || event.postId.toLowerCase() !== row.postId)
          throw new Error();
      } catch {
        await this.retry({ row, leaseId, code: 'INVALID_EVENT' });
        return 'RETRY';
      }
      try {
        // The saved payload is immutable across retries; no Post/Profile lookup or network inside a tx.
        await this.publisher.publish({
          routingKey: POST_PUBLISHED_ROUTING_KEY,
          messageId: event.eventId,
          content: Buffer.from(JSON.stringify(row.payload)),
        });
      } catch {
        await this.retry({ row, leaseId, code: 'PUBLISH_FAILED' });
        return 'RETRY';
      }
      const changed = await this.prisma.$executeRaw`
        UPDATE "PostPublishedOutbox" SET "publishedAt" = clock_timestamp(),
          "leaseId" = NULL, "leaseUntil" = NULL, "lastErrorCode" = NULL
        WHERE "id" = ${row.id}::uuid AND "leaseId" = ${leaseId}::uuid
          AND "leaseUntil" > clock_timestamp() AND "publishedAt" IS NULL
      `;
      if (changed !== 1) this.logger.warn({ event: 'post.published.complete', code: 'LEASE_LOST' });
      this.failures = 0;
      this.retryAt = 0;
      return 'PUBLISHED';
    } catch {
      this.pauseAfterFailure();
      this.logger.error({ event: 'post.published.storage', code: 'STORAGE_UNAVAILABLE' });
      return 'RETRY';
    }
  }

  private async retry(input: {
    row: ClaimedPost;
    leaseId: string;
    code: 'INVALID_EVENT' | 'PUBLISH_FAILED';
  }): Promise<void> {
    this.pauseAfterFailure();
    const delay = Math.min(60000, 1000 * 2 ** Math.min(input.row.attempts, 6));
    await this.prisma.$executeRaw`
      UPDATE "PostPublishedOutbox" SET "leaseId" = NULL, "leaseUntil" = NULL,
        "availableAt" = clock_timestamp() + ${delay} * interval '1 millisecond', "lastErrorCode" = ${input.code}
      WHERE "id" = ${input.row.id}::uuid AND "leaseId" = ${input.leaseId}::uuid
        AND "leaseUntil" > clock_timestamp() AND "publishedAt" IS NULL
    `;
    this.logger.warn({ event: 'post.published.retry', code: input.code });
  }
}
