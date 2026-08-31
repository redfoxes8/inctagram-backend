import { CreateCheckoutSessionResponseDto } from '../../api/dto/create-checkout-session.response';
import { GetSubscriptionsResponseDto } from '../../api/dto/get-subscriptions.response';
import { GetPaymentHistoryResponseDto } from '../../api/dto/get-payment-history.response';
import { GetCheckoutSessionStatusResponseDto } from '../../api/dto/get-checkout-session-status.response';
import { ToggleAutoRenewResponseDto } from '../../api/dto/toggle-auto-renew.response';
import { CreateCheckoutSessionCommandDto } from '../../application/commands/create-checkout-session.command';
import {
  ProcessWebhookEventCommandDto,
  ProcessWebhookEventResult,
} from '../../application/commands/process-webhook-event.command';
import { ToggleAutoRenewCommandDto } from '../../application/commands/toggle-auto-renew.command';
import { GetPaymentHistoryQueryDto } from '../../application/queries/get-payment-history.query';
import { GetSubscriptionsQueryDto } from '../../application/queries/get-subscriptions.query';
import { GetCheckoutSessionStatusQueryDto } from '../../application/queries/get-checkout-session-status.query';
import { GetAvailableProductsResponseDto } from '../../api/dto/get-available-products.response';

export abstract class IPaymentGrpcAdapter {
  abstract getAvailableProducts(): Promise<GetAvailableProductsResponseDto>;
  abstract getPaymentHistory(dto: GetPaymentHistoryQueryDto): Promise<GetPaymentHistoryResponseDto>;

  abstract getSubscriptions(dto: GetSubscriptionsQueryDto): Promise<GetSubscriptionsResponseDto>;

  abstract createCheckoutSession(
    dto: CreateCheckoutSessionCommandDto,
  ): Promise<CreateCheckoutSessionResponseDto>;

  abstract toggleAutoRenew(dto: ToggleAutoRenewCommandDto): Promise<ToggleAutoRenewResponseDto>;

  abstract processWebhookEvent(
    dto: ProcessWebhookEventCommandDto,
  ): Promise<ProcessWebhookEventResult>;

  abstract getCheckoutSessionStatus(
    dto: GetCheckoutSessionStatusQueryDto,
  ): Promise<GetCheckoutSessionStatusResponseDto>;
}
