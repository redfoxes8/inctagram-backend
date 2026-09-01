import { Injectable } from '@nestjs/common';

import { Prisma, OutboxStatus } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  ClaimedPaymentOutboxEvent,
  IPaymentOutboxRelayRepository,
  PaymentOutboxClaimOptions,
  PaymentOutboxFailureOptions,
} from '../../application/ports/payment-outbox-relay.port';
import { normalizeProviderWebhookPayload } from '../../domain/specifications/provider-webhook-payload.specification';

type ClaimedOutboxRow = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  routingKey: string;
  payload: Prisma.JsonValue;
  attempts: number;
  occurredAt: Date;
};

@Injectable()
export class PaymentOutboxRelayRepository implements IPaymentOutboxRelayRepository {
  constructor(private readonly prisma: PrismaService) {}

  public claim(options: PaymentOutboxClaimOptions): Promise<ClaimedPaymentOutboxEvent[]> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "outbox_events"
        SET
          "status" = CASE
            WHEN "attempts" >= ${options.maxAttempts}
              THEN 'FAILED'::"OutboxStatus"
            ELSE 'PENDING'::"OutboxStatus"
          END,
          "available_at" = CASE
            WHEN "attempts" >= ${options.maxAttempts} THEN "available_at"
            ELSE ${options.now}
          END,
          "locked_at" = NULL,
          "locked_by" = NULL,
          "last_error" = 'OUTBOX_CLAIM_TIMED_OUT'
        WHERE "status" = 'PROCESSING'::"OutboxStatus"
          AND "locked_at" < ${options.staleBefore}
      `);

      const rows = await transaction.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
        WITH "eligible" AS (
          SELECT "id"
          FROM "outbox_events"
          WHERE "status" = 'PENDING'::"OutboxStatus"
            AND "available_at" <= ${options.now}
            AND "attempts" < ${options.maxAttempts}
          ORDER BY "occurred_at" ASC, "id" ASC
          LIMIT ${options.batchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "outbox_events" AS "event"
        SET
          "status" = 'PROCESSING'::"OutboxStatus",
          "attempts" = "event"."attempts" + 1,
          "locked_at" = ${options.now},
          "locked_by" = ${options.workerId},
          "last_error" = NULL
        FROM "eligible"
        WHERE "event"."id" = "eligible"."id"
        RETURNING
          "event"."id",
          "event"."aggregate_type" AS "aggregateType",
          "event"."aggregate_id" AS "aggregateId",
          "event"."event_type" AS "eventType",
          "event"."event_version" AS "eventVersion",
          "event"."routing_key" AS "routingKey",
          "event"."payload",
          "event"."attempts",
          "event"."occurred_at" AS "occurredAt"
      `);

      return rows.map((row) => ({
        ...row,
        payload: normalizeProviderWebhookPayload(row.payload),
      }));
    });
  }

  public async markPublished(id: string, workerId: string, publishedAt: Date): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: OutboxStatus.PROCESSING, lockedBy: workerId },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
    return result.count === 1;
  }

  public async markFailedOrRetry(options: PaymentOutboxFailureOptions): Promise<boolean> {
    const safeError = this.safeError(options.safeError);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "outbox_events"
      SET
        "status" = CASE
          WHEN "attempts" >= ${options.maxAttempts}
            THEN 'FAILED'::"OutboxStatus"
          ELSE 'PENDING'::"OutboxStatus"
        END,
        "available_at" = CASE
          WHEN "attempts" >= ${options.maxAttempts} THEN "available_at"
          ELSE ${options.now}::timestamptz + (
            LEAST(
              86400,
              ${options.baseBackoffSeconds} * POWER(2, GREATEST("attempts" - 1, 0))
            ) * INTERVAL '1 second'
          )
        END,
        "locked_at" = NULL,
        "locked_by" = NULL,
        "last_error" = ${safeError}
      WHERE "id" = ${options.id}::uuid
        AND "status" = 'PROCESSING'::"OutboxStatus"
        AND "locked_by" = ${options.workerId}
      RETURNING "id"
    `);
    return rows.length === 1;
  }

  private safeError(value: string): string {
    const hasControlCharacter = Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (!value || value.length > 500 || hasControlCharacter) {
      return 'OUTBOX_PUBLISH_FAILED';
    }
    return value;
  }
}
