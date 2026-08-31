import { ProductEntity } from '../../src/modules/payment/domain/entities/product.entity';
import { BillingInterval } from '../../src/modules/payment/domain/enums/billing-interval.enum';
import { IProductRepository } from '../../src/modules/payment/domain/interfaces/product.repository.interface';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import {
  GetAvailableProductsHandler,
  GetAvailableProductsQuery,
} from '../../src/modules/payment/application/queries/get-available-products.query';
import { PaymentConfig } from '../../src/core/payment.config';

function product(input: {
  id: string;
  name: string;
  interval: BillingInterval;
  amountMinor: number;
}): ProductEntity {
  return new ProductEntity({
    id: input.id,
    code: `BUSINESS_${input.interval}_${input.amountMinor}`,
    name: input.name,
    billingInterval: input.interval,
    billingIntervalCount: 1,
    price: new Money({
      amountMinor: input.amountMinor,
      currency: new Currency('USD'),
    }),
  });
}

describe('GetAvailableProductsHandler', () => {
  it('returns one batched minor-unit projection from one repository call', async () => {
    const products = [
      product({
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Business - 1 Week',
        interval: BillingInterval.WEEK,
        amountMinor: 700,
      }),
      product({
        id: '10000000-0000-4000-8000-000000000002',
        name: 'Business - 1 Month',
        interval: BillingInterval.MONTH,
        amountMinor: 1200,
      }),
    ];
    const findPurchasable = jest.fn().mockResolvedValue(products);
    const repository = {
      findPurchasable,
    } as unknown as IProductRepository;
    const config = { providerEnvironment: 'sandbox' } as unknown as PaymentConfig;
    const handler = new GetAvailableProductsHandler(repository, config);

    const result = await handler.execute(new GetAvailableProductsQuery());

    expect(findPurchasable).toHaveBeenCalledTimes(1);
    expect(findPurchasable).toHaveBeenCalledWith({
      provider: 'STRIPE',
      environment: 'sandbox',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        productId: products[0].id,
        amountMinor: 700,
        billingInterval: BillingInterval.WEEK,
      }),
      expect.objectContaining({
        productId: products[1].id,
        amountMinor: 1200,
        billingInterval: BillingInterval.MONTH,
      }),
    ]);
  });

  it('returns an empty array after one repository call', async () => {
    const findPurchasable = jest.fn().mockResolvedValue([]);
    const repository = {
      findPurchasable,
    } as unknown as IProductRepository;
    const config = { providerEnvironment: 'test' } as PaymentConfig;
    const handler = new GetAvailableProductsHandler(repository, config);

    await expect(handler.execute(new GetAvailableProductsQuery())).resolves.toEqual({ items: [] });
    expect(findPurchasable).toHaveBeenCalledTimes(1);
  });
});
