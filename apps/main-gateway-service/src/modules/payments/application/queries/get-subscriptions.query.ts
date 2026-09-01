import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';
import { GetSubscriptionsResponseDto } from '../../api/dto/get-subscriptions.response';

export type GetSubscriptionsQueryDto = {
  userId: string;
};

export class GetSubscriptionsQuery implements IQuery {
  constructor(public readonly dto: GetSubscriptionsQueryDto) {}
}

@QueryHandler(GetSubscriptionsQuery)
export class GetSubscriptionsHandler implements IQueryHandler<GetSubscriptionsQuery> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(query: GetSubscriptionsQuery): Promise<GetSubscriptionsResponseDto> {
    return this.paymentAdapter.getSubscriptions(query.dto);
  }
}
