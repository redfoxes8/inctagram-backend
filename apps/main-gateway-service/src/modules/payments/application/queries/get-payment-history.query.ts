import { IQuery } from '@nestjs/cqrs';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { GetPaymentHistoryQueryParams } from '../../api/dto/get-payment-history.query-params';

export type GetPaymentHistoryQueryDto = {
  userId: string;
  query: GetPaymentHistoryQueryParams;
};

export class GetPaymentHistoryQuery implements IQuery {
  constructor(public readonly dto: GetPaymentHistoryQueryDto) {}
}

@QueryHandler(GetPaymentHistoryQuery)
export class GetPaymentHistoryHandler implements IQueryHandler<GetPaymentHistoryQuery> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(query: GetPaymentHistoryQuery) {
    await Promise.resolve();

    return this.paymentAdapter.getPaymentHistory(query.dto);
  }
}
