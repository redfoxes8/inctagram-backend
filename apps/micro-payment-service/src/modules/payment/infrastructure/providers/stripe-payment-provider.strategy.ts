import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentProviderStrategy } from '../../application/ports/payment-provider.strategy';
import {
  CheckoutCreationResult,
  CreateAdditionalSubscriptionCheckoutCommand,
  CreateInitialSubscriptionCheckoutCommand,
  DisableProviderAutoRenewCommand,
  EnableProviderAutoRenewCommand,
  GetProviderSubscriptionStateCommand,
  NormalizedProviderEvent,
  PAYMENT_PROVIDER_ERROR_REASON,
  ProviderSubscriptionState,
  SynchronizeProviderNextBillingCommand,
  VerifyProviderWebhookCommand,
} from '../../application/ports/payment-provider.types';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import { STRIPE_CLIENT, STRIPE_STRATEGY_CONFIGURATION } from './stripe-client.provider';
import type { StripeStrategyConfiguration } from './stripe-client.provider';

@Injectable()
export class StripePaymentProviderStrategy implements PaymentProviderStrategy {
  public readonly code = new ProviderCode('STRIPE');

  constructor(
    @Inject(STRIPE_CLIENT) private readonly client: Stripe,
    @Inject(STRIPE_STRATEGY_CONFIGURATION)
    private readonly configuration: StripeStrategyConfiguration,
  ) {}

  public createInitialSubscriptionCheckout(
    command: CreateInitialSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public createAdditionalSubscriptionCheckout(
    command: CreateAdditionalSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public disableAutoRenew(
    command: DisableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public enableAutoRenew(
    command: EnableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public synchronizeNextBilling(
    command: SynchronizeProviderNextBillingCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public getSubscriptionState(
    command: GetProviderSubscriptionStateCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  public verifyAndParseWebhook(
    command: VerifyProviderWebhookCommand,
  ): Promise<NormalizedProviderEvent> {
    void command;
    return Promise.reject(this.operationNotReadyException());
  }

  private operationNotReadyException(): DomainException {
    void this.client;
    void this.configuration.environment;
    return new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_OPERATION_NOT_READY,
    });
  }
}
