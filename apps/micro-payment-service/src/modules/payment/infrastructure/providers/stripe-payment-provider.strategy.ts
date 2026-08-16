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
  RetrieveProviderCheckoutCommand,
  SynchronizeProviderNextBillingCommand,
  VerifyProviderWebhookCommand,
} from '../../application/ports/payment-provider.types';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import { STRIPE_CLIENT, STRIPE_STRATEGY_CONFIGURATION } from './stripe-client.provider';
import type { StripeStrategyConfiguration } from './stripe-client.provider';
import { StripeErrorMapper } from './stripe-error.mapper';

@Injectable()
export class StripePaymentProviderStrategy implements PaymentProviderStrategy {
  public readonly code = new ProviderCode('STRIPE');

  constructor(
    @Inject(STRIPE_CLIENT) private readonly client: Stripe,
    @Inject(STRIPE_STRATEGY_CONFIGURATION)
    private readonly configuration: StripeStrategyConfiguration,
  ) {}

  public assertOperational(): void {
    if (this.configuration.environment !== 'test') {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Payment provider environment is not supported',
      });
    }
  }

  public async createInitialSubscriptionCheckout(
    command: CreateInitialSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    this.assertOperational();
    try {
      const providerCustomerId = command.providerCustomerId ?? (await this.createCustomer(command));
      const session = await this.client.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: providerCustomerId,
          line_items: [{ price: command.providerBillingId, quantity: 1 }],
          success_url: command.successUrl,
          cancel_url: command.cancelUrl,
          metadata: this.correlationMetadata(command),
          subscription_data: { metadata: this.correlationMetadata(command) },
        },
        { idempotencyKey: command.providerIdempotencyKey },
      );
      return this.validatedCheckoutResult({
        session: await this.retrieveExpandedSession(session.id),
        expectedProviderCustomerId: providerCustomerId,
        expectedProviderBillingId: command.providerBillingId,
        amountMinor: command.amountMinor,
        currency: command.currency,
      });
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw StripeErrorMapper.toDomainException(error);
    }
  }

  public async retrieveCheckout(
    command: RetrieveProviderCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    this.assertOperational();
    try {
      return this.validatedCheckoutResult({
        session: await this.retrieveExpandedSession(command.providerCheckoutId),
        expectedProviderCustomerId: command.expectedProviderCustomerId,
        expectedProviderBillingId: command.expectedProviderBillingId,
        amountMinor: command.amountMinor,
        currency: command.currency,
      });
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw StripeErrorMapper.toDomainException(error);
    }
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

  private async createCustomer(command: CreateInitialSubscriptionCheckoutCommand): Promise<string> {
    const customer = await this.client.customers.create(
      {
        metadata: {
          application: 'inctagram',
          environment: this.configuration.environment,
          userId: command.userId,
        },
      },
      { idempotencyKey: command.providerCustomerIdempotencyKey },
    );
    if (customer.livemode) throw this.invalidProviderResult();
    return customer.id;
  }

  private correlationMetadata(
    command: CreateInitialSubscriptionCheckoutCommand,
  ): Stripe.MetadataParam {
    return {
      localCheckoutSessionId: command.localCheckoutSessionId,
      userId: command.userId,
      productId: command.productId,
      purpose: 'INITIAL_SUBSCRIPTION',
    };
  }

  private retrieveExpandedSession(providerCheckoutId: string): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.retrieve(providerCheckoutId, {
      expand: ['line_items.data.price'],
    });
  }

  private validatedCheckoutResult(input: {
    session: Stripe.Checkout.Session;
    expectedProviderCustomerId: string;
    expectedProviderBillingId: string;
    amountMinor: number;
    currency: string;
  }): CheckoutCreationResult {
    const customerId =
      typeof input.session.customer === 'string'
        ? input.session.customer
        : input.session.customer?.id;
    const price = input.session.line_items?.data[0]?.price;
    const priceId = typeof price === 'string' ? price : price?.id;
    if (
      input.session.livemode ||
      input.session.mode !== 'subscription' ||
      customerId !== input.expectedProviderCustomerId ||
      priceId !== input.expectedProviderBillingId ||
      input.session.amount_total !== input.amountMinor ||
      input.session.currency?.toUpperCase() !== input.currency ||
      !input.session.url
    ) {
      throw this.invalidProviderResult();
    }
    return {
      providerCheckoutId: input.session.id,
      checkoutUrl: input.session.url,
      providerCustomerId: input.expectedProviderCustomerId,
      expiresAt: input.session.expires_at
        ? new Date(input.session.expires_at * 1_000).toISOString()
        : null,
    };
  }

  private invalidProviderResult(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Payment provider returned an inconsistent checkout result',
    });
  }
}
