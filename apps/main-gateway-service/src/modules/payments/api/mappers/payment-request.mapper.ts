import {
  CreateCheckoutSessionRequest,
  GetCheckoutSessionStatusRequest,
  GetPaymentHistoryRequest,
  GetSubscriptionsRequest,
  PaymentProvider,
  ProcessWebhookEventRequest,
  Timestamp,
  ToggleAutoRenewRequest,
} from '../../../../../../../libs/contracts/src';
import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CreateCheckoutSessionCommandDto } from '../../application/commands/create-checkout-session.command';
import { ProcessWebhookEventCommandDto } from '../../application/commands/process-webhook-event.command';
import { ToggleAutoRenewCommandDto } from '../../application/commands/toggle-auto-renew.command';
import { GetCheckoutSessionStatusQueryDto } from '../../application/queries/get-checkout-session-status.query';
import { GetPaymentHistoryQueryDto } from '../../application/queries/get-payment-history.query';
import { GetSubscriptionsQueryDto } from '../../application/queries/get-subscriptions.query';
import { PaymentProviderCode } from '../../application/types/payment-provider-code.type';

export class PaymentRequestMapper {
  public static toGetPaymentHistory(dto: GetPaymentHistoryQueryDto): GetPaymentHistoryRequest {
    return { userId: dto.userId, page: dto.page, pageSize: dto.pageSize };
  }

  public static toGetSubscriptions(dto: GetSubscriptionsQueryDto): GetSubscriptionsRequest {
    return { userId: dto.userId };
  }

  public static toCreateCheckoutSession(
    dto: CreateCheckoutSessionCommandDto,
  ): CreateCheckoutSessionRequest {
    if (!dto.idempotencyKey) {
      throw new DomainException({
        code: DomainExceptionCode.BadRequest,
        message: 'Checkout idempotency key binding is not available yet',
      });
    }

    return {
      userId: dto.userId,
      productId: dto.productId,
      paymentProvider: this.toPaymentProvider(dto.provider),
      autoRenewConsent: dto.autoRenewConsent,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
      idempotencyKey: dto.idempotencyKey,
    };
  }

  public static toToggleAutoRenew(dto: ToggleAutoRenewCommandDto): ToggleAutoRenewRequest {
    return { subscriptionId: dto.subscriptionId, userId: dto.userId, enabled: dto.enabled };
  }

  public static toProcessWebhookEvent(
    dto: ProcessWebhookEventCommandDto,
  ): ProcessWebhookEventRequest {
    return {
      provider: this.toPaymentProvider(dto.provider),
      rawPayload: dto.rawBody,
      signatureHeaders: dto.signatureHeaders.map((header) => ({ ...header })),
      receivedAt: this.isoToTimestamp(dto.receivedAt),
    };
  }

  public static toGetCheckoutSessionStatus(
    dto: GetCheckoutSessionStatusQueryDto,
  ): GetCheckoutSessionStatusRequest {
    return { userId: dto.userId, checkoutSessionId: dto.checkoutSessionId };
  }

  private static toPaymentProvider(provider: PaymentProviderCode): PaymentProvider {
    switch (provider) {
      case 'STRIPE':
        return PaymentProvider.STRIPE;
      case 'PAYPAL':
        return PaymentProvider.PAYPAL;
    }
  }

  private static isoToTimestamp(value: string): Timestamp {
    const milliseconds = Date.parse(value);
    return {
      seconds: Math.floor(milliseconds / 1000),
      nanos: (milliseconds % 1000) * 1_000_000,
    };
  }
}
