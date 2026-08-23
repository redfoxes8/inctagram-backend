import {
  BillingInterval as ProtoBillingInterval,
  CheckoutPurpose as ProtoCheckoutPurpose,
  CheckoutSessionStatus,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionStatusResponse,
  GetPaymentHistoryResponse,
  GetSubscriptionsResponse,
  PaymentKind as ProtoPaymentKind,
  PaymentProvider,
  PaymentTransactionStatus as ProtoPaymentTransactionStatus,
  ProcessWebhookEventResponse,
  SubscriptionStatus as ProtoSubscriptionStatus,
  ToggleAutoRenewResponse,
  WebhookProcessingStatus,
  type SubscriptionView,
  type Timestamp,
} from '../../../../../../../../libs/contracts/src';
import { DomainException } from '../../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { BillingInterval } from '../../../domain/enums/billing-interval.enum';
import { CheckoutPurpose } from '../../../domain/enums/checkout-purpose.enum';
import { CheckoutStatus } from '../../../domain/enums/checkout-status.enum';
import { PaymentKind } from '../../../domain/enums/payment-kind.enum';
import { PaymentTransactionStatus } from '../../../domain/enums/payment-transaction-status.enum';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum';
import {
  CreateCheckoutSessionResult,
  GetCheckoutSessionStatusResult,
  GetPaymentHistoryResult,
  GetSubscriptionsResult,
  ProcessWebhookEventResult,
  SubscriptionResult,
  ToggleAutoRenewResult,
} from '../../../application/types/payment-grpc.types';

export class PaymentGrpcResponseMapper {
  public static createCheckoutSession(
    result: CreateCheckoutSessionResult,
  ): CreateCheckoutSessionResponse {
    return {
      checkoutSessionId: result.checkoutSessionId,
      checkoutUrl: result.checkoutUrl,
      expiresAt: result.expiresAt ? this.timestamp(result.expiresAt) : undefined,
    };
  }

  public static processWebhookEvent(
    result: ProcessWebhookEventResult,
  ): ProcessWebhookEventResponse {
    const status: Readonly<Record<ProcessWebhookEventResult['status'], WebhookProcessingStatus>> = {
      RECEIVED: WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_RECEIVED,
      PROCESSED: WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_PROCESSED,
      IGNORED: WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_IGNORED,
      FAILED: WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_FAILED,
    };
    return {
      accepted: result.accepted,
      duplicate: result.duplicate,
      status: status[result.status],
    };
  }

  public static getSubscriptions(result: GetSubscriptionsResult): GetSubscriptionsResponse {
    return {
      current: result.current ? this.subscription(result.current) : undefined,
      queued: result.queued.map((subscription) => this.subscription(subscription)),
    };
  }

  public static getPaymentHistory(result: GetPaymentHistoryResult): GetPaymentHistoryResponse {
    return {
      items: result.items.map((item) => ({
        transactionId: item.transactionId,
        productName: item.productName,
        currency: item.currency,
        paidAt: item.paidAt ? this.timestamp(item.paidAt) : undefined,
        createdAt: this.timestamp(item.createdAt),
        productId: item.productId,
        billingInterval: this.billingInterval(item.billingInterval),
        billingIntervalCount: item.billingIntervalCount,
        paymentProvider: this.provider(item.provider),
        kind: this.paymentKind(item.kind),
        status: this.paymentStatus(item.status),
        amountMinor: item.amountMinor,
        checkoutPurpose: item.checkoutPurpose
          ? this.checkoutPurpose(item.checkoutPurpose)
          : undefined,
      })),
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      pagesCount: result.pagesCount,
    };
  }

  public static toggleAutoRenew(result: ToggleAutoRenewResult): ToggleAutoRenewResponse {
    return {
      success: result.success,
      autoRenew: result.autoRenew,
      nextBillingAt: result.nextBillingAt ? this.timestamp(result.nextBillingAt) : undefined,
      providerStatus: result.providerStatus ?? undefined,
    };
  }

  public static getCheckoutSessionStatus(
    result: GetCheckoutSessionStatusResult,
  ): GetCheckoutSessionStatusResponse {
    const status: Readonly<Record<CheckoutStatus, CheckoutSessionStatus>> = {
      [CheckoutStatus.CREATED]: CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_CREATED,
      [CheckoutStatus.COMPLETED]: CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_COMPLETED,
      [CheckoutStatus.EXPIRED]: CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_EXPIRED,
      [CheckoutStatus.FAILED]: CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_FAILED,
    };
    return { status: status[result.status], subscriptionId: result.subscriptionId ?? undefined };
  }

