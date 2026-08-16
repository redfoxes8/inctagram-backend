import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { GetCheckoutSessionStatusResponseDto } from '../../api/dto/get-checkout-session-status.response';

export type GetCheckoutSessionStatusQueryDto = Readonly<{
  userId: string;
  checkoutSessionId: string;
}>;

export type GetCheckoutSessionStatusResult = GetCheckoutSessionStatusResponseDto;

export class GetCheckoutSessionStatusQuery implements IQuery {
  constructor(public readonly dto: GetCheckoutSessionStatusQueryDto) {}
}

@QueryHandler(GetCheckoutSessionStatusQuery)
export class GetCheckoutSessionStatusHandler implements IQueryHandler<
  GetCheckoutSessionStatusQuery,
  GetCheckoutSessionStatusResult
> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  public execute(query: GetCheckoutSessionStatusQuery): Promise<GetCheckoutSessionStatusResult> {
    return this.paymentAdapter.getCheckoutSessionStatus(query.dto);
  }
}
