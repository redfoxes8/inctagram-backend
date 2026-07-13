import { CreateCheckoutSessionResponseDto } from '../../api/dto/create-checkout-session.response';
import { GetSubscriptionsResponseDto } from '../../api/dto/get-subscriptions.response';
import { CreateCheckoutSessionCommandDto } from '../../application/commands/create-checkout-session.command';
import { ToggleAutoRenewCommandDto } from '../../application/commands/toggle-auto-renew.command';
import { GetPaymentHistoryQueryDto } from '../../application/queries/get-payment-history.query';
import { GetSubscriptionsQueryDto } from '../../application/queries/get-subscriptions.query';

export abstract class IPaymentGrpcAdapter {
  abstract getPaymentHistory(dto: GetPaymentHistoryQueryDto): Promise<any>;

  abstract getSubscriptions(dto: GetSubscriptionsQueryDto): Promise<GetSubscriptionsResponseDto>;

  abstract createCheckoutSession(
    dto: CreateCheckoutSessionCommandDto,
  ): Promise<CreateCheckoutSessionResponseDto>;

  abstract toggleAutoRenew(dto: ToggleAutoRenewCommandDto): Promise<void>;
}