  private static subscription(result: SubscriptionResult): SubscriptionView {
    return {
      id: result.id,
      sequence: result.sequence,
      product: {
        id: result.product.id,
        code: result.product.code,
        name: result.product.name,
        billingInterval: this.billingInterval(result.product.billingInterval),
        billingIntervalCount: result.product.billingIntervalCount,
      },
      startsAt: this.timestamp(result.startsAt),
      endsAt: this.timestamp(result.endsAt),
      nextBillingAt: result.nextBillingAt ? this.timestamp(result.nextBillingAt) : undefined,
      autoRenew: result.autoRenew,
      provider: this.provider(result.provider),
      status: this.subscriptionStatus(result.status),
    };
  }

  private static timestamp(value: Date): Timestamp {
    const milliseconds = value.getTime();
    return {
      seconds: Math.floor(milliseconds / 1_000),
      nanos: (milliseconds % 1_000) * 1_000_000,
    };
  }

  private static provider(value: string): PaymentProvider {
    if (value === 'STRIPE') return PaymentProvider.STRIPE;
    if (value === 'PAYPAL') return PaymentProvider.PAYPAL;
    throw new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Payment operation returned an unsupported provider',
    });
  }

  private static billingInterval(value: BillingInterval): ProtoBillingInterval {
    return value === BillingInterval.WEEK
      ? ProtoBillingInterval.BILLING_INTERVAL_WEEK
      : ProtoBillingInterval.BILLING_INTERVAL_MONTH;
  }

  private static subscriptionStatus(value: SubscriptionStatus): ProtoSubscriptionStatus {
    const statuses: Readonly<Record<SubscriptionStatus, ProtoSubscriptionStatus>> = {
      [SubscriptionStatus.ACTIVE]: ProtoSubscriptionStatus.SUBSCRIPTION_STATUS_ACTIVE,
      [SubscriptionStatus.QUEUED]: ProtoSubscriptionStatus.SUBSCRIPTION_STATUS_QUEUED,
      [SubscriptionStatus.EXPIRED]: ProtoSubscriptionStatus.SUBSCRIPTION_STATUS_EXPIRED,
      [SubscriptionStatus.CANCELED]: ProtoSubscriptionStatus.SUBSCRIPTION_STATUS_CANCELED,
    };
    return statuses[value];
  }

  private static paymentKind(value: PaymentKind): ProtoPaymentKind {
    return value === PaymentKind.PURCHASE
      ? ProtoPaymentKind.PAYMENT_KIND_PURCHASE
      : ProtoPaymentKind.PAYMENT_KIND_RENEWAL;
  }

  private static paymentStatus(value: PaymentTransactionStatus): ProtoPaymentTransactionStatus {
    const statuses: Readonly<Record<PaymentTransactionStatus, ProtoPaymentTransactionStatus>> = {
      [PaymentTransactionStatus.PENDING]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PENDING,
      [PaymentTransactionStatus.PROCESSING]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PROCESSING,
      [PaymentTransactionStatus.SUCCEEDED]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_SUCCEEDED,
      [PaymentTransactionStatus.FAILED]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_FAILED,
      [PaymentTransactionStatus.REFUNDED]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_REFUNDED,
      [PaymentTransactionStatus.PARTIALLY_REFUNDED]:
        ProtoPaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PARTIALLY_REFUNDED,
    };
    return statuses[value];
  }

  private static checkoutPurpose(value: CheckoutPurpose): ProtoCheckoutPurpose {
    const purposes: Readonly<Record<CheckoutPurpose, ProtoCheckoutPurpose>> = {
      [CheckoutPurpose.INITIAL_SUBSCRIPTION]:
        ProtoCheckoutPurpose.CHECKOUT_PURPOSE_INITIAL_SUBSCRIPTION,
      [CheckoutPurpose.ADDITIONAL_SUBSCRIPTION]:
        ProtoCheckoutPurpose.CHECKOUT_PURPOSE_ADDITIONAL_SUBSCRIPTION,
    };
    return purposes[value];
  }
}
