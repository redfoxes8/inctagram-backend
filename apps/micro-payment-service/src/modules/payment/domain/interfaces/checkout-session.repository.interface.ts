import { CheckoutSessionEntity } from '../entities/checkout-session.entity';
import { IdempotencyKey } from '../value-objects/idempotency-key.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

export type FindCheckoutByProviderId = {
  provider: ProviderCode;
  providerCheckoutId: string;
};

export abstract class ICheckoutSessionRepository {
  abstract insert(checkoutSession: CheckoutSessionEntity): Promise<void>;
  abstract save(checkoutSession: CheckoutSessionEntity): Promise<void>;
  abstract findById(id: string): Promise<CheckoutSessionEntity | null>;
  abstract findByIdempotencyKey(key: IdempotencyKey): Promise<CheckoutSessionEntity | null>;
  abstract findByProviderCheckoutId(
    lookup: FindCheckoutByProviderId,
  ): Promise<CheckoutSessionEntity | null>;
}
