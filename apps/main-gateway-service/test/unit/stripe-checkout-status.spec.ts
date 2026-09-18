import { PaymentProvider } from '../../../../libs/contracts/src';
import { DomainException } from '../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../libs/common/src/exceptions/domain-exception-codes';
import { PaymentRequestMapper } from '../../src/modules/payments/api/mappers/payment-request.mapper';
import {
  GetCheckoutSessionStatusByProviderIdHandler,
  GetCheckoutSessionStatusByProviderIdQuery,
} from '../../../micro-payment-service/src/modules/payment/application/queries/get-checkout-session-status-by-provider-id.query';
import { CheckoutStatus } from '../../../micro-payment-service/src/modules/payment/domain/enums/checkout-status.enum';
import { ICheckoutStatusQueryPort } from '../../../micro-payment-service/src/modules/payment/application/ports/payment-query.port';

describe('Stripe checkout status by provider session ID', () => {
  const userId = 'f1b6de4c-d0df-4e19-9592-d1a66a1edfe2';
  const providerCheckoutId = 'cs_test_owner_checkout';

  it('maps the authenticated user and Stripe provider into the gRPC request', () => {
    expect(
      PaymentRequestMapper.toGetCheckoutSessionStatusByProviderId({ userId, providerCheckoutId }),
    ).toEqual({
      userId,
      paymentProvider: PaymentProvider.STRIPE,
      providerCheckoutId,
    });
  });

  it('returns the owner status and hides missing or foreign sessions as Not Found', async () => {
    const findOwnedCheckoutStatusByProviderId = jest
      .fn()
      .mockResolvedValueOnce({
        checkoutSessionId: '72dc84dd-5fe7-4ad1-ab66-fc1545f4d8df',
        status: CheckoutStatus.COMPLETED,
        resultingSubscriptionId: '56e8ef16-176a-4ff9-ae2f-aab5c7fe77f4',
        completedAt: new Date('2026-09-18T09:00:00.000Z'),
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const handler = new GetCheckoutSessionStatusByProviderIdHandler({
      findOwnedCheckoutStatusByProviderId,
    } as unknown as ICheckoutStatusQueryPort);

    await expect(
      handler.execute(
        new GetCheckoutSessionStatusByProviderIdQuery({
          userId,
          provider: 'STRIPE',
          providerCheckoutId,
        }),
      ),
    ).resolves.toEqual({
      status: CheckoutStatus.COMPLETED,
      subscriptionId: '56e8ef16-176a-4ff9-ae2f-aab5c7fe77f4',
    });

    for (const lookup of ['cs_test_foreign', 'cs_test_missing']) {
      await expect(
        handler.execute(
          new GetCheckoutSessionStatusByProviderIdQuery({
            userId,
            provider: 'STRIPE',
            providerCheckoutId: lookup,
          }),
        ),
      ).rejects.toMatchObject<Partial<DomainException>>({ code: DomainExceptionCode.NotFound });
    }

    expect(findOwnedCheckoutStatusByProviderId).toHaveBeenNthCalledWith(1, {
      userId,
      provider: 'STRIPE',
      providerCheckoutId,
    });
  });
});
