import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { PaymentGrpcClient } from './payment-grpc.client';
import { IPaymentGrpcAdapter } from './interfaces/payment-grpc-adapter.interface';
import { GetPaymentHistoryQueryDto } from '../application/queries/get-payment-history.query';
import { PaymentRequestMapper } from '../api/mappers/payment-request.mapper';
import { PaymentResponseMapper } from '../api/mappers/payment-response.mapper';
import { GetSubscriptionsQueryDto } from '../application/queries/get-subscriptions.query';
import { CreateCheckoutSessionResponseDto } from '../api/dto/create-checkout-session.response';
import { CreateCheckoutSessionCommandDto } from '../application/commands/create-checkout-session.command';
import { ToggleAutoRenewCommandDto } from '../application/commands/toggle-auto-renew.command';
import { ProcessWebhookEventCommandDto } from '../application/commands/process-webhook-event.command';

@Injectable()
export class PaymentGrpcAdapter implements IPaymentGrpcAdapter {
  constructor(private readonly paymentGrpcClient: PaymentGrpcClient) {}

  async getPaymentHistory(dto: GetPaymentHistoryQueryDto): Promise<any> {
    const request = PaymentRequestMapper.toGetPaymentHistory(dto);

    const response = await this.paymentGrpcClient.getPaymentHistory(request);

    return PaymentResponseMapper.toGetPaymentHistory(response);
  }

  async getSubscriptions(dto: GetSubscriptionsQueryDto) {
    const request = PaymentRequestMapper.toGetSubscriptions(dto);

    const response = await this.paymentGrpcClient.getSubscriptions(request);

    return PaymentResponseMapper.toGetSubscriptions(response);
  }

  async createCheckoutSession(
    dto: CreateCheckoutSessionCommandDto,
  ): Promise<CreateCheckoutSessionResponseDto> {
    const request = PaymentRequestMapper.toCreateCheckoutSession(dto);

    const response = await this.paymentGrpcClient.createCheckoutSession(request);

    return {
      checkoutUrl: response.checkoutUrl,
    };
  }

  async toggleAutoRenew(dto: ToggleAutoRenewCommandDto): Promise<void> {
    const request = PaymentRequestMapper.toToggleAutoRenew(dto);

    const response = await this.paymentGrpcClient.toggleAutoRenew(request);

    if (!response.success) {
      throw new InternalServerErrorException('Toggle auto renew failed'); // or DomainError('Toggle auto renew failed');
    }

    return;
  }

  async processWebhookEvent(dto: ProcessWebhookEventCommandDto): Promise<void> {
    const request = PaymentRequestMapper.toProcessWebhookEvent(dto);

    await this.paymentGrpcClient.processWebhookEvent(request);

    return;
  }
}
