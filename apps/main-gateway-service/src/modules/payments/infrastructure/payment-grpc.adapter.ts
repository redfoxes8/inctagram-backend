import { Injectable } from '@nestjs/common';

import { PaymentGrpcClient } from './payment-grpc.client';
import { IPaymentGrpcAdapter } from './interfaces/payment-grpc-adapter.interface';
import { GetPaymentHistoryQueryDto } from '../application/queries/get-payment-history.query';
import { PaymentRequestMapper } from '../api/mappers/payment-request.mapper';
import { PaymentResponseMapper } from '../api/mappers/payment-response.mapper';
import { GetSubscriptionsQueryDto } from '../application/queries/get-subscriptions.query';
import { CreateCheckoutSessionResponseDto } from '../api/dto/create-checkout-session.response';
import { CreateCheckoutSessionCommandDto } from '../application/commands/create-checkout-session.command';
import { ToggleAutoRenewCommandDto } from '../application/commands/toggle-auto-renew.command';
import {
  ProcessWebhookEventCommandDto,
  ProcessWebhookEventResult,
} from '../application/commands/process-webhook-event.command';
import { GetPaymentHistoryResponseDto } from '../api/dto/get-payment-history.response';
import { GetSubscriptionsResponseDto } from '../api/dto/get-subscriptions.response';
import { ToggleAutoRenewResponseDto } from '../api/dto/toggle-auto-renew.response';
import { GetCheckoutSessionStatusResponseDto } from '../api/dto/get-checkout-session-status.response';
import { GetCheckoutSessionStatusQueryDto } from '../application/queries/get-checkout-session-status.query';
import { GetAvailableProductsResponseDto } from '../api/dto/get-available-products.response';

@Injectable()
export class PaymentGrpcAdapter implements IPaymentGrpcAdapter {
  constructor(private readonly paymentGrpcClient: PaymentGrpcClient) {}

  async getAvailableProducts(): Promise<GetAvailableProductsResponseDto> {
    const response = await this.paymentGrpcClient.getAvailableProducts({});
    return PaymentResponseMapper.toGetAvailableProducts(response);
  }

  async getPaymentHistory(dto: GetPaymentHistoryQueryDto): Promise<GetPaymentHistoryResponseDto> {
    const request = PaymentRequestMapper.toGetPaymentHistory(dto);

    const response = await this.paymentGrpcClient.getPaymentHistory(request);

    return PaymentResponseMapper.toGetPaymentHistory(response);
  }

  async getSubscriptions(dto: GetSubscriptionsQueryDto): Promise<GetSubscriptionsResponseDto> {
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
      checkoutSessionId: response.checkoutSessionId,
      checkoutUrl: response.checkoutUrl,
      expiresAt: response.expiresAt
        ? PaymentResponseMapper.timestampToIso(response.expiresAt)
        : null,
    };
  }

  async toggleAutoRenew(dto: ToggleAutoRenewCommandDto): Promise<ToggleAutoRenewResponseDto> {
    const request = PaymentRequestMapper.toToggleAutoRenew(dto);

    const response = await this.paymentGrpcClient.toggleAutoRenew(request);

    return PaymentResponseMapper.toToggleAutoRenew(response);
  }

  async processWebhookEvent(
    dto: ProcessWebhookEventCommandDto,
  ): Promise<ProcessWebhookEventResult> {
    const request = PaymentRequestMapper.toProcessWebhookEvent(dto);
    const response = await this.paymentGrpcClient.processWebhookEvent(request);
    return PaymentResponseMapper.toProcessWebhookEvent(response);
  }

  async getCheckoutSessionStatus(
    dto: GetCheckoutSessionStatusQueryDto,
  ): Promise<GetCheckoutSessionStatusResponseDto> {
    const request = PaymentRequestMapper.toGetCheckoutSessionStatus(dto);
    const response = await this.paymentGrpcClient.getCheckoutSessionStatus(request);
    return PaymentResponseMapper.toGetCheckoutSessionStatus(response);
  }
}
