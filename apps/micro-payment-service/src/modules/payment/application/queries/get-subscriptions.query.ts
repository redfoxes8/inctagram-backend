import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import { GetSubscriptionsResult } from '../types/payment-grpc.types';

export class GetSubscriptionsQuery extends Query<GetSubscriptionsResult> {
  constructor(public readonly userId: string) {
    super();
  }
}

@QueryHandler(GetSubscriptionsQuery)
export class GetSubscriptionsHandler implements IQueryHandler<
  GetSubscriptionsQuery,
  GetSubscriptionsResult
> {
  public execute(query: GetSubscriptionsQuery): Promise<GetSubscriptionsResult> {
    void query;
    return Promise.reject(paymentOperationNotReady());
  }
}
