import {
  CreateCheckoutSessionRequest,
  GetCheckoutSessionStatusRequest,
  GetPaymentHistoryRequest,
  GetSubscriptionsRequest,
  PaymentProvider,
  ProcessWebhookEventRequest,
  ToggleAutoRenewRequest,
  type Timestamp,
} from '../../../../../../../../libs/contracts/src';
import { DomainException } from '../../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { CreateCheckoutSessionCommand } from '../../../application/commands/create-checkout-session.command';
import { ProcessWebhookEventCommand } from '../../../application/commands/process-webhook-event.command';
import { ToggleAutoRenewCommand } from '../../../application/commands/toggle-auto-renew.command';
import { GetCheckoutSessionStatusQuery } from '../../../application/queries/get-checkout-session-status.query';
import { GetPaymentHistoryQuery } from '../../../application/queries/get-payment-history.query';
import { GetSubscriptionsQuery } from '../../../application/queries/get-subscriptions.query';
import { SignatureHeader } from '../../../application/types/payment-grpc.types';

const SIGNATURE_HEADER_ALLOWLIST: Readonly<Record<'STRIPE' | 'PAYPAL', readonly string[]>> = {
  STRIPE: ['stripe-signature'],
  PAYPAL: [],
};

export class PaymentGrpcRequestMapper {
  public static toCreateCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): CreateCheckoutSessionCommand {
    if (request.autoRenewConsent !== true) {
      throw this.badRequest('Auto-renew consent is required');
    }

    return new CreateCheckoutSessionCommand({
      userId: request.userId,
      productId: request.productId,
      provider: this.provider(request.paymentProvider),
      autoRenewConsent: true,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
      idempotencyKey: request.idempotencyKey,
    });
  }

  public static toProcessWebhookEvent(
    request: ProcessWebhookEventRequest,
  ): ProcessWebhookEventCommand {
    const provider = this.provider(request.provider);
    return new ProcessWebhookEventCommand({
      provider,
      rawBody: request.rawPayload,
      signatureHeaders: this.signatureHeaders(provider, request.signatureHeaders),
      receivedAt: this.timestamp(request.receivedAt, 'Webhook receivedAt is required'),
    });
  }

  public static toGetSubscriptions(request: GetSubscriptionsRequest): GetSubscriptionsQuery {
    return new GetSubscriptionsQuery(request.userId);
  }

  public static toGetPaymentHistory(request: GetPaymentHistoryRequest): GetPaymentHistoryQuery {
    return new GetPaymentHistoryQuery({
      userId: request.userId,
      page: request.page,
      pageSize: request.pageSize,
    });
  }

  public static toToggleAutoRenew(request: ToggleAutoRenewRequest): ToggleAutoRenewCommand {
    return new ToggleAutoRenewCommand({
      userId: request.userId,
      subscriptionId: request.subscriptionId,
      enabled: request.enabled,
    });
  }

  public static toGetCheckoutSessionStatus(
    request: GetCheckoutSessionStatusRequest,
  ): GetCheckoutSessionStatusQuery {
    return new GetCheckoutSessionStatusQuery({
      userId: request.userId,
      checkoutSessionId: request.checkoutSessionId,
    });
  }

  private static provider(provider: PaymentProvider): 'STRIPE' | 'PAYPAL' {
    if (provider === PaymentProvider.STRIPE) return 'STRIPE';
    if (provider === PaymentProvider.PAYPAL) return 'PAYPAL';
    throw this.badRequest('Payment provider is not supported');
  }

  private static signatureHeaders(
    provider: 'STRIPE' | 'PAYPAL',
    headers: readonly SignatureHeader[],
  ): readonly SignatureHeader[] {
    const allowedNames = SIGNATURE_HEADER_ALLOWLIST[provider];
    const result: SignatureHeader[] = [];

    for (const header of headers) {
      const normalizedName = header.name.toLowerCase();
      if (!allowedNames.includes(normalizedName)) {
        throw this.badRequest('Webhook signature header is not allowed');
      }
      result.push({ name: normalizedName, value: header.value });
    }

    return result;
  }

  private static timestamp(timestamp: Timestamp | undefined, message: string): Date {
    if (
      !timestamp ||
      !Number.isSafeInteger(timestamp.seconds) ||
      !Number.isInteger(timestamp.nanos)
    ) {
      throw this.badRequest(message);
    }
    const value = new Date(timestamp.seconds * 1_000 + timestamp.nanos / 1_000_000);
    if (!Number.isFinite(value.getTime())) throw this.badRequest(message);
    return value;
  }

  private static badRequest(message: string): DomainException {
    return new DomainException({ code: DomainExceptionCode.BadRequest, message });
  }
}
