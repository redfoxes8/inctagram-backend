import { BillingInterval } from '../enums/billing-interval.enum';
import { SubscriptionStatus } from '../enums/subscription-status.enum';
import { SubscriptionEntity } from '../entities/subscription.entity';

export type SubscriptionReminderBackfillCursor = Readonly<{
  status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
  endsAt: Date;
  id: string;
}>;

export type SubscriptionReminderBackfillCandidate = Readonly<{
  id: string;
  userId: string;
  endsAt: Date;
}>;

export type SubscriptionReminderBackfillPeriod = Readonly<{
  subscription: SubscriptionEntity;
  billingInterval: BillingInterval;
  immediateSuccessor: SubscriptionEntity | null;
}>;

export abstract class ISubscriptionReminderBackfillRepository {
  abstract findCandidatePage(input: {
    status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
    now: Date;
    cursor: SubscriptionReminderBackfillCursor | null;
    limit: number;
  }): Promise<SubscriptionReminderBackfillCandidate[]>;
  abstract findAuthoritativePeriods(input: {
    ids: string[];
    status: SubscriptionStatus.ACTIVE | SubscriptionStatus.QUEUED;
    now: Date;
  }): Promise<SubscriptionReminderBackfillPeriod[]>;
}
