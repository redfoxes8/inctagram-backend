import {
  type GetSubscriptionsRequest,
  type GetPaymentHistoryRequest,
  CreateCheckoutSessionRequest,
  ToggleAutoRenewRequest,
} from '../../../../../../../libs/contracts/src';
import { CreateCheckoutSessionCommandDto } from '../../application/commands/create-checkout-session.command';
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

      // Пока захардкодим.
      // Позже вынесем в GatewayConfig.
      successUrl: 'http://localhost:3000/payment/success',
      cancelUrl: 'http://localhost:3000/payment/cancel',
    };
  }

  static toToggleAutoRenew(dto: ToggleAutoRenewCommandDto): ToggleAutoRenewRequest {
    return {
      subscriptionId: dto.subscriptionId,
      userId: dto.userId,
      enabled: dto.dto.enabled,
    };
  }
}
