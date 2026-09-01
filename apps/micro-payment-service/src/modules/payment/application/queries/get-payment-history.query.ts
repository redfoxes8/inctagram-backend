import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { IPaymentHistoryQueryPort, PaymentHistoryItem } from '../ports/payment-query.port';
import { GetPaymentHistoryResult, PaymentHistoryResultItem } from '../types/payment-grpc.types';

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
  constructor(private readonly paymentHistoryQueryPort: IPaymentHistoryQueryPort) {}

  public async execute(query: GetPaymentHistoryQuery): Promise<GetPaymentHistoryResult> {
    const result = await this.paymentHistoryQueryPort.getPaymentHistory({
      userId: query.input.userId,
      page: { page: query.input.page, pageSize: query.input.pageSize },
    });

    return {
      items: result.items.map(this.toHistoryResultItem),
      totalCount: result.totalCount,
      page: result.page,
      pageSize: result.pageSize,
      pagesCount: result.pagesCount,
    };
  }

  private readonly toHistoryResultItem = (item: PaymentHistoryItem): PaymentHistoryResultItem => {
    return {
      transactionId: item.transactionId,
      productName: item.productName,
      currency: item.currency,
      paidAt: item.paidAt,
      createdAt: item.createdAt,
      productId: item.productId,
      billingInterval: item.billingInterval,
      billingIntervalCount: item.billingIntervalCount,
      provider: item.provider,
      kind: item.kind,
      status: item.status,
      amountMinor: item.amountMinor,
      checkoutPurpose: item.checkoutPurpose,
      subscriptionId: item.subscriptionId,
      subscriptionEndsAt: item.subscriptionEndsAt,
    };
  };
}
