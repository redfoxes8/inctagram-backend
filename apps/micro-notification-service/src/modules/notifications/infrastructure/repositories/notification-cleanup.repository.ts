import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../core/prisma/client';
import { NotificationPrismaService } from '../../../../core/prisma/prisma.service';

@Injectable()
export class NotificationCleanupRepository {
  constructor(private readonly prisma: NotificationPrismaService) {}

  public async deleteExpired(input: { retentionDays: number; batchSize: number }): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const [result] = await transaction.$queryRaw<Readonly<{ count: number }>[]>(Prisma.sql`
        WITH candidates AS (
          SELECT notification."id"
          FROM "Notification" AS notification
          WHERE notification."createdAt" < transaction_timestamp() - make_interval(days => ${input.retentionDays})
            AND NOT EXISTS (
              SELECT 1
              FROM "NotificationOutbox" AS outbox
              WHERE outbox."aggregateId" = notification."id"
                AND outbox."status" IN (
                  'PENDING'::"NotificationOutboxStatus",
                  'PROCESSING'::"NotificationOutboxStatus",
                  'FAILED'::"NotificationOutboxStatus"
                )
            )
          ORDER BY notification."createdAt", notification."id"
          LIMIT ${input.batchSize}
          FOR UPDATE SKIP LOCKED
        ), deleted AS (
          DELETE FROM "Notification" AS notification
          USING candidates
          WHERE notification."id" = candidates."id"
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `);
      return result?.count ?? 0;
    });
  }
}
