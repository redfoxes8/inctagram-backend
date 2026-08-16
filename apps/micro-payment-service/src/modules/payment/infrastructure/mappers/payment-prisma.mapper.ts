import {
  BillingInterval as PrismaBillingInterval,
  CheckoutPurpose as PrismaCheckoutPurpose,
  CheckoutSession,
  CheckoutStatus as PrismaCheckoutStatus,
  PaymentKind as PrismaPaymentKind,
  PaymentTransaction,
  PaymentTransactionStatus as PrismaPaymentTransactionStatus,
  Prisma,
  Product,
  ProductProvider,
  ProviderCustomer as PrismaProviderCustomer,
  ProviderWebhookEvent,
  ProviderWebhookEventStatus as PrismaProviderWebhookEventStatus,
  SubscriptionStatus as PrismaSubscriptionStatus,
} from '../../../../core/prisma/client';
import { CheckoutSessionEntity } from '../../domain/entities/checkout-session.entity';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProviderWebhookEventEntity } from '../../domain/entities/provider-webhook-event.entity';
import { SubscriptionEntity } from '../../domain/entities/subscription.entity';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../domain/enums/payment-transaction-status.enum';
import { ProviderWebhookEventStatus } from '../../domain/enums/provider-webhook-event-status.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';
import { ProductProviderMapping } from '../../domain/interfaces/product-provider.repository.interface';
import { ProviderCustomer } from '../../domain/interfaces/provider-customer.repository.interface';
import { JsonValue } from '../../domain/types/json-value.type';
import { BillingPeriod } from '../../domain/value-objects/billing-period.value-object';
import { Currency } from '../../domain/value-objects/currency.value-object';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.value-object';
import { Money } from '../../domain/value-objects/money.value-object';
import { ProviderCode } from '../../domain/value-objects/provider-code.value-object';

export type SubscriptionWithProduct = Prisma.SubscriptionGetPayload<{
  include: { product: true };
}>;

