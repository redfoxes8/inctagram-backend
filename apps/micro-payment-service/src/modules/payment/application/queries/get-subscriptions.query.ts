import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { ISubscriptionQueryPort } from '../ports/payment-query.port';
import { GetSubscriptionsResult, SubscriptionResult } from '../types/payment-grpc.types';
import { BillingInterval } from '../../domain/enums/billing-interval.enum';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum';

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
  constructor(private readonly subscriptionQueryPort: ISubscriptionQueryPort) {}

  public async execute(query: GetSubscriptionsQuery): Promise<GetSubscriptionsResult> {
    const result = await this.subscriptionQueryPort.getSubscriptions(query.userId);

    return {
      current: result.current ? this.toSubscriptionResult(result.current) : null,
      queued: result.queued.map((subscription) => this.toSubscriptionResult(subscription)),
    };
  }

  private toSubscriptionResult(projection: {
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    billingInterval: BillingInterval;
    billingIntervalCount: number;
    startsAt: Date;
    endsAt: Date;
    nextBillingAt: Date | null;
    autoRenew: boolean;
    provider: string;
    status: SubscriptionStatus;
    sequence: number;
  }): SubscriptionResult {
    return {
      id: projection.id,
      sequence: projection.sequence,
      product: {
        id: projection.productId,
        code: projection.productCode,
        name: projection.productName,
        billingInterval: projection.billingInterval,
        billingIntervalCount: projection.billingIntervalCount,
      },
      startsAt: projection.startsAt,
      endsAt: projection.endsAt,
      nextBillingAt: projection.nextBillingAt,
      autoRenew: projection.autoRenew,
      provider: projection.provider,
      status: projection.status,
    };
  }
}
