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
  private failures = 0;
  private nextAttemptAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    config: PostConfig,
  ) {
    this.publisher = new PaymentProfileConfirmPublisher(config.rabbitUrl);
  }

  onModuleInit(): void {
    this.schedule();
  }

  async relay(): Promise<void> {
    if (this.stopped || this.running || Date.now() < this.nextAttemptAt) return;
    this.running = this.deliver();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (async (): Promise<void> => {
      await this.running?.catch(() => undefined);
      await this.publisher.close();
    })();
    try {
      await Promise.race([
        cleanup,
        new Promise<void>((resolve) => {
          deadline = setTimeout(() => {
            this.logger.warn({ event: 'post.published.shutdown', code: 'DRAIN_TIMEOUT' });
            void this.publisher.close().catch(() => undefined);
            resolve();
          }, 10000);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.relay().finally(() => this.schedule());
    }, 1000);
    this.timer.unref();
  }

  private pauseAfterFailure(): void {
    this.failures = Math.min(this.failures + 1, 6);
    this.nextAttemptAt = Date.now() + Math.min(60000, 1000 * 2 ** this.failures);
  }

  private async deliver(): Promise<void> {
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
      if (!row || this.stopped) return;
      let event: ReturnType<typeof parsePostPublishedV1>;
      try {
        event = parsePostPublishedV1(row.payload);
        if (event.eventId.toLowerCase() !== row.id || event.postId.toLowerCase() !== row.postId)
          throw new Error();
      } catch {
        await this.retry({ row, leaseId, code: 'INVALID_EVENT' });
        return;
      }
      try {
        // The saved payload is immutable across retries; no Post/Profile lookup or network inside a tx.
        await this.publisher.publish({
          routingKey: POST_PUBLISHED_ROUTING_KEY,
          messageId: event.eventId,
          content: Buffer.from(JSON.stringify(row.payload)),
        });
      } catch {
        this.pauseAfterFailure();
        await this.retry({ row, leaseId, code: 'PUBLISH_FAILED' });
        return;
      }
      const changed = await this.prisma.$executeRaw`
        UPDATE "PostPublishedOutbox" SET "publishedAt" = clock_timestamp(),
          "leaseId" = NULL, "leaseUntil" = NULL, "lastErrorCode" = NULL
        WHERE "id" = ${row.id}::uuid AND "leaseId" = ${leaseId}::uuid
          AND "leaseUntil" > clock_timestamp() AND "publishedAt" IS NULL
      `;
      if (changed !== 1) this.logger.warn({ event: 'post.published.complete', code: 'LEASE_LOST' });
      this.failures = 0;
      this.nextAttemptAt = 0;
    } catch {
      this.pauseAfterFailure();
      this.logger.error({ event: 'post.published.storage', code: 'STORAGE_UNAVAILABLE' });
    }
  }

  private async retry(input: {
    row: ClaimedPost;
    leaseId: string;
    code: 'INVALID_EVENT' | 'PUBLISH_FAILED';
  }): Promise<void> {
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
