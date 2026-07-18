import { SubscriptionEntity } from '../entities/subscription.entity';

export abstract class ISubscriptionRepository {
  abstract save(subscriptionDomain: SubscriptionEntity): void;

  abstract findById(id: string): SubscriptionEntity;

  abstract findAllByUserId(id: string): SubscriptionEntity[];

  abstract findActiveByUserId(id: string): SubscriptionEntity;

  abstract findByPlanId(id: string): SubscriptionEntity[];

  abstract findExpired(): SubscriptionEntity[];

  abstract deleteById(): void;
}
