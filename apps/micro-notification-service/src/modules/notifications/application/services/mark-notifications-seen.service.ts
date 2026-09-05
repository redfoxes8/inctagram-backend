import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { NotificationClock } from '../ports/notification-clock.port';
import { INotificationHistoryPort } from '../ports/notification-history.port';

export type MarkNotificationsSeenResult = Readonly<{
  seenThrough: Date;
  unseenCount: number;
}>;

@Injectable()
export class MarkNotificationsSeenService {
  constructor(
    private readonly history: INotificationHistoryPort,
    private readonly clock: NotificationClock,
  ) {}

  public async execute(userId: string): Promise<MarkNotificationsSeenResult> {
    if (!isUUID(userId)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Notification user identifier is invalid',
      });
    }
    const seenThrough = this.clock.now();
    if (!Number.isFinite(seenThrough.getTime())) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Notification clock returned an invalid time',
      });
    }
    const unseenCount = await this.history.markSeenAndCount({ userId, seenThrough });
    return { seenThrough, unseenCount };
  }
}
