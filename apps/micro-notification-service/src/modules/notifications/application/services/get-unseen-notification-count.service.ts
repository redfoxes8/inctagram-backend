import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { INotificationHistoryPort } from '../ports/notification-history.port';

@Injectable()
export class GetUnseenNotificationCountService {
  constructor(private readonly history: INotificationHistoryPort) {}

  public async execute(userId: string): Promise<number> {
    if (!isUUID(userId)) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Notification user identifier is invalid',
      });
    }
    return this.history.countUnseen(userId);
  }
}
