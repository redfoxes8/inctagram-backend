import { SubscriptionEntity } from '../entities/subscription.entity';

export abstract class ISubscriptionQueryRepository {
  abstract findById(id: string): Promise<SubscriptionEntity | null>;

  abstract findAllByUserId(id: string): Promise<SubscriptionEntity[] | null>;
}
