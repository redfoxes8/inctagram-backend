import { Injectable } from '@nestjs/common';
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
  RetrieveProviderCheckoutCommand,
  SynchronizeProviderNextBillingCommand,
  VerifyProviderWebhookCommand,
} from '../../application/ports/payment-provider.types';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

@Injectable()
export class PayPalPaymentProviderStrategy implements PaymentProviderStrategy {
  public readonly code = new ProviderCode('PAYPAL');

  public assertOperational(): void {
    throw this.providerNotSupportedException();
  }

  public createInitialSubscriptionCheckout(
    command: CreateInitialSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public retrieveCheckout(
    command: RetrieveProviderCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public createAdditionalSubscriptionCheckout(
    command: CreateAdditionalSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public disableAutoRenew(
    command: DisableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public enableAutoRenew(
    command: EnableProviderAutoRenewCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public synchronizeNextBilling(
    command: SynchronizeProviderNextBillingCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public getSubscriptionState(
    command: GetProviderSubscriptionStateCommand,
  ): Promise<ProviderSubscriptionState> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  public verifyAndParseWebhook(
    command: VerifyProviderWebhookCommand,
  ): Promise<NormalizedProviderEvent> {
    void command;
    return Promise.reject(this.providerNotSupportedException());
  }

  private providerNotSupportedException(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'PayPal payments are not available yet',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.PROVIDER_NOT_SUPPORTED,
        },
      ],
    });
  }
}
