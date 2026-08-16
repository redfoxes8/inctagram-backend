import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { paymentOperationNotReady } from '../payment-operation-not-ready.exception';
import { GetPaymentHistoryResult } from '../types/payment-grpc.types';

export type GetPaymentHistoryInput = Readonly<{
  userId: string;
  page: number;
  pageSize: number;
}>;

export class GetPaymentHistoryQuery extends Query<GetPaymentHistoryResult> {
  constructor(public readonly input: GetPaymentHistoryInput) {
    super();
  }
}

@QueryHandler(GetPaymentHistoryQuery)
export class GetPaymentHistoryHandler implements IQueryHandler<
  GetPaymentHistoryQuery,
  GetPaymentHistoryResult
> {
  public execute(query: GetPaymentHistoryQuery): Promise<GetPaymentHistoryResult> {
    void query;
    return Promise.reject(paymentOperationNotReady());
  }
}
