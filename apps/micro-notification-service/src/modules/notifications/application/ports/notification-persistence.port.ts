import type {
  PersistRequestedNotificationInput,
  PersistRequestedNotificationResult,
} from '../types/persist-requested-notification.types';

export abstract class INotificationPersistencePort {
  abstract persist(
    input: PersistRequestedNotificationInput,
  ): Promise<PersistRequestedNotificationResult>;
}
