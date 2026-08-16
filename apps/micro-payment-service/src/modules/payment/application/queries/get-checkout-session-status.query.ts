import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import { GetCheckoutSessionStatusResult } from '../types/payment-grpc.types';

export type GetCheckoutSessionStatusInput = Readonly<{
  userId: string;
  checkoutSessionId: string;
}>;

export class GetCheckoutSessionStatusQuery extends Query<GetCheckoutSessionStatusResult> {
  constructor(public readonly input: GetCheckoutSessionStatusInput) {
    super();
  }
}

@QueryHandler(GetCheckoutSessionStatusQuery)
export class GetCheckoutSessionStatusHandler implements IQueryHandler<
  GetCheckoutSessionStatusQuery,
  GetCheckoutSessionStatusResult
> {
  public execute(query: GetCheckoutSessionStatusQuery): Promise<GetCheckoutSessionStatusResult> {
    void query;
    return Promise.reject(paymentOperationNotReady());
  }
}
