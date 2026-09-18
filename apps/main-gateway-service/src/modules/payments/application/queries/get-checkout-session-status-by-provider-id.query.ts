import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { GetCheckoutSessionStatusResponseDto } from '../../api/dto/get-checkout-session-status.response';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';

export type GetCheckoutSessionStatusByProviderIdQueryDto = Readonly<{
  userId: string;
  providerCheckoutId: string;
}>;

export type GetCheckoutSessionStatusByProviderIdResult = GetCheckoutSessionStatusResponseDto;

export class GetCheckoutSessionStatusByProviderIdQuery implements IQuery {
  constructor(public readonly dto: GetCheckoutSessionStatusByProviderIdQueryDto) {}
}

@QueryHandler(GetCheckoutSessionStatusByProviderIdQuery)
export class GetCheckoutSessionStatusByProviderIdHandler implements IQueryHandler<
  GetCheckoutSessionStatusByProviderIdQuery,
  GetCheckoutSessionStatusByProviderIdResult
> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  public execute(
    query: GetCheckoutSessionStatusByProviderIdQuery,
  ): Promise<GetCheckoutSessionStatusByProviderIdResult> {
    return this.paymentAdapter.getCheckoutSessionStatusByProviderId(query.dto);
  }
}
