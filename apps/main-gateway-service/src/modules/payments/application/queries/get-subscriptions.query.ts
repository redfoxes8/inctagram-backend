import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PaymentGrpcAdapter } from '../../infrastructure/payment-grpc.adapter';

export type GetSubscriptionsQueryDto = {
  userId: string;
};

export class GetSubscriptionsQuery implements IQuery {
  constructor(public readonly dto: GetSubscriptionsQueryDto) {}
}

@QueryHandler(GetSubscriptionsQuery)
export class GetSubscriptionsHandler implements IQueryHandler<GetSubscriptionsQuery> {
  constructor(private readonly paymentAdapter: PaymentGrpcAdapter) {}

  async execute(query: GetSubscriptionsQuery) {
    return this.paymentAdapter.getSubscriptions(query.dto);
  }
}
