import { TargetSubscriptionEntity } from '../entities/target-subscription.entity';
import { ProviderCode } from '../value-objects/provider-code.value-object';

export type OwnedSubscriptionLookup = {
  id: string;
  userId: string;
};

export type SubscriptionProviderIdentifierLookup = {
  provider: ProviderCode;
  providerIdentifier: string;
};

export type DueActiveSubscriptionClaim = {
  dueAt: Date;
  limit: number;
};

export abstract class ITargetSubscriptionRepository {
  abstract insert(subscription: TargetSubscriptionEntity): Promise<void>;
  abstract save(subscription: TargetSubscriptionEntity): Promise<void>;
  abstract findOwnedById(lookup: OwnedSubscriptionLookup): Promise<TargetSubscriptionEntity | null>;
  abstract findActiveByUserId(userId: string): Promise<TargetSubscriptionEntity | null>;
  abstract findOrderedUnfinishedByUserId(userId: string): Promise<TargetSubscriptionEntity[]>;
  abstract findTailByUserId(userId: string): Promise<TargetSubscriptionEntity | null>;
  abstract claimDueActive(claim: DueActiveSubscriptionClaim): Promise<TargetSubscriptionEntity[]>;
  abstract findByProviderSubscriptionId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<TargetSubscriptionEntity | null>;
  abstract findByProviderScheduleId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<TargetSubscriptionEntity | null>;
}
