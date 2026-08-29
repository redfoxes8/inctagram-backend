import { Controller, UseInterceptors } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  GetAvailableProductsRequest,
  GetAvailableProductsResponse,
  GetCheckoutSessionStatusRequest,
  GetCheckoutSessionStatusResponse,
  GetPaymentHistoryRequest,
  GetPaymentHistoryResponse,
  GetSubscriptionsRequest,
  GetSubscriptionsResponse,
  PaymentServiceController,
  PaymentServiceControllerMethods,
  ProcessWebhookEventRequest,
  ProcessWebhookEventResponse,
  ToggleAutoRenewRequest,
  ToggleAutoRenewResponse,
} from '../../../../../../../libs/contracts/src';
import { GrpcExceptionInterceptor } from '../../../../../../../libs/common/src/exceptions/grpc-exception.interceptor';
import { CreateCheckoutSessionResult } from '../../application/types/payment-grpc.types';
import { ProcessWebhookEventResult } from '../../application/types/payment-grpc.types';
import { GetSubscriptionsResult } from '../../application/types/payment-grpc.types';
import { GetPaymentHistoryResult } from '../../application/types/payment-grpc.types';
import { ToggleAutoRenewResult } from '../../application/types/payment-grpc.types';
import { GetCheckoutSessionStatusResult } from '../../application/types/payment-grpc.types';
import { GetAvailableProductsResult } from '../../application/types/payment-grpc.types';
import { GetAvailableProductsQuery } from '../../application/queries/get-available-products.query';
import { PaymentGrpcRequestMapper } from './mappers/payment-grpc-request.mapper';
import { PaymentGrpcResponseMapper } from './mappers/payment-grpc-response.mapper';

@Controller()
@UseInterceptors(GrpcExceptionInterceptor)
@PaymentServiceControllerMethods()
export class PaymentGrpcController implements PaymentServiceController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  public async getAvailableProducts(
    request: GetAvailableProductsRequest,
  ): Promise<GetAvailableProductsResponse> {
    void request;
    const result = await this.queryBus.execute<GetAvailableProductsResult>(
      new GetAvailableProductsQuery(),
    );
    return PaymentGrpcResponseMapper.getAvailableProducts(result);
  }

  public async createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResponse> {
    const result = await this.commandBus.execute<CreateCheckoutSessionResult>(
      PaymentGrpcRequestMapper.toCreateCheckoutSession(request),
    );
    return PaymentGrpcResponseMapper.createCheckoutSession(result);
  }

  public async processWebhookEvent(
    request: ProcessWebhookEventRequest,
  ): Promise<ProcessWebhookEventResponse> {
    const result = await this.commandBus.execute<ProcessWebhookEventResult>(
      PaymentGrpcRequestMapper.toProcessWebhookEvent(request),
    );
    return PaymentGrpcResponseMapper.processWebhookEvent(result);
  }

  public async getSubscriptions(
    request: GetSubscriptionsRequest,
  ): Promise<GetSubscriptionsResponse> {
    const result = await this.queryBus.execute<GetSubscriptionsResult>(
      PaymentGrpcRequestMapper.toGetSubscriptions(request),
    );
    return PaymentGrpcResponseMapper.getSubscriptions(result);
  }

  public async getPaymentHistory(
    request: GetPaymentHistoryRequest,
  ): Promise<GetPaymentHistoryResponse> {
    const result = await this.queryBus.execute<GetPaymentHistoryResult>(
      PaymentGrpcRequestMapper.toGetPaymentHistory(request),
    );
    return PaymentGrpcResponseMapper.getPaymentHistory(result);
  }

  public async toggleAutoRenew(request: ToggleAutoRenewRequest): Promise<ToggleAutoRenewResponse> {
    const result = await this.commandBus.execute<ToggleAutoRenewResult>(
      PaymentGrpcRequestMapper.toToggleAutoRenew(request),
    );
    return PaymentGrpcResponseMapper.toggleAutoRenew(result);
  }

  public async getCheckoutSessionStatus(
    request: GetCheckoutSessionStatusRequest,
  ): Promise<GetCheckoutSessionStatusResponse> {
    const result = await this.queryBus.execute<GetCheckoutSessionStatusResult>(
      PaymentGrpcRequestMapper.toGetCheckoutSessionStatus(request),
    );
    return PaymentGrpcResponseMapper.getCheckoutSessionStatus(result);
  }
}
