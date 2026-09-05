import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import type { NotificationHistoryItem } from '../ports/notification-history.port';
import { INotificationHistoryPort } from '../ports/notification-history.port';
import { NotificationCursorCodec } from './notification-cursor.codec';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type GetNotificationsResult = Readonly<{
  items: NotificationHistoryItem[];
  nextCursor: string | null;
}>;

@Injectable()
export class GetNotificationsService {
  constructor(private readonly history: INotificationHistoryPort) {}

  public async execute(input: {
    userId: string;
    cursor: string | undefined;
    pageSize: number;
    now: Date;
  }): Promise<GetNotificationsResult> {
    this.assertUserId(input.userId);
    const cursor = input.cursor ? NotificationCursorCodec.decode(input.cursor) : null;
    const pageSize = this.pageSize(input.pageSize);
    const { monthStartUtc, nextMonthStartUtc } = this.monthBoundaries(input.now);
    const page = await this.history.findPage({
      userId: input.userId,
      monthStartUtc,
      nextMonthStartUtc,
      cursor,
      take: pageSize + 1,
    });
    const items = page.items.slice(0, pageSize);
    const nextCursor =
      page.items.length > pageSize && items.length > 0
        ? NotificationCursorCodec.encode({
            createdAt: items.at(-1)!.createdAt,
            id: items.at(-1)!.id,
          })
        : null;
    return { items, nextCursor };
  }

  private pageSize(value: number): number {
    if (value === 0) return DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Notification page size must be between 1 and 100',
      });
    }
    return value;
  }

  private monthBoundaries(now: Date): { monthStartUtc: Date; nextMonthStartUtc: Date } {
    if (!Number.isFinite(now.getTime())) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Notification clock returned an invalid time',
      });
    }
    const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { monthStartUtc, nextMonthStartUtc };
  }

  private assertUserId(userId: string): void {
    if (isUUID(userId)) return;
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Notification user identifier is invalid',
    });
  }
}
