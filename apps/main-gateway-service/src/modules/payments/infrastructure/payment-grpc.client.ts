import { GatewayTimeoutException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { type ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout, TimeoutError } from 'rxjs';

import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  PAYMENT_SERVICE_NAME,
  ToggleAutoRenewRequest,
  ToggleAutoRenewResponse,
  type PaymentServiceClient,
  type GetPaymentHistoryRequest,
  type GetPaymentHistoryResponse,
  ProcessWebhookEventRequest,
} from '../../../../../../libs/contracts/src';

import { PAYMENT_SERVICE_GRPC_CLIENT } from './payment-grpc.constants';

import { GrpcErrorMapper } from '../../../common/grpc/grpc-error.mapper';

@Injectable()
export class PaymentGrpcClient implements OnModuleInit {
  private paymentService: PaymentServiceClient;

  constructor(
    @Inject(PAYMENT_SERVICE_GRPC_CLIENT)
    private readonly client: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.paymentService = this.client.getService<PaymentServiceClient>(PAYMENT_SERVICE_NAME);
  }

  async getPaymentHistory(request: GetPaymentHistoryRequest): Promise<GetPaymentHistoryResponse> {
    try {
      return await firstValueFrom(this.paymentService.getPaymentHistory(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async getSubscriptions(request: GetSubscriptionsRequest): Promise<GetSubscriptionsResponse> {
    try {
      return await firstValueFrom(this.paymentService.getSubscriptions(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    try {
      return await firstValueFrom(this.paymentService.createCheckoutSession(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async toggleAutoRenew(request: ToggleAutoRenewRequest): Promise<ToggleAutoRenewResponse> {
    try {
      return await firstValueFrom(this.paymentService.toggleAutoRenew(request));
    } catch (error: unknown) {
      throw GrpcErrorMapper.toDomainException(error);
    }
  }

  async processWebhookEvent(request: ProcessWebhookEventRequest): Promise<void> {
    const PAYMENT_GRPC_TIMEOUT = 3000;

    try {
      await firstValueFrom(
        this.paymentService.processWebhookEvent(request).pipe(timeout(PAYMENT_GRPC_TIMEOUT)),
      );
    } catch (error: unknown) {
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException('Payment service timeout');
      }

      // TODO(P-013.2):
      // Handle DuplicateWebhookEventException once Payment MS
      // defines the gRPC error contract.
      // Duplicate events must be translated to HTTP 200 by the controller.
      throw GrpcErrorMapper.toDomainException(error);
    }
  }
}
