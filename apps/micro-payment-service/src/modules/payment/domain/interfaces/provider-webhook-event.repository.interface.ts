import { ProviderWebhookEventEntity } from '../entities/provider-webhook-event.entity';
import { ProviderCode } from '../value-objects/provider-code.value-object';

export type ProviderEventLookup = {
  provider: ProviderCode;
  providerEventId: string;
};

export type ProviderEventClaim = ProviderEventLookup & {
  maxAttempts: number;
};

export type TimedOutProviderEventClaim = {
  staleBefore: Date;
  maxAttempts: number;
  limit: number;
};

export abstract class IProviderWebhookEventRepository {
  abstract insert(event: ProviderWebhookEventEntity): Promise<void>;
  abstract save(event: ProviderWebhookEventEntity): Promise<void>;
  abstract findByProviderEventId(
    lookup: ProviderEventLookup,
  ): Promise<ProviderWebhookEventEntity | null>;
  abstract claimForProcessing(
    claim: ProviderEventClaim,
  ): Promise<ProviderWebhookEventEntity | null>;
  abstract reclaimTimedOutProcessing(
    claim: TimedOutProviderEventClaim,
  ): Promise<ProviderWebhookEventEntity[]>;
}
