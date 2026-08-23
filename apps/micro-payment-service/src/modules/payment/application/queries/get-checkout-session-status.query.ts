import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ICheckoutStatusQueryPort } from '../../application/ports/payment-query.port';
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
  constructor(private readonly checkoutStatusQueryPort: ICheckoutStatusQueryPort) {}

  public async execute(
    query: GetCheckoutSessionStatusQuery,
  ): Promise<GetCheckoutSessionStatusResult> {
    const projection = await this.checkoutStatusQueryPort.findOwnedCheckoutStatus({
      userId: query.input.userId,
      checkoutSessionId: query.input.checkoutSessionId,
    });

    if (!projection) {
      throw new DomainException({
        code: DomainExceptionCode.NotFound,
        message: 'Checkout session not found or does not belong to the user',
      });
    }

    return {
      status: projection.status,
      subscriptionId: projection.resultingSubscriptionId,
    };
  }
}
