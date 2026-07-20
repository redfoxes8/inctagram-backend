import { SubscriptionEntity } from '../entities/subscription.entity';

export abstract class ISubscriptionRepository {
  abstract save(subscriptionDomain: SubscriptionEntity): Promise<void>;

  abstract findById(id: string): Promise<SubscriptionEntity | null>;

  abstract findAllByUserId(id: string): Promise<SubscriptionEntity[] | null>;

  abstract findActiveByUserId(id: string): Promise<SubscriptionEntity[] | null>;

  abstract findByPlanId(id: string): Promise<SubscriptionEntity[] | null>;

  abstract findExpired(): Promise<SubscriptionEntity[] | null>;

  abstract deleteById(id: string): Promise<void>;
}
