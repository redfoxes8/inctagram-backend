import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';
import { IdempotencyKey } from '../value-objects/idempotency-key.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

export type PaymentProviderIdentifierLookup = {
  provider: ProviderCode;
  providerIdentifier: string;
};

export type PaymentTransactionInsertResult = Readonly<{
  transaction: PaymentTransactionEntity;
  inserted: boolean;
}>;

export abstract class IPaymentTransactionRepository {
  abstract insert(transaction: PaymentTransactionEntity): Promise<void>;
  abstract insertOrGetByProviderInvoiceId(
    transaction: PaymentTransactionEntity,
  ): Promise<PaymentTransactionInsertResult>;
  abstract save(transaction: PaymentTransactionEntity): Promise<void>;
  abstract findById(id: string): Promise<PaymentTransactionEntity | null>;
  abstract findByIdempotencyKey(key: IdempotencyKey): Promise<PaymentTransactionEntity | null>;
  abstract findByProviderTransactionId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<PaymentTransactionEntity | null>;
  abstract findByProviderInvoiceId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<PaymentTransactionEntity | null>;
  abstract findByCheckoutSessionId(checkoutSessionId: string): Promise<PaymentTransactionEntity[]>;
  abstract findBySubscriptionId(subscriptionId: string): Promise<PaymentTransactionEntity[]>;
}
