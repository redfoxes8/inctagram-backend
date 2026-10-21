import { mapSuperadminPaymentHistory } from '../../src/modules/superadmin/infrastructure/superadmin-payment-history.mapper';
import { SuperadminPaymentsConfig } from '../../src/modules/superadmin/infrastructure/superadmin-payments.config';
import { ConfigService } from '@nestjs/config';
import type { GetPaymentHistoryResponse } from '../../../../libs/contracts/src/generated/payment';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';

function response(): GetPaymentHistoryResponse {
  return {
    items: [
      {
        transactionId: 'transaction-fixture',
        productId: 'product-fixture',
        productName: 'Fixture',
        currency: 'USD',
        amountMinor: 2147483647,
        billingInterval: 1,
        billingIntervalCount: 1,
        paymentProvider: 1,
        kind: 1,
        status: 1,
        createdAt: { seconds: 0, nanos: 999999999 },
      },
    ],
    page: 1,
    pageSize: 8,
    totalCount: 1,
    pagesCount: 1,
  };
}

describe('Superadmin Payment boundary (unit, no transport)', () => {
  it('preserves int32 max and valid timestamp nanoseconds as millisecond UTC; never rescales money', () => {
    const page = mapSuperadminPaymentHistory({
      response: response(),
      request: { page: 1, pageSize: 8 },
    });
    expect(page.items[0]).toMatchObject({
      amountMinor: 2147483647,
      createdAt: '1970-01-01T00:00:00.999Z',
      billingInterval: 'WEEK',
      provider: 'STRIPE',
      kind: 'PURCHASE',
      status: 'PENDING',
    });
  });
  it.each([2147483648, Number.MAX_SAFE_INTEGER + 1, -1, 1.5, NaN, Infinity])(
    'rejects invalid GraphQL Int amount: %s',
    (amountMinor) => {
      const upstream = response();
      upstream.items[0].amountMinor = amountMinor;
      expect(() =>
        mapSuperadminPaymentHistory({ response: upstream, request: { page: 1, pageSize: 8 } }),
      ).toThrow(DomainException);
    },
  );
  it.each([
    { seconds: 253402300800, nanos: 0 },
    { seconds: -62135596801, nanos: 0 },
    { seconds: 1, nanos: 1000000000 },
    { seconds: 1, nanos: -1 },
    { seconds: NaN, nanos: 0 },
  ])('rejects invalid protobuf timestamp %j', (createdAt) => {
    const upstream = response();
    upstream.items[0].createdAt = createdAt;
    expect(() =>
      mapSuperadminPaymentHistory({ response: upstream, request: { page: 1, pageSize: 8 } }),
    ).toThrow(DomainException);
  });
  it.each(['billingInterval', 'paymentProvider', 'kind', 'status', 'checkoutPurpose'] as const)(
    'rejects UNSPECIFIED enum %s instead of inventing values',
    (key) => {
      const upstream = response();
      Object.assign(upstream.items[0], { [key]: 0 });
      expect(() =>
        mapSuperadminPaymentHistory({ response: upstream, request: { page: 1, pageSize: 8 } }),
      ).toThrow(DomainException);
    },
  );
  it.each(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])(
    'maps status %s explicitly by proto value',
    (status) => {
      const statuses = [
        'PENDING',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ];
      const upstream = response();
      upstream.items[0].status = statuses.indexOf(status) + 1;
      expect(
        mapSuperadminPaymentHistory({ response: upstream, request: { page: 1, pageSize: 8 } })
          .items[0].status,
      ).toBe(status);
    },
  );
  it.each(['0', '-1', '30001', 'not-a-number', true, {}, 1.5])(
    'invalid timeout %j fails only the Payments feature',
    (value) => {
      const config = new SuperadminPaymentsConfig(
        new ConfigService({ SUPERADMIN_PAYMENTS_TIMEOUT_MS: value }),
      );
      expect(() => config.timeoutMs).toThrow(DomainException);
    },
  );
  it('defaults to existing 3000ms convention', () => {
    expect(new SuperadminPaymentsConfig(new ConfigService()).timeoutMs).toBe(3000);
  });
});
