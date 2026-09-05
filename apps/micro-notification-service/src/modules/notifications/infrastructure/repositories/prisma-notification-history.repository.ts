import { Injectable } from '@nestjs/common';

import type { PaymentNotificationType } from '../../../../../../../libs/contracts/src/events/notification-events-v1.event';
import { NotificationPrismaService } from '../../../../core/prisma/prisma.service';
import {
  NotificationType as PrismaNotificationType,
  Prisma,
  type Notification,
} from '../../../../core/prisma/client';
import {
  INotificationHistoryPort,
  type NotificationHistoryItem,
  type NotificationHistoryPage,
} from '../../application/ports/notification-history.port';

@Injectable()
export class PrismaNotificationHistoryRepository extends INotificationHistoryPort {
  constructor(private readonly prisma: NotificationPrismaService) {
    super();
  }

  public async findPage(input: {
    userId: string;
    monthStartUtc: Date;
    nextMonthStartUtc: Date;
    cursor: { createdAt: Date; id: string } | null;
    take: number;
  }): Promise<NotificationHistoryPage> {
    const cursorPredicate: Prisma.NotificationWhereInput | undefined = input.cursor
      ? {
          OR: [
            { createdAt: { lt: input.cursor.createdAt } },
            { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
          ],
        }
      : undefined;
    const records = await this.prisma.notification.findMany({
      where: {
        userId: input.userId,
        createdAt: { gte: input.monthStartUtc, lt: input.nextMonthStartUtc },
        ...(cursorPredicate ?? {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.take,
    });
    return { items: records.map((record) => this.item(record)) };
  }

  public countUnseen(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, seenAt: null } });
  }

  public markSeenAndCount(input: { userId: string; seenThrough: Date }): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.notification.updateMany({
        where: {
          userId: input.userId,
          seenAt: null,
          createdAt: { lte: input.seenThrough },
        },
        data: { seenAt: input.seenThrough },
      });
      return transaction.notification.count({
        where: { userId: input.userId, seenAt: null },
      });
    });
  }

  private item(record: Notification): NotificationHistoryItem {
    return {
      id: record.id,
      type: this.type(record.type),
      subscriptionId: record.subscriptionId,
      providerInvoiceId: record.providerInvoiceId,
      effectiveAt: record.effectiveAt,
      subscriptionEndsAt: record.subscriptionEndsAt,
      reasonCode: record.reasonCode,
      createdAt: record.createdAt,
      seenAt: record.seenAt,
    };
  }

  private type(value: PrismaNotificationType): PaymentNotificationType {
    const types: Readonly<Record<PrismaNotificationType, PaymentNotificationType>> = {
      SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
      SUBSCRIPTION_EXTENDED: 'SUBSCRIPTION_EXTENDED',
      UPCOMING_PAYMENT: 'UPCOMING_PAYMENT',
      SUBSCRIPTION_EXPIRING: 'SUBSCRIPTION_EXPIRING',
      PAYMENT_FAILED: 'PAYMENT_FAILED',
      PAYMENT_RECOVERED: 'PAYMENT_RECOVERED',
      SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
    };
    return types[value];
  }
}
