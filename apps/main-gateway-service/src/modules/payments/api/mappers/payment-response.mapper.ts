import {
  BillingInterval,
  CheckoutSessionStatus,
  GetCheckoutSessionStatusResponse,
  GetPaymentHistoryResponse,
  GetSubscriptionsResponse,
  PaymentKind,
  PaymentProvider,
  PaymentTransactionStatus,
  SubscriptionStatus,
  SubscriptionView,
  Timestamp,
  ToggleAutoRenewResponse,
} from '../../../../../../../libs/contracts/src';
import {
  ProcessWebhookEventResponse,
  WebhookProcessingStatus,
} from '../../../../../../../libs/contracts/src';
import { ProcessWebhookEventResult } from '../../application/commands/process-webhook-event.command';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { GetCheckoutSessionStatusResponseDto } from '../dto/get-checkout-session-status.response';
import { GetPaymentHistoryResponseDto } from '../dto/get-payment-history.response';
import {
  GetSubscriptionsResponseDto,
  SubscriptionResponseDto,
} from '../dto/get-subscriptions.response';
import { ToggleAutoRenewResponseDto } from '../dto/toggle-auto-renew.response';

export class PaymentResponseMapper {
  public static toProcessWebhookEvent(
    response: ProcessWebhookEventResponse,
  ): ProcessWebhookEventResult {
    const statuses: Readonly<
      Record<WebhookProcessingStatus, ProcessWebhookEventResult['status'] | null>
    > = {
      [WebhookProcessingStatus.UNRECOGNIZED]: null,
      [WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_UNSPECIFIED]: null,
      [WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_RECEIVED]: 'RECEIVED',
      [WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_PROCESSED]: 'PROCESSED',
      [WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_IGNORED]: 'IGNORED',
      [WebhookProcessingStatus.WEBHOOK_PROCESSING_STATUS_FAILED]: 'FAILED',
    };
    const status = statuses[response.status];
    if (!status) {
      throw new DomainException({
        code: DomainExceptionCode.InternalServerError,
        message: 'Payment service returned an invalid webhook status',
      });
    }
    return { accepted: response.accepted, duplicate: response.duplicate, status };
  }
  public static toGetPaymentHistory(
    response: GetPaymentHistoryResponse,
  ): GetPaymentHistoryResponseDto {
    return {
      items: response.items.map((item) => ({
        transactionId: item.transactionId,
        createdAt: this.timestampToIso(this.requireTimestamp(item.createdAt)),
        paidAt: item.paidAt ? this.timestampToIso(item.paidAt) : null,
        amountMinor: item.amountMinor,
        currency: item.currency,
        productId: item.productId,
        productName: item.productName,
        billingInterval: this.billingIntervalToString(item.billingInterval),
        billingIntervalCount: item.billingIntervalCount,
        provider: this.providerToString(item.paymentProvider),
        kind: this.paymentKindToString(item.kind),
        status: this.paymentStatusToString(item.status),
      })),
      totalCount: response.totalCount,
      page: response.page,
      pageSize: response.pageSize,
      pagesCount: response.pagesCount,
    };
  }

  public static toGetSubscriptions(
    response: GetSubscriptionsResponse,
  ): GetSubscriptionsResponseDto {
    return {
      current: response.current ? this.toSubscription(response.current) : null,
      queued: response.queued.map((subscription) => this.toSubscription(subscription)),
    };
  }

  public static toToggleAutoRenew(response: ToggleAutoRenewResponse): ToggleAutoRenewResponseDto {
    return {
      success: response.success,
      autoRenew: response.autoRenew,
      nextBillingAt: response.nextBillingAt ? this.timestampToIso(response.nextBillingAt) : null,
      providerStatus: response.providerStatus ?? null,
    };
  }

  public static toGetCheckoutSessionStatus(
    response: GetCheckoutSessionStatusResponse,
  ): GetCheckoutSessionStatusResponseDto {
    return {
      status: this.checkoutStatusToString(response.status),
      subscriptionId: response.subscriptionId ?? null,
    };
  }

