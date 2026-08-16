import { SubscriptionEntity } from '../entities/subscription.entity';
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

export abstract class ISubscriptionRepository {
  abstract insert(subscription: SubscriptionEntity): Promise<void>;
  abstract save(subscription: SubscriptionEntity): Promise<void>;
  abstract findOwnedById(lookup: OwnedSubscriptionLookup): Promise<SubscriptionEntity | null>;
  abstract findActiveByUserId(userId: string): Promise<SubscriptionEntity | null>;
  abstract findOrderedUnfinishedByUserId(userId: string): Promise<SubscriptionEntity[]>;
  abstract findTailByUserId(userId: string): Promise<SubscriptionEntity | null>;
  abstract claimDueActive(claim: DueActiveSubscriptionClaim): Promise<SubscriptionEntity[]>;
  abstract findByProviderSubscriptionId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<SubscriptionEntity | null>;
  abstract findByProviderScheduleId(
    lookup: SubscriptionProviderIdentifierLookup,
  ): Promise<SubscriptionEntity | null>;
}
