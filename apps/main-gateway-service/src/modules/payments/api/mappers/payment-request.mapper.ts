import {
  type GetSubscriptionsRequest,
  type GetPaymentHistoryRequest,
  CreateCheckoutSessionRequest,
  ToggleAutoRenewRequest,
  PaymentProvider,
  ProcessWebhookEventRequest,
} from '../../../../../../../libs/contracts/src';
import { CreateCheckoutSessionCommandDto } from '../../application/commands/create-checkout-session.command';
import { ProcessWebhookEventCommandDto } from '../../application/commands/process-webhook-event.command';
import { ToggleAutoRenewCommandDto } from '../../application/commands/toggle-auto-renew.command';
import { GetPaymentHistoryQueryDto } from '../../application/queries/get-payment-history.query';
import { GetSubscriptionsQueryDto } from '../../application/queries/get-subscriptions.query';

export class PaymentRequestMapper {
  static toGetPaymentHistory(dto: GetPaymentHistoryQueryDto): GetPaymentHistoryRequest {
    return {
      userId: dto.userId,
      page: dto.query.pageNumber,
      pageSize: dto.query.pageSize,
    };
  }

  static toGetSubscriptions(dto: GetSubscriptionsQueryDto): GetSubscriptionsRequest {
    return {
      userId: dto.userId,
    };
  }

  static toCreateCheckoutSession(
    dto: CreateCheckoutSessionCommandDto,
  ): CreateCheckoutSessionRequest {
    return {
      userId: dto.userId,
      productId: dto.dto.productId,
      provider: dto.dto.provider,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    };
  }

  static toToggleAutoRenew(dto: ToggleAutoRenewCommandDto): ToggleAutoRenewRequest {
    return {
      subscriptionId: dto.subscriptionId,
      userId: dto.userId,
      enabled: dto.dto.enabled,
    };
  }

  static toProcessWebhookEvent(dto: ProcessWebhookEventCommandDto): ProcessWebhookEventRequest {
    return {
      provider: PaymentProvider.STRIPE,
      eventType: dto.event.type,
      rawPayload: dto.rawBody,
    };
  }
}
