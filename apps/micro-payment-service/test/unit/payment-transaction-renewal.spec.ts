import { PaymentTransactionEntity } from '../../src/modules/payment/domain/entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../../src/modules/payment/domain/enums/payment-transaction-status.enum';
import { Currency } from '../../src/modules/payment/domain/value-objects/currency.value-object';
import { IdempotencyKey } from '../../src/modules/payment/domain/value-objects/idempotency-key.value-object';
import { Money } from '../../src/modules/payment/domain/value-objects/money.value-object';
import { ProviderCode } from '../../src/modules/payment/domain/value-objects/provider-code.value-object';

const TRANSACTION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';
const SUBSCRIPTION_ID = '44444444-4444-4444-8444-444444444444';
const PAID_AT = new Date('2026-08-08T00:00:00.000Z');

function renewal(): PaymentTransactionEntity {
  const transaction = PaymentTransactionEntity.createPendingRenewal({
    id: TRANSACTION_ID,
    userId: USER_ID,
    productId: PRODUCT_ID,
    provider: new ProviderCode('STRIPE'),
    money: new Money({ amountMinor: 800, currency: new Currency('USD') }),
    idempotencyKey: new IdempotencyKey('renewal-invoice-STRIPE-in_test'),
  });
  transaction.correlateRenewalInvoice('in_test');
  return transaction;
}

describe('Renewal transaction monotonicity', () => {
  it('recovers the same failed invoice to succeeded once', () => {
    const transaction = renewal();
    transaction.fail({ failureCode: 'CARD_DECLINED', providerInvoiceId: 'in_test' });

    transaction.succeed({
      subscriptionId: SUBSCRIPTION_ID,
      providerTransactionId: 'pi_test',
      providerInvoiceId: 'in_test',
      paidAt: PAID_AT,
    });
    transaction.succeed({
      subscriptionId: SUBSCRIPTION_ID,
      providerTransactionId: 'pi_test',
      providerInvoiceId: 'in_test',
      paidAt: PAID_AT,
    });

    expect(transaction.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
    expect(transaction.getSubscriptionId()).toBe(SUBSCRIPTION_ID);
    expect(transaction.getFailureCode()).toBeNull();
  });

  it('does not let a late failure roll a succeeded renewal back', () => {
    const transaction = renewal();
    transaction.succeed({
      subscriptionId: SUBSCRIPTION_ID,
      providerTransactionId: 'pi_test',
      providerInvoiceId: 'in_test',
      paidAt: PAID_AT,
    });

    expect(() =>
      transaction.fail({ failureCode: 'LATE_FAILURE', providerInvoiceId: 'in_test' }),
    ).toThrow('Terminal payment transaction cannot transition to failed');
    expect(transaction.getStatus()).toBe(PaymentTransactionStatus.SUCCEEDED);
  });
});
