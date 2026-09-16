import { Injectable } from '@nestjs/common';

import { INotificationPersistencePort } from '../ports/notification-persistence.port';
import type {
  PersistRequestedNotificationInput,
  PersistRequestedNotificationResult,
} from '../types/persist-requested-notification.types';

@Injectable()
export class PersistRequestedNotificationService {
  constructor(private readonly persistence: INotificationPersistencePort) {}

  public async execute(
    input: PersistRequestedNotificationInput,
  ): Promise<PersistRequestedNotificationResult> {
    return this.persistence.persist(input);
  }
}
