import { IQuery } from '@nestjs/cqrs';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { GetPaymentHistoryResponseDto } from '../../api/dto/get-payment-history.response';

export type GetPaymentHistoryQueryDto = {
  userId: string;
  page: number;
  pageSize: number;
};

export class GetPaymentHistoryQuery implements IQuery {
  constructor(public readonly dto: GetPaymentHistoryQueryDto) {}
}

@QueryHandler(GetPaymentHistoryQuery)
export class GetPaymentHistoryHandler implements IQueryHandler<GetPaymentHistoryQuery> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(query: GetPaymentHistoryQuery): Promise<GetPaymentHistoryResponseDto> {
    return this.paymentAdapter.getPaymentHistory(query.dto);
  }
}
