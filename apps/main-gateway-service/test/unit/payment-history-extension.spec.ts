import {
  BillingInterval,
  CheckoutPurpose,
  GetPaymentHistoryResponse,
  PaymentKind,
  PaymentProvider,
  PaymentTransactionStatus,
} from '../../../../libs/contracts/src';
import { PaymentResponseMapper } from '../../src/modules/payments/api/mappers/payment-response.mapper';
import { PrismaService } from '../../../micro-payment-service/src/core/prisma/prisma.service';
import { PaymentQueryRepository } from '../../../micro-payment-service/src/modules/payment/infrastructure/repositories/payment-query.repository';

describe('Payment history subscription projection', () => {
  const subscriptionId = '6e7570ad-7888-4400-80b1-0766aa424161';
  const subscriptionEndsAt = new Date('2026-09-03T12:26:54.000Z');
  const createdAt = new Date('2026-08-27T12:26:54.000Z');

  it('projects the linked subscription in the same history query and preserves nulls', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'a33b0d32-54d1-49c9-8050-2eb86381b7ef',
        userId: '58d32bd6-9ea9-4bb4-bb49-daa9d11f5361',
        createdAt,
        paidAt: createdAt,
        amountMinor: 800,
        currency: 'USD',
        provider: 'STRIPE',
        kind: 'PURCHASE',
        status: 'SUCCEEDED',
        product: {
          id: 'aecb2328-a369-4128-a59a-e4d2f92b155c',
          code: 'BUSINESS_WEEK',
          name: 'Business — 1 Week',
          billingInterval: 'WEEK',
          billingIntervalCount: 1,
        },
        checkoutSession: { purpose: 'INITIAL_SUBSCRIPTION' },
        subscription: { id: subscriptionId, endsAt: subscriptionEndsAt },
      },
      {
        id: 'fe84524d-36c5-4e0d-9d30-875c6d3083c5',
        userId: '58d32bd6-9ea9-4bb4-bb49-daa9d11f5361',
        createdAt,
        paidAt: null,
        amountMinor: 800,
        currency: 'USD',
        provider: 'STRIPE',
        kind: 'PURCHASE',
        status: 'FAILED',
        product: {
          id: 'aecb2328-a369-4128-a59a-e4d2f92b155c',
          code: 'BUSINESS_WEEK',
          name: 'Business — 1 Week',
          billingInterval: 'WEEK',
          billingIntervalCount: 1,
        },
        checkoutSession: null,
        subscription: null,
      },
    ]);
    const count = jest.fn().mockResolvedValue(2);
    const prisma = {
      paymentTransaction: { findMany, count },
      $transaction: (operations: Promise<unknown>[]): Promise<unknown[]> => Promise.all(operations),
    };
    const repository = new PaymentQueryRepository(prisma as unknown as PrismaService);

    const result = await repository.getPaymentHistory({
      userId: '58d32bd6-9ea9-4bb4-bb49-daa9d11f5361',
      page: { page: 1, pageSize: 10 },
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          subscription: { select: { id: true, endsAt: true } },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ subscriptionId, subscriptionEndsAt }),
    );
    expect(result.items[0].subscriptionEndsAt).not.toBe(subscriptionEndsAt);
    expect(result.items[1]).toEqual(
      expect.objectContaining({ subscriptionId: null, subscriptionEndsAt: null }),
    );
    expect(result).toEqual(expect.objectContaining({ page: 1, pageSize: 10, totalCount: 2 }));
  });

  it('maps an optional gRPC subscription timestamp to ISO or explicit HTTP nulls', () => {
    const response: GetPaymentHistoryResponse = {
      items: [
        {
          transactionId: 'a33b0d32-54d1-49c9-8050-2eb86381b7ef',
          productName: 'Business — 1 Week',
          currency: 'USD',
          paidAt: undefined,
          createdAt: { seconds: 1_777_896_414, nanos: 0 },
          productId: 'aecb2328-a369-4128-a59a-e4d2f92b155c',
          billingInterval: BillingInterval.BILLING_INTERVAL_WEEK,
          billingIntervalCount: 1,
          paymentProvider: PaymentProvider.STRIPE,
          kind: PaymentKind.PAYMENT_KIND_PURCHASE,
          status: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_SUCCEEDED,
          amountMinor: 800,
          checkoutPurpose: CheckoutPurpose.CHECKOUT_PURPOSE_INITIAL_SUBSCRIPTION,
          subscriptionId,
          subscriptionEndsAt: { seconds: subscriptionEndsAt.getTime() / 1000, nanos: 0 },
        },
        {
          transactionId: 'fe84524d-36c5-4e0d-9d30-875c6d3083c5',
          productName: 'Business — 1 Week',
          currency: 'USD',
          paidAt: undefined,
          createdAt: { seconds: 1_777_896_414, nanos: 0 },
          productId: 'aecb2328-a369-4128-a59a-e4d2f92b155c',
          billingInterval: BillingInterval.BILLING_INTERVAL_WEEK,
          billingIntervalCount: 1,
          paymentProvider: PaymentProvider.STRIPE,
          kind: PaymentKind.PAYMENT_KIND_PURCHASE,
          status: PaymentTransactionStatus.PAYMENT_TRANSACTION_STATUS_FAILED,
          amountMinor: 800,
          checkoutPurpose: undefined,
          subscriptionId: undefined,
          subscriptionEndsAt: undefined,
        },
      ],
      totalCount: 2,
      page: 1,
      pageSize: 10,
      pagesCount: 1,
    };

    const result = PaymentResponseMapper.toGetPaymentHistory(response);

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        subscriptionId,
        subscriptionEndsAt: '2026-09-03T12:26:54.000Z',
      }),
    );
    expect(result.items[1]).toEqual(
      expect.objectContaining({ subscriptionId: null, subscriptionEndsAt: null }),
    );
  });
});
