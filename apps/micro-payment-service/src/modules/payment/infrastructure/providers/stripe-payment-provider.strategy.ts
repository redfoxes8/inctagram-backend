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
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { STRIPE_CLIENT, STRIPE_STRATEGY_CONFIGURATION } from './stripe-client.provider';
import type { StripeStrategyConfiguration } from './stripe-client.provider';
import { StripeErrorMapper } from './stripe-error.mapper';
import { StripeWebhookNormalizer } from './stripe-webhook.normalizer';

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
          metadata: this.correlationMetadata(command, 'INITIAL_SUBSCRIPTION'),
          subscription_data: {
            metadata: this.correlationMetadata(command, 'INITIAL_SUBSCRIPTION'),
          },
        },
        { idempotencyKey: command.providerIdempotencyKey },
      );
      return this.validatedCheckoutResult({
        session: await this.retrieveExpandedSession(session.id),
        expectedProviderCustomerId: providerCustomerId,
        expectedProviderBillingId: command.providerBillingId,
        expectedProviderProductId: command.providerProductId,
        expectedLocalCheckoutSessionId: command.localCheckoutSessionId,
        expectedUserId: command.userId,
        expectedProductId: command.productId,
        amountMinor: command.amountMinor,
        currency: command.currency,
        checkoutPurpose: 'INITIAL_SUBSCRIPTION',
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
        expectedProviderProductId: command.expectedProviderProductId,
        expectedLocalCheckoutSessionId: command.localCheckoutSessionId,
        expectedUserId: command.userId,
        expectedProductId: command.productId,
        amountMinor: command.amountMinor,
        currency: command.currency,
        checkoutPurpose: command.checkoutPurpose,
      });
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw StripeErrorMapper.toDomainException(error);
    }
  }

  public async createAdditionalSubscriptionCheckout(
    command: CreateAdditionalSubscriptionCheckoutCommand,
  ): Promise<CheckoutCreationResult> {
    this.assertOperational();
    if (!command.providerCustomerId || !command.providerProductId) {
      throw this.invalidProviderResult();
    }
    try {
      const metadata = this.correlationMetadata(command, 'ADDITIONAL_SUBSCRIPTION');
      const session = await this.client.checkout.sessions.create(
        {
          mode: 'payment',
          customer: command.providerCustomerId,
          line_items: [
            {
              price_data: {
                currency: command.currency.toLowerCase(),
                unit_amount: command.amountMinor,
                product: command.providerProductId,
              },
              quantity: 1,
            },
          ],
          success_url: command.successUrl,
          cancel_url: command.cancelUrl,
          metadata,
          payment_intent_data: { setup_future_usage: 'off_session', metadata },
        },
        { idempotencyKey: command.providerIdempotencyKey },
      );
      return this.validatedCheckoutResult({
        session: await this.retrieveExpandedSession(session.id),
        expectedProviderCustomerId: command.providerCustomerId,
        expectedProviderBillingId: command.providerBillingId,
        expectedProviderProductId: command.providerProductId,
        expectedLocalCheckoutSessionId: command.localCheckoutSessionId,
        expectedUserId: command.userId,
        expectedProductId: command.productId,
        amountMinor: command.amountMinor,
        currency: command.currency,
        checkoutPurpose: 'ADDITIONAL_SUBSCRIPTION',
      });
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw StripeErrorMapper.toDomainException(error);
    }
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

  public async synchronizeNextBilling(
    command: SynchronizeProviderNextBillingCommand,
  ): Promise<ProviderSubscriptionState> {
    this.assertOperational();
    try {
      const paymentIntent = await this.client.paymentIntents.retrieve(
        command.confirmedProviderTransactionId,
      );
      const paymentCustomerId =
        typeof paymentIntent.customer === 'string'
          ? paymentIntent.customer
          : paymentIntent.customer?.id;
      const paymentMethodId =
        typeof paymentIntent.payment_method === 'string'
          ? paymentIntent.payment_method
          : paymentIntent.payment_method?.id;
      if (
        paymentIntent.livemode ||
        paymentIntent.status !== 'succeeded' ||
        paymentIntent.setup_future_usage !== 'off_session' ||
        paymentCustomerId !== command.providerCustomerId ||
        !paymentMethodId
      ) {
        throw this.invalidProviderResult();
      }

      await this.client.customers.update(
        command.providerCustomerId,
        { invoice_settings: { default_payment_method: paymentMethodId } },
        { idempotencyKey: `${command.providerIdempotencyKey}-customer` },
      );
      if (command.currentProviderSubscriptionId) {
        await this.client.subscriptions.update(
          command.currentProviderSubscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey: `${command.providerIdempotencyKey}-subscription` },
        );
      }
      if (command.currentProviderRenewalId) {
        const currentSchedule = await this.client.subscriptionSchedules.retrieve(
          command.currentProviderRenewalId,
        );
        if (currentSchedule.status === 'not_started') {
          await this.client.subscriptionSchedules.cancel(command.currentProviderRenewalId);
        }
      }

      const scheduleInterval = command.billingInterval === BillingInterval.WEEK ? 'week' : 'month';

      const schedule = await this.client.subscriptionSchedules.create(
        {
          customer: command.providerCustomerId,
          start_date: Math.floor(Date.parse(command.finalLocalEndsAt) / 1_000),
          end_behavior: 'release',
          default_settings: { default_payment_method: paymentMethodId },
          phases: [
            {
              items: [{ price: command.providerBillingId, quantity: 1 }],
              duration: {
                interval: scheduleInterval,
                interval_count: command.billingIntervalCount,
              },
            },
          ],
          metadata: {
            application: 'inctagram',
            environment: this.configuration.environment,
            localSubscriptionId: command.subscriptionId,
            userId: command.userId,
          },
        },
        { idempotencyKey: `${command.providerIdempotencyKey}-schedule` },
      );
      if (schedule.livemode || schedule.status !== 'not_started') {
        throw this.invalidProviderResult();
      }
      return {
        provider: command.provider,
        providerCustomerId: command.providerCustomerId,
        providerSubscriptionId: command.currentProviderSubscriptionId,
        providerRenewalId: schedule.id,
        providerStatus: schedule.status,
        autoRenewEnabled: true,
        nextBillingAt: command.finalLocalEndsAt,
      };
    } catch (error: unknown) {
      if (error instanceof DomainException) throw error;
      throw StripeErrorMapper.toDomainException(error);
    }
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
    this.assertOperational();
    const signature = this.signature(command);
    let event: Stripe.Event;
    try {
      event = this.client.webhooks.constructEvent(
        command.rawBody,
        signature,
        this.configuration.webhookSecret,
      );
    } catch (error: unknown) {
      void error;
      throw this.invalidWebhookSignature();
    }
    if (event.livemode) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Live-mode Stripe webhooks are not accepted in test environment',
      });
    }
    return Promise.resolve(StripeWebhookNormalizer.normalize(event, this.code));
  }

  private signature(command: VerifyProviderWebhookCommand): string {
    const signatures = command.signatureHeaders.filter(
      (header) => header.name.toLowerCase() === 'stripe-signature',
    );
    if (signatures.length !== 1 || signatures[0].value.length === 0) {
      throw this.invalidWebhookSignature();
    }
    return signatures[0].value;
  }

  private invalidWebhookSignature(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Stripe webhook signature is invalid',
      extensions: [
        {
          field: 'reason',
          message: PAYMENT_PROVIDER_ERROR_REASON.INVALID_WEBHOOK_SIGNATURE,
        },
      ],
    });
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
    command: CreateInitialSubscriptionCheckoutCommand | CreateAdditionalSubscriptionCheckoutCommand,
    purpose: 'INITIAL_SUBSCRIPTION' | 'ADDITIONAL_SUBSCRIPTION',
  ): Stripe.MetadataParam {
    return {
      localCheckoutSessionId: command.localCheckoutSessionId,
      userId: command.userId,
      productId: command.productId,
      purpose,
    };
  }

  private retrieveExpandedSession(providerCheckoutId: string): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.retrieve(providerCheckoutId, {
      expand: ['line_items.data.price', 'payment_intent'],
    });
  }

  private validatedCheckoutResult(input: {
    session: Stripe.Checkout.Session;
    expectedProviderCustomerId: string;
    expectedProviderBillingId: string;
    expectedProviderProductId: string | null;
    expectedLocalCheckoutSessionId: string;
    expectedUserId: string;
    expectedProductId: string;
    amountMinor: number;
    currency: string;
    checkoutPurpose: 'INITIAL_SUBSCRIPTION' | 'ADDITIONAL_SUBSCRIPTION';
  }): CheckoutCreationResult {
    const customerId =
      typeof input.session.customer === 'string'
        ? input.session.customer
        : input.session.customer?.id;
    const price = input.session.line_items?.data[0]?.price;
    const priceId = typeof price === 'string' ? price : price?.id;
    const product = typeof price === 'string' ? null : price?.product;
    const productId = typeof product === 'string' ? product : product?.id;
    const isInitial = input.checkoutPurpose === 'INITIAL_SUBSCRIPTION';
    const expectedMode = isInitial ? 'subscription' : 'payment';
    const billingMatches = isInitial
      ? priceId === input.expectedProviderBillingId
      : productId === input.expectedProviderProductId;
    const metadataMatches =
      input.session.metadata?.localCheckoutSessionId === input.expectedLocalCheckoutSessionId &&
      input.session.metadata?.userId === input.expectedUserId &&
      input.session.metadata?.productId === input.expectedProductId &&
      input.session.metadata?.purpose === input.checkoutPurpose;
    if (
      input.session.livemode ||
      input.session.mode !== expectedMode ||
      customerId !== input.expectedProviderCustomerId ||
      !billingMatches ||
      input.session.amount_total !== input.amountMinor ||
      input.session.currency?.toUpperCase() !== input.currency ||
      !metadataMatches ||
      (!isInitial && input.session.subscription !== null) ||
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
