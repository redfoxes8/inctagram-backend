import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { DomainException } from '../../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { ICheckoutStatusQueryPort } from '../../application/ports/payment-query.port';
import { GetCheckoutSessionStatusResult } from '../types/payment-grpc.types';

export type GetCheckoutSessionStatusByProviderIdInput = Readonly<{
  userId: string;
  provider: 'STRIPE';
  providerCheckoutId: string;
}>;

export class GetCheckoutSessionStatusByProviderIdQuery extends Query<GetCheckoutSessionStatusResult> {
  constructor(public readonly input: GetCheckoutSessionStatusByProviderIdInput) {
    super();
  }
}

@QueryHandler(GetCheckoutSessionStatusByProviderIdQuery)
export class GetCheckoutSessionStatusByProviderIdHandler implements IQueryHandler<
  GetCheckoutSessionStatusByProviderIdQuery,
  GetCheckoutSessionStatusResult
> {
  constructor(private readonly checkoutStatusQueryPort: ICheckoutStatusQueryPort) {}

  public async execute(
    query: GetCheckoutSessionStatusByProviderIdQuery,
  ): Promise<GetCheckoutSessionStatusResult> {
    const projection = await this.checkoutStatusQueryPort.findOwnedCheckoutStatusByProviderId(
      query.input,
    );

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
