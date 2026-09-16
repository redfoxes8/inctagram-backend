import { Injectable } from '@nestjs/common';

import {
  NotificationOutboxStatus,
  Prisma,
  type NotificationOutbox,
} from '../../../../core/prisma/client';
import { NotificationPrismaService } from '../../../../core/prisma/prisma.service';

export type NotificationOutboxClaimOptions = Readonly<{
  workerId: string;
  now: Date;
  batchSize: number;
  maxAttempts: number;
}>;

export type NotificationOutboxFailureOptions = Readonly<{
  id: string;
  workerId: string;
  now: Date;
  errorCode: string;
  retryDelayMs: number;
}>;

@Injectable()
export class NotificationOutboxRepository {
  constructor(private readonly prisma: NotificationPrismaService) {}

  public async claimByEventId(
    options: NotificationOutboxClaimOptions & { eventId: string },
  ): Promise<NotificationOutbox | null> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.notificationOutbox.updateMany({
        where: {
          eventId: options.eventId,
          status: { in: [NotificationOutboxStatus.PENDING, NotificationOutboxStatus.FAILED] },
          availableAt: { lte: options.now },
          attempts: { lt: options.maxAttempts },
        },
        data: {
          status: NotificationOutboxStatus.PROCESSING,
          lockedAt: options.now,
          lockedBy: options.workerId,
        },
      });
      if (claimed.count !== 1) return null;
      return transaction.notificationOutbox.findUnique({ where: { eventId: options.eventId } });
    });
  }

  public async claimDue(options: NotificationOutboxClaimOptions): Promise<NotificationOutbox[]> {
    return this.prisma.$transaction(async (transaction) => {
      const ids = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id"
        FROM "NotificationOutbox"
        WHERE "status" IN ('PENDING', 'FAILED')
          AND "availableAt" <= ${options.now}
          AND "attempts" < ${options.maxAttempts}
        ORDER BY "occurredAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${options.batchSize}
      `);
      if (ids.length === 0) return [];
      const outboxIds = ids.map((item) => item.id);
      await transaction.notificationOutbox.updateMany({
        where: { id: { in: outboxIds } },
        data: {
          status: NotificationOutboxStatus.PROCESSING,
          lockedAt: options.now,
          lockedBy: options.workerId,
        },
      });
      return transaction.notificationOutbox.findMany({
        where: { id: { in: outboxIds } },
        orderBy: { occurredAt: 'asc' },
      });
    });
  }

  public async markPublished(id: string, workerId: string, now: Date): Promise<boolean> {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: { id, status: NotificationOutboxStatus.PROCESSING, lockedBy: workerId },
      data: {
        status: NotificationOutboxStatus.PUBLISHED,
        publishedAt: now,
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
      },
    });
    return result.count === 1;
  }

  public async markFailed(options: NotificationOutboxFailureOptions): Promise<boolean> {
    const result = await this.prisma.notificationOutbox.updateMany({
      where: {
        id: options.id,
        status: NotificationOutboxStatus.PROCESSING,
        lockedBy: options.workerId,
      },
      data: {
        status: NotificationOutboxStatus.FAILED,
        attempts: { increment: 1 },
        availableAt: new Date(options.now.getTime() + options.retryDelayMs),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: options.errorCode,
      },
    });
    return result.count === 1;
  }
}
