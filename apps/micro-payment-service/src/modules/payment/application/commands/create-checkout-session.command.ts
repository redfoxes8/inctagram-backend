import { randomUUID } from 'crypto';
import { Command, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CheckoutSessionEntity } from '../../domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { ProductProviderMapping } from '../../domain/interfaces/product-provider.repository.interface';
import { ProviderCustomer } from '../../domain/interfaces/provider-customer.repository.interface';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.value-object';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';
import { PaymentProviderResolver } from '../ports/payment-provider-resolver.port';
import { PaymentProviderStrategy } from '../ports/payment-provider.strategy';
import { IPaymentUnitOfWork, PaymentUnitOfWorkContext } from '../ports/payment-unit-of-work.port';
import { CheckoutCreationResult } from '../ports/payment-provider.types';
import {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResult,
} from '../types/payment-grpc.types';

type PreparedInitialCheckout = Readonly<{
  checkout: CheckoutSessionEntity;
  productProvider: ProductProviderMapping;
  providerCustomer: ProviderCustomer | null;
  amountMinor: number;
  currency: string;
  billingInterval: BillingInterval;
  billingIntervalCount: number;
}>;

export class CreateCheckoutSessionCommand extends Command<CreateCheckoutSessionResult> {
  constructor(public readonly input: CreateCheckoutSessionInput) {
    super();
  }
}

@CommandHandler(CreateCheckoutSessionCommand)
export class CreateCheckoutSessionHandler implements ICommandHandler<
  CreateCheckoutSessionCommand,
  CreateCheckoutSessionResult
