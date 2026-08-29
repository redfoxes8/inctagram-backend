import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { IProductRepository } from '../../domain/interfaces/product.repository.interface';
import { GetAvailableProductsResult } from '../types/payment-grpc.types';
import { PaymentConfig } from '../../../../core/payment.config';

export class GetAvailableProductsQuery extends Query<GetAvailableProductsResult> {}

@QueryHandler(GetAvailableProductsQuery)
export class GetAvailableProductsHandler implements IQueryHandler<
  GetAvailableProductsQuery,
  GetAvailableProductsResult
> {
  constructor(
    private readonly products: IProductRepository,
    private readonly config: PaymentConfig,
  ) {}

  public async execute(): Promise<GetAvailableProductsResult> {
    const products = await this.products.findPurchasable({
      provider: 'STRIPE',
      environment: this.config.providerEnvironment,
    });

    return {
      items: products.map((product) => ({
        productId: product.id,
        name: product.getName(),
        amountMinor: product.getPrice().getAmountMinor(),
        currency: product.getPrice().getCurrency().getValue(),
        billingInterval: product.getBillingInterval(),
        billingIntervalCount: product.getBillingIntervalCount(),
      })),
    };
  }
}
