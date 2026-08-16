import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import {
  CheckoutCreationResult,
  CreateAdditionalSubscriptionCheckoutCommand,
  CreateInitialSubscriptionCheckoutCommand,
  DisableProviderAutoRenewCommand,
  EnableProviderAutoRenewCommand,
  GetProviderSubscriptionStateCommand,
  NormalizedProviderEvent,
  ProviderSubscriptionState,
  SynchronizeProviderNextBillingCommand,
  VerifyProviderWebhookCommand,
} from './payment-provider.types';

/**
 * Implementations throw DomainException rather than false/null result sentinels.
 * Invalid signatures map to BadRequest, unavailable providers to ServiceUnavailable,
 * timeouts to GatewayTimeout, and safe provider rejections to BadRequest or Conflict.
 * An ambiguous provider timeout must not change confirmed local renewal state.
 * PAYMENT_PROVIDER_ERROR_REASON supplies safe reason identifiers without adding
 * a parallel exception hierarchy.
 */
export abstract class PaymentProviderStrategy {
  abstract readonly code: ProviderCode;

  abstract createInitialSubscriptionCheckout(
    command: CreateInitialSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult>;

  abstract createAdditionalSubscriptionCheckout(
    command: CreateAdditionalSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult>;

  abstract disableAutoRenew(
    command: DisableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState>;

  abstract enableAutoRenew(
    command: EnableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState>;

  abstract synchronizeNextBilling(
    command: SynchronizeProviderNextBillingCommand,
  ): Promise<ProviderSubscriptionState>;

  abstract getSubscriptionState(
    command: GetProviderSubscriptionStateCommand,
  ): Promise<ProviderSubscriptionState>;

  abstract verifyAndParseWebhook(
    command: VerifyProviderWebhookCommand,
  ): Promise<NormalizedProviderEvent>;
}