  public static timestampToIso(timestamp: Timestamp): string {
    return new Date(timestamp.seconds * 1000 + timestamp.nanos / 1_000_000).toISOString();
  }

  private static toSubscription(subscription: SubscriptionView): SubscriptionResponseDto {
    if (!subscription.product || !subscription.startsAt || !subscription.endsAt) {
      throw this.invalidResponseException();
    }
    return {
      id: subscription.id,
      sequence: subscription.sequence,
      product: {
        id: subscription.product.id,
        code: subscription.product.code,
        name: subscription.product.name,
        billingInterval: this.billingIntervalToString(subscription.product.billingInterval),
        billingIntervalCount: subscription.product.billingIntervalCount,
      },
      startsAt: this.timestampToIso(subscription.startsAt),
      endsAt: this.timestampToIso(subscription.endsAt),
      nextBillingAt: subscription.nextBillingAt
        ? this.timestampToIso(subscription.nextBillingAt)
        : null,
      autoRenew: subscription.autoRenew,
      provider: this.providerToString(subscription.provider),
      status: this.subscriptionStatusToString(subscription.status),
    };
  }

  private static requireTimestamp(timestamp: Timestamp | undefined): Timestamp {
    if (timestamp) return timestamp;
    throw this.invalidResponseException();
  }

  private static providerToString(provider: PaymentProvider): string {
    if (provider === PaymentProvider.STRIPE) return 'STRIPE';
    if (provider === PaymentProvider.PAYPAL) return 'PAYPAL';
    throw this.invalidResponseException();
  }

  private static billingIntervalToString(interval: BillingInterval): string {
    if (interval === BillingInterval.BILLING_INTERVAL_WEEK) return 'WEEK';
    if (interval === BillingInterval.BILLING_INTERVAL_MONTH) return 'MONTH';
    throw this.invalidResponseException();
  }

  private static subscriptionStatusToString(status: SubscriptionStatus): string {
    if (status === SubscriptionStatus.SUBSCRIPTION_STATUS_ACTIVE) return 'ACTIVE';
    if (status === SubscriptionStatus.SUBSCRIPTION_STATUS_QUEUED) return 'QUEUED';
    if (status === SubscriptionStatus.SUBSCRIPTION_STATUS_EXPIRED) return 'EXPIRED';
    if (status === SubscriptionStatus.SUBSCRIPTION_STATUS_CANCELED) return 'CANCELED';
    throw this.invalidResponseException();
  }

  private static paymentKindToString(kind: PaymentKind): string {
    if (kind === PaymentKind.PAYMENT_KIND_PURCHASE) return 'PURCHASE';
    if (kind === PaymentKind.PAYMENT_KIND_RENEWAL) return 'RENEWAL';
    throw this.invalidResponseException();
  }

  private static paymentStatusToString(status: PaymentTransactionStatus): string {
    const knownStatuses: Partial<Record<PaymentTransactionStatus, string>> = {
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PENDING]: 'PENDING',
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PROCESSING]: 'PROCESSING',
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_SUCCEEDED]: 'SUCCEEDED',
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_FAILED]: 'FAILED',
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_REFUNDED]: 'REFUNDED',
      [PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_PARTIALLY_REFUNDED]:
        'PARTIALLY_REFUNDED',
    };
    const value = knownStatuses[status];
    if (value) return value;
    throw this.invalidResponseException();
  }

  private static checkoutStatusToString(status: CheckoutSessionStatus): string {
    const knownStatuses: Partial<Record<CheckoutSessionStatus, string>> = {
      [CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_CREATED]: 'CREATED',
      [CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_COMPLETED]: 'COMPLETED',
      [CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_EXPIRED]: 'EXPIRED',
      [CheckoutSessionStatus.CHECKOUT_SESSION_STATUS_FAILED]: 'FAILED',
    };
    const value = knownStatuses[status];
    if (value) return value;
    throw this.invalidResponseException();
  }

  private static invalidResponseException(): DomainException {
    return new DomainException({
      code: DomainExceptionCode.InternalServerError,
      message: 'Payment service returned an invalid response',
    });
  }
}