> {
  constructor(
    private readonly unitOfWork: IPaymentUnitOfWork,
    private readonly providerResolver: PaymentProviderResolver,
  ) {}

  public async execute(
    command: CreateCheckoutSessionCommand,
  ): Promise<CreateCheckoutSessionResult> {
    this.assertTrustedUrl(command.input.successUrl);
    this.assertTrustedUrl(command.input.cancelUrl);
    const provider = new ProviderCode(command.input.provider);
    const strategy = this.providerResolver.resolve(provider);
    const idempotencyKey = new IdempotencyKey(command.input.idempotencyKey);
    const prepared = await this.unitOfWork.execute(async (context) => {
      await context.lockUser(command.input.userId);
      return this.prepareLocalIntent({
        context,
        input: command.input,
        provider,
        idempotencyKey,
        strategy,
      });
    });

    try {
      const providerResult = prepared.checkout.getProviderCheckoutId()
        ? await this.retrieveExistingCheckout(strategy, prepared)
        : await strategy.createInitialSubscriptionCheckout({
            localCheckoutSessionId: prepared.checkout.id,
            userId: command.input.userId,
            productId: command.input.productId,
            provider,
            providerCustomerId: prepared.providerCustomer?.providerCustomerId ?? null,
            providerProductId: prepared.productProvider.providerProductId,
            providerBillingId: prepared.productProvider.providerBillingId,
            amountMinor: prepared.amountMinor,
            currency: prepared.currency,
            billingInterval: prepared.billingInterval,
            billingIntervalCount: prepared.billingIntervalCount,
            successUrl: command.input.successUrl,
            cancelUrl: command.input.cancelUrl,
            providerIdempotencyKey: `checkout-${prepared.checkout.id}`,
            providerCustomerIdempotencyKey: `customer-${provider.getValue()}-${command.input.userId}`,
            autoRenewConsent: true,
          });
      await this.persistProviderResult({
        checkoutId: prepared.checkout.id,
        userId: command.input.userId,
        provider,
        providerCheckoutId: providerResult.providerCheckoutId,
        providerCustomerId: providerResult.providerCustomerId,
        expiresAt: providerResult.expiresAt ? new Date(providerResult.expiresAt) : null,
      });
      return {
        checkoutSessionId: prepared.checkout.id,
        checkoutUrl: providerResult.checkoutUrl,
        expiresAt: providerResult.expiresAt ? new Date(providerResult.expiresAt) : null,
      };
    } catch (error: unknown) {
      if (
        prepared.checkout.getProviderCheckoutId() === null &&
        error instanceof DomainException &&
        error.code !== DomainExceptionCode.ServiceUnavailable &&
        error.code !== DomainExceptionCode.GatewayTimeout
      ) {
        await this.markDefiniteFailure(prepared.checkout.id, command.input.userId, error);
      }
      throw error;
    }
  }

  private async prepareLocalIntent(input: {
    context: PaymentUnitOfWorkContext;
    input: CreateCheckoutSessionInput;
    provider: ProviderCode;
    idempotencyKey: IdempotencyKey;
    strategy: PaymentProviderStrategy;
  }): Promise<PreparedInitialCheckout> {
    const existing = await input.context.checkoutSessions.findByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existing) {
      this.assertCanonicalRequest(existing, input.input, input.provider);
      return this.loadPrepared(input.context, existing, input.provider);
    }
    input.strategy.assertOperational();
    const unfinished = await input.context.subscriptions.findOrderedUnfinishedByUserId(
      input.input.userId,
    );
    if (unfinished.length > 0) {
      throw this.conflict('Initial checkout is unavailable while a paid subscription queue exists');
    }
    const product = await input.context.products.findById(input.input.productId);
    if (!product?.isActive()) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Active payment product was not found',
      });
    }
    const mapping = await input.context.productProviders.findActiveByProduct({
      productId: product.id,
      provider: input.provider,
      environment: 'test',
    });
    if (!mapping) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Active provider billing configuration was not found',
      });
    }
    const checkout = CheckoutSessionEntity.create({
      id: randomUUID(),
      userId: input.input.userId,
      productId: product.id,
      provider: input.provider,
      purpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
      idempotencyKey: input.idempotencyKey,
      expiresAt: null,
    });
    const payment = PaymentTransactionEntity.createPendingPurchase({
      id: randomUUID(),
      userId: input.input.userId,
      productId: product.id,
      checkoutSessionId: checkout.id,
      provider: input.provider,
      money: product.getPrice(),
      idempotencyKey: new IdempotencyKey(`transaction-${input.idempotencyKey.getValue()}`),
    });
    await input.context.checkoutSessions.insert(checkout);
    await input.context.paymentTransactions.insert(payment);
    return {
      checkout,
      productProvider: mapping,
      providerCustomer: await input.context.providerCustomers.findByUserAndProvider({
        userId: input.input.userId,
        provider: input.provider,
      }),
      amountMinor: product.getPrice().getAmountMinor(),
      currency: product.getPrice().getCurrency().getValue(),
      billingInterval: product.getBillingInterval(),
      billingIntervalCount: product.getBillingIntervalCount(),
    };
  }

  private async loadPrepared(
    context: PaymentUnitOfWorkContext,
    checkout: CheckoutSessionEntity,
    provider: ProviderCode,
  ): Promise<PreparedInitialCheckout> {
    if (checkout.getStatus() !== CheckoutStatus.CREATED) {
      throw this.conflict('Checkout attempt is no longer reusable');
    }
    const product = await context.products.findById(checkout.getProductId());
    const mapping = product
      ? await context.productProviders.findActiveByProduct({
          productId: product.id,
          provider,
          environment: 'test',
        })
      : null;
    if (!product?.isActive() || !mapping) {
      throw this.conflict('Checkout catalog configuration is no longer available');
    }
    return {
      checkout,
      productProvider: mapping,
      providerCustomer: await context.providerCustomers.findByUserAndProvider({
        userId: checkout.getUserId(),
        provider,
      }),
      amountMinor: product.getPrice().getAmountMinor(),
      currency: product.getPrice().getCurrency().getValue(),
      billingInterval: product.getBillingInterval(),
      billingIntervalCount: product.getBillingIntervalCount(),
    };
  }

  private assertCanonicalRequest(
    checkout: CheckoutSessionEntity,
    input: CreateCheckoutSessionInput,
    provider: ProviderCode,
  ): void {
    if (
      checkout.getUserId() !== input.userId ||
      checkout.getProductId() !== input.productId ||
      !checkout.getProvider().equals(provider) ||
      checkout.getPurpose() !== CheckoutPurpose.INITIAL_SUBSCRIPTION ||
      input.autoRenewConsent !== true
    ) {
      throw this.conflict('Idempotency key is already bound to another checkout request');
    }
  }

  private retrieveExistingCheckout(
    strategy: PaymentProviderStrategy,
    prepared: PreparedInitialCheckout,
  ): Promise<CheckoutCreationResult> {
    const providerCheckoutId = prepared.checkout.getProviderCheckoutId();
    const providerCustomerId = prepared.providerCustomer?.providerCustomerId;
    if (!providerCheckoutId || !providerCustomerId) {
      throw this.conflict('Persisted checkout correlation is incomplete');
    }
    return strategy.retrieveCheckout({
      provider: prepared.checkout.getProvider(),
      providerCheckoutId,
      expectedProviderCustomerId: providerCustomerId,
      expectedProviderBillingId: prepared.productProvider.providerBillingId,
      amountMinor: prepared.amountMinor,
      currency: prepared.currency,
    });
  }

  private async persistProviderResult(input: {
    checkoutId: string;
    userId: string;
    provider: ProviderCode;
    providerCheckoutId: string;
    providerCustomerId: string;
    expiresAt: Date | null;
  }): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      await context.lockUser(input.userId);
      const checkout = await context.checkoutSessions.findById(input.checkoutId);
      if (!checkout || checkout.getUserId() !== input.userId) {
        throw this.conflict('Checkout correlation was not found after provider response');
      }
      const now = new Date();
      const storedCustomer = await context.providerCustomers.insertIfAbsent({
        id: randomUUID(),
        userId: input.userId,
        provider: input.provider,
        providerCustomerId: input.providerCustomerId,
        createdAt: now,
        updatedAt: now,
      });
      if (storedCustomer.providerCustomerId !== input.providerCustomerId) {
        throw this.conflict('Provider customer correlation conflicts with existing state');
      }
      checkout.attachProviderCheckout({
        providerCheckoutId: input.providerCheckoutId,
        expiresAt: input.expiresAt,
      });
      await context.checkoutSessions.save(checkout);
    });
  }

  private async markDefiniteFailure(
    checkoutId: string,
    userId: string,
    error: DomainException,
  ): Promise<void> {
    await this.unitOfWork.execute(async (context) => {
      await context.lockUser(userId);
      const checkout = await context.checkoutSessions.findById(checkoutId);
      if (!checkout || checkout.getStatus() !== CheckoutStatus.CREATED) return;
      const transactions = await context.paymentTransactions.findByCheckoutSessionId(checkoutId);
      checkout.fail();
      await context.checkoutSessions.save(checkout);
      const transaction = transactions[0];
      if (transaction?.getStatus() === PaymentTransactionStatus.PENDING) {
        const reason = error.extensions.find((item) => item.field === 'reason')?.message;
        transaction.fail({ failureCode: reason ?? 'PROVIDER_FAILURE' });
        await context.paymentTransactions.save(transaction);
      }
    });
  }

  private assertTrustedUrl(value: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout redirect URL must be absolute',
      });
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout redirect URL is not allowed',
      });
    }
  }

  private conflict(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.Conflict, message });
  }
}
