import { BillingInterval, type GetAvailableProductsResponse } from '../../../../libs/contracts/src';
import {
  GetAvailableProductsHandler,
  GetAvailableProductsQuery,
} from '../../src/modules/payments/application/queries/get-available-products.query';
import { PaymentResponseMapper } from '../../src/modules/payments/api/mappers/payment-response.mapper';
import { PaymentGrpcAdapter } from '../../src/modules/payments/infrastructure/payment-grpc.adapter';
import { PaymentGrpcClient } from '../../src/modules/payments/infrastructure/payment-grpc.client';
import { PaymentController } from '../../src/modules/payments/api/payment.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateCheckoutSessionDto,
  PaymentProviderDto,
} from '../../src/modules/payments/api/dto/create-checkout-session.dto';

const response: GetAvailableProductsResponse = {
  items: [
    {
      productId: '10000000-0000-4000-8000-000000000001',
      name: 'Business - 1 Week',
      amountMinor: 700,
      currency: 'USD',
      billingInterval: BillingInterval.BILLING_INTERVAL_WEEK,
      billingIntervalCount: 1,
    },
    {
      productId: '10000000-0000-4000-8000-000000000002',
      name: 'Business - 1 Month',
      amountMinor: 1200,
      currency: 'USD',
      billingInterval: BillingInterval.BILLING_INTERVAL_MONTH,
      billingIntervalCount: 1,
    },
  ],
};

describe('Available payment products Gateway slice', () => {
  it('maps a repeated transport response without exposing provider identifiers', () => {
    const result = PaymentResponseMapper.toGetAvailableProducts(response);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      productId: response.items[0].productId,
      name: 'Business - 1 Week',
      amountMinor: 700,
      currency: 'USD',
      billingInterval: 'WEEK',
      billingIntervalCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain('providerBillingId');
    expect(JSON.stringify(result)).not.toContain('providerProductId');
  });

  it('uses exactly one Payment call regardless of product count', async () => {
    const getAvailableProducts = jest
      .fn()
      .mockResolvedValue(PaymentResponseMapper.toGetAvailableProducts(response));
    const adapter = {
      getAvailableProducts,
    } as unknown as PaymentGrpcAdapter;
    const handler = new GetAvailableProductsHandler(adapter);

    const result = await handler.execute(new GetAvailableProductsQuery());

    expect(result.items).toHaveLength(2);
    expect(getAvailableProducts).toHaveBeenCalledTimes(1);
  });

  it('uses one gRPC client call for the complete product array', async () => {
    const getAvailableProducts = jest.fn().mockResolvedValue(response);
    const client = {
      getAvailableProducts,
    } as unknown as PaymentGrpcClient;
    const adapter = new PaymentGrpcAdapter(client);

    await expect(adapter.getAvailableProducts()).resolves.toEqual(
      PaymentResponseMapper.toGetAvailableProducts(response),
    );
    expect(getAvailableProducts).toHaveBeenCalledTimes(1);
    expect(getAvailableProducts).toHaveBeenCalledWith({});
  });

  it('returns items empty after one Payment call', async () => {
    const getAvailableProducts = jest.fn().mockResolvedValue({ items: [] });
    const adapter = {
      getAvailableProducts,
    } as unknown as PaymentGrpcAdapter;
    const handler = new GetAvailableProductsHandler(adapter);

    await expect(handler.execute(new GetAvailableProductsQuery())).resolves.toEqual({ items: [] });
    expect(getAvailableProducts).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown billing interval', () => {
    expect(() =>
      PaymentResponseMapper.toGetAvailableProducts({
        items: [{ ...response.items[0], billingInterval: BillingInterval.UNRECOGNIZED }],
      }),
    ).toThrow('Payment service returned an invalid response');
  });

  it('uses the same JWT guard policy as Checkout', () => {
    const productsHandler = Object.getOwnPropertyDescriptor(
      PaymentController.prototype,
      'getAvailableProducts',
    )?.value as object;
    const checkoutHandler = Object.getOwnPropertyDescriptor(
      PaymentController.prototype,
      'createCheckoutSession',
    )?.value as object;
    const productsGuards = Reflect.getMetadata(GUARDS_METADATA, productsHandler);
    const checkoutGuards = Reflect.getMetadata(GUARDS_METADATA, checkoutHandler);

    expect(productsGuards).toEqual(checkoutGuards);
  });

  it('returns a productId accepted by the existing Checkout DTO', () => {
    const dto = plainToInstance(CreateCheckoutSessionDto, {
      productId: response.items[0].productId,
      provider: PaymentProviderDto.STRIPE,
      autoRenewConsent: true,
    });

    expect(validateSync(dto)).toEqual([]);
  });
});