export class PaymentPrismaMapper {
  public static productToDomain(record: Product): ProductEntity {
    return new ProductEntity({
      id: record.id,
      code: record.code,
      name: record.name,
      billingInterval: PaymentPrismaMapper.billingIntervalToDomain(record.billingInterval),
      billingIntervalCount: record.billingIntervalCount,
      price: new Money({
        amountMinor: record.priceMinor,
        currency: new Currency(record.currency),
      }),
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public static productToPrisma(entity: ProductEntity): Prisma.ProductUncheckedCreateInput {
    return {
      id: entity.id,
      code: entity.getCode(),
      name: entity.getName(),
      billingInterval: PaymentPrismaMapper.billingIntervalToPrisma(entity.getBillingInterval()),
      billingIntervalCount: entity.getBillingIntervalCount(),
      priceMinor: entity.getPrice().getAmountMinor(),
      currency: entity.getPrice().getCurrency().getValue(),
      isActive: entity.isActive(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static checkoutToDomain(record: CheckoutSession): CheckoutSessionEntity {
    return new CheckoutSessionEntity({
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      provider: new ProviderCode(record.provider),
      purpose: PaymentPrismaMapper.checkoutPurposeToDomain(record.purpose),
      status: PaymentPrismaMapper.checkoutStatusToDomain(record.status),
      providerCheckoutId: record.providerCheckoutId,
      idempotencyKey: new IdempotencyKey(record.idempotencyKey),
      expiresAt: record.expiresAt,
      completedAt: record.completedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public static checkoutToPrisma(
    entity: CheckoutSessionEntity,
  ): Prisma.CheckoutSessionUncheckedCreateInput {
    return {
      id: entity.id,
      userId: entity.getUserId(),
      productId: entity.getProductId(),
      provider: entity.getProvider().getValue(),
      purpose: PaymentPrismaMapper.checkoutPurposeToPrisma(entity.getPurpose()),
      status: PaymentPrismaMapper.checkoutStatusToPrisma(entity.getStatus()),
      providerCheckoutId: entity.getProviderCheckoutId(),
      idempotencyKey: entity.getIdempotencyKey().getValue(),
      expiresAt: entity.getExpiresAt(),
      completedAt: entity.getCompletedAt(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static paymentTransactionToDomain(record: PaymentTransaction): PaymentTransactionEntity {
    return new PaymentTransactionEntity({
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      subscriptionId: record.subscriptionId,
      checkoutSessionId: record.checkoutSessionId,
      provider: new ProviderCode(record.provider),
      kind: PaymentPrismaMapper.paymentKindToDomain(record.kind),
      status: PaymentPrismaMapper.paymentStatusToDomain(record.status),
      money: new Money({
        amountMinor: record.amountMinor,
        currency: new Currency(record.currency),
      }),
      idempotencyKey: new IdempotencyKey(record.idempotencyKey),
      providerTransactionId: record.providerTransactionId,
      providerInvoiceId: record.providerInvoiceId,
      failureCode: record.failureCode,
      failureMessage: record.failureMessage,
      paidAt: record.paidAt,
      refundedAt: record.refundedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public static paymentTransactionToPrisma(
    entity: PaymentTransactionEntity,
  ): Prisma.PaymentTransactionUncheckedCreateInput {
    return {
      id: entity.id,
      userId: entity.getUserId(),
      productId: entity.getProductId(),
      subscriptionId: entity.getSubscriptionId(),
      checkoutSessionId: entity.getCheckoutSessionId(),
      provider: entity.getProvider().getValue(),
      kind: PaymentPrismaMapper.paymentKindToPrisma(entity.getKind()),
      status: PaymentPrismaMapper.paymentStatusToPrisma(entity.getStatus()),
      amountMinor: entity.getMoney().getAmountMinor(),
      currency: entity.getMoney().getCurrency().getValue(),
      idempotencyKey: entity.getIdempotencyKey().getValue(),
      providerTransactionId: entity.getProviderTransactionId(),
      providerInvoiceId: entity.getProviderInvoiceId(),
      failureCode: entity.getFailureCode(),
      failureMessage: entity.getFailureMessage(),
      paidAt: entity.getPaidAt(),
      refundedAt: entity.getRefundedAt(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static subscriptionToDomain(record: SubscriptionWithProduct): SubscriptionEntity {
    return new SubscriptionEntity({
      id: record.id,
      userId: record.userId,
      productId: record.productId,
      provider: new ProviderCode(record.provider),
      providerSubscriptionId: record.providerSubscriptionId,
      providerScheduleId: record.providerScheduleId,
      providerStatus: record.providerStatus,
      sequence: record.sequence,
      status: PaymentPrismaMapper.subscriptionStatusToDomain(record.status),
      autoRenew: record.autoRenew,
      period: BillingPeriod.fromBoundaries({ startsAt: record.startsAt, endsAt: record.endsAt }),
      nextBillingAt: record.nextBillingAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public static subscriptionToPrisma(
    entity: SubscriptionEntity,
  ): Prisma.SubscriptionUncheckedCreateInput {
    return {
      id: entity.id,
      userId: entity.getUserId(),
      productId: entity.getProductId(),
      provider: entity.getProvider().getValue(),
      providerSubscriptionId: entity.getProviderSubscriptionId(),
      providerScheduleId: entity.getProviderScheduleId(),
      providerStatus: entity.getProviderStatus(),
      sequence: entity.getSequence(),
      status: PaymentPrismaMapper.subscriptionStatusToPrisma(entity.getStatus()),
      autoRenew: entity.getAutoRenew(),
      startsAt: entity.getStartsAt(),
      endsAt: entity.getEndsAt(),
      nextBillingAt: entity.getNextBillingAt(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static webhookEventToDomain(record: ProviderWebhookEvent): ProviderWebhookEventEntity {
    return new ProviderWebhookEventEntity({
      id: record.id,
      provider: new ProviderCode(record.provider),
      providerEventId: record.providerEventId,
      eventType: record.eventType,
      status: PaymentPrismaMapper.webhookStatusToDomain(record.status),
      payload: record.payload,
      attempts: record.attempts,
      processingError: record.processingError,
      ignoredReason: record.ignoredReason,
      receivedAt: record.receivedAt,
      processedAt: record.processedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  public static webhookEventToPrisma(
    entity: ProviderWebhookEventEntity,
  ): Prisma.ProviderWebhookEventUncheckedCreateInput {
    return {
      id: entity.id,
      provider: entity.getProvider().getValue(),
      providerEventId: entity.getProviderEventId(),
      eventType: entity.getEventType(),
      status: PaymentPrismaMapper.webhookStatusToPrisma(entity.getStatus()),
      payload: PaymentPrismaMapper.jsonToPrisma(entity.getPayload()),
      attempts: entity.getAttempts(),
      processingError: entity.getProcessingError(),
      ignoredReason: entity.getIgnoredReason(),
      receivedAt: entity.getReceivedAt(),
      processedAt: entity.getProcessedAt(),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  public static productProviderToDomain(record: ProductProvider): ProductProviderMapping {
    return {
      id: record.id,
      productId: record.productId,
      provider: new ProviderCode(record.provider),
      providerProductId: record.providerProductId,
      providerBillingId: record.providerBillingId,
      environment: record.environment,
      isActive: record.isActive,
      createdAt: new Date(record.createdAt.getTime()),
      updatedAt: new Date(record.updatedAt.getTime()),
    };
  }

  public static providerCustomerToDomain(record: PrismaProviderCustomer): ProviderCustomer {
    return {
      id: record.id,
      userId: record.userId,
      provider: new ProviderCode(record.provider),
      providerCustomerId: record.providerCustomerId,
      createdAt: new Date(record.createdAt.getTime()),
      updatedAt: new Date(record.updatedAt.getTime()),
    };
  }

  public static jsonToPrisma(value: JsonValue): Prisma.JsonNullValueInput | Prisma.InputJsonValue {
    if (value === null) return Prisma.JsonNull;
    const normalized = PaymentPrismaMapper.jsonValueToPrisma(value);
    return normalized === null ? Prisma.JsonNull : normalized;
  }

  private static jsonValueToPrisma(value: JsonValue): Prisma.InputJsonValue | null {
    if (value === null) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => PaymentPrismaMapper.jsonValueToPrisma(item));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        PaymentPrismaMapper.jsonValueToPrisma(item),
      ]),
    );
  }

  private static billingIntervalToDomain(value: PrismaBillingInterval): BillingInterval {
    switch (value) {
      case PrismaBillingInterval.WEEK:
        return BillingInterval.WEEK;
      case PrismaBillingInterval.MONTH:
        return BillingInterval.MONTH;
    }
  }

  private static billingIntervalToPrisma(value: BillingInterval): PrismaBillingInterval {
    switch (value) {
      case BillingInterval.WEEK:
        return PrismaBillingInterval.WEEK;
      case BillingInterval.MONTH:
        return PrismaBillingInterval.MONTH;
    }
  }

  private static checkoutPurposeToDomain(value: PrismaCheckoutPurpose): CheckoutPurpose {
    switch (value) {
      case PrismaCheckoutPurpose.INITIAL_SUBSCRIPTION:
        return CheckoutPurpose.INITIAL_SUBSCRIPTION;
      case PrismaCheckoutPurpose.ADDITIONAL_SUBSCRIPTION:
        return CheckoutPurpose.ADDITIONAL_SUBSCRIPTION;
    }
  }

  private static checkoutPurposeToPrisma(value: CheckoutPurpose): PrismaCheckoutPurpose {
    switch (value) {
      case CheckoutPurpose.INITIAL_SUBSCRIPTION:
        return PrismaCheckoutPurpose.INITIAL_SUBSCRIPTION;
      case CheckoutPurpose.ADDITIONAL_SUBSCRIPTION:
        return PrismaCheckoutPurpose.ADDITIONAL_SUBSCRIPTION;
    }
  }

  private static checkoutStatusToDomain(value: PrismaCheckoutStatus): CheckoutStatus {
    switch (value) {
      case PrismaCheckoutStatus.CREATED:
        return CheckoutStatus.CREATED;
      case PrismaCheckoutStatus.COMPLETED:
        return CheckoutStatus.COMPLETED;
      case PrismaCheckoutStatus.EXPIRED:
        return CheckoutStatus.EXPIRED;
      case PrismaCheckoutStatus.FAILED:
        return CheckoutStatus.FAILED;
    }
  }

  private static checkoutStatusToPrisma(value: CheckoutStatus): PrismaCheckoutStatus {
    switch (value) {
      case CheckoutStatus.CREATED:
        return PrismaCheckoutStatus.CREATED;
      case CheckoutStatus.COMPLETED:
        return PrismaCheckoutStatus.COMPLETED;
      case CheckoutStatus.EXPIRED:
        return PrismaCheckoutStatus.EXPIRED;
      case CheckoutStatus.FAILED:
        return PrismaCheckoutStatus.FAILED;
    }
  }

  private static paymentKindToDomain(value: PrismaPaymentKind): PaymentKind {
    return value === PrismaPaymentKind.PURCHASE ? PaymentKind.PURCHASE : PaymentKind.RENEWAL;
  }

  private static paymentKindToPrisma(value: PaymentKind): PrismaPaymentKind {
    return value === PaymentKind.PURCHASE ? PrismaPaymentKind.PURCHASE : PrismaPaymentKind.RENEWAL;
  }

  private static paymentStatusToDomain(
    value: PrismaPaymentTransactionStatus,
  ): PaymentTransactionStatus {
    switch (value) {
      case PrismaPaymentTransactionStatus.PENDING:
        return PaymentTransactionStatus.PENDING;
      case PrismaPaymentTransactionStatus.PROCESSING:
        return PaymentTransactionStatus.PROCESSING;
      case PrismaPaymentTransactionStatus.SUCCEEDED:
        return PaymentTransactionStatus.SUCCEEDED;
      case PrismaPaymentTransactionStatus.FAILED:
        return PaymentTransactionStatus.FAILED;
      case PrismaPaymentTransactionStatus.REFUNDED:
        return PaymentTransactionStatus.REFUNDED;
      case PrismaPaymentTransactionStatus.PARTIALLY_REFUNDED:
        return PaymentTransactionStatus.PARTIALLY_REFUNDED;
    }
  }

  private static paymentStatusToPrisma(
    value: PaymentTransactionStatus,
  ): PrismaPaymentTransactionStatus {
    switch (value) {
      case PaymentTransactionStatus.PENDING:
        return PrismaPaymentTransactionStatus.PENDING;
      case PaymentTransactionStatus.PROCESSING:
        return PrismaPaymentTransactionStatus.PROCESSING;
      case PaymentTransactionStatus.SUCCEEDED:
        return PrismaPaymentTransactionStatus.SUCCEEDED;
      case PaymentTransactionStatus.FAILED:
        return PrismaPaymentTransactionStatus.FAILED;
      case PaymentTransactionStatus.REFUNDED:
        return PrismaPaymentTransactionStatus.REFUNDED;
      case PaymentTransactionStatus.PARTIALLY_REFUNDED:
        return PrismaPaymentTransactionStatus.PARTIALLY_REFUNDED;
    }
  }

  private static subscriptionStatusToDomain(value: PrismaSubscriptionStatus): SubscriptionStatus {
    switch (value) {
      case PrismaSubscriptionStatus.ACTIVE:
        return SubscriptionStatus.ACTIVE;
      case PrismaSubscriptionStatus.QUEUED:
        return SubscriptionStatus.QUEUED;
      case PrismaSubscriptionStatus.EXPIRED:
        return SubscriptionStatus.EXPIRED;
      case PrismaSubscriptionStatus.CANCELED:
        return SubscriptionStatus.CANCELED;
    }
  }

  private static subscriptionStatusToPrisma(value: SubscriptionStatus): PrismaSubscriptionStatus {
    switch (value) {
      case SubscriptionStatus.ACTIVE:
        return PrismaSubscriptionStatus.ACTIVE;
      case SubscriptionStatus.QUEUED:
        return PrismaSubscriptionStatus.QUEUED;
      case SubscriptionStatus.EXPIRED:
        return PrismaSubscriptionStatus.EXPIRED;
      case SubscriptionStatus.CANCELED:
        return PrismaSubscriptionStatus.CANCELED;
    }
  }

  private static webhookStatusToDomain(
    value: PrismaProviderWebhookEventStatus,
  ): ProviderWebhookEventStatus {
    switch (value) {
      case PrismaProviderWebhookEventStatus.RECEIVED:
        return ProviderWebhookEventStatus.RECEIVED;
      case PrismaProviderWebhookEventStatus.PROCESSING:
        return ProviderWebhookEventStatus.PROCESSING;
      case PrismaProviderWebhookEventStatus.PROCESSED:
        return ProviderWebhookEventStatus.PROCESSED;
      case PrismaProviderWebhookEventStatus.FAILED:
        return ProviderWebhookEventStatus.FAILED;
      case PrismaProviderWebhookEventStatus.IGNORED:
        return ProviderWebhookEventStatus.IGNORED;
    }
  }

  private static webhookStatusToPrisma(
    value: ProviderWebhookEventStatus,
  ): PrismaProviderWebhookEventStatus {
    switch (value) {
      case ProviderWebhookEventStatus.RECEIVED:
        return PrismaProviderWebhookEventStatus.RECEIVED;
      case ProviderWebhookEventStatus.PROCESSING:
        return PrismaProviderWebhookEventStatus.PROCESSING;
      case ProviderWebhookEventStatus.PROCESSED:
        return PrismaProviderWebhookEventStatus.PROCESSED;
      case ProviderWebhookEventStatus.FAILED:
        return PrismaProviderWebhookEventStatus.FAILED;
      case ProviderWebhookEventStatus.IGNORED:
        return PrismaProviderWebhookEventStatus.IGNORED;
    }
  }
}
