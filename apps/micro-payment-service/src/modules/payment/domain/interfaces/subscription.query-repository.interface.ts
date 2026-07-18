import { SubscriptionEntity } from '../entities/subscription.entity';

export abstract class ISubscriptionQueryRepository {
  abstract findById(id: string): SubscriptionEntity;

  abstract findAllByUserId(id: string): SubscriptionEntity[];
}
