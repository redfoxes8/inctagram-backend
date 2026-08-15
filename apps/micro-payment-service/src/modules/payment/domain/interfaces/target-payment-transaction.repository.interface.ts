import { TargetPaymentTransactionEntity } from '../entities/target-payment-transaction.entity';
import { IdempotencyKey } from '../value-objects/idempotency-key.value-object';
import { ProviderCode } from '../value-objects/provider-code.value-object';

export type PaymentProviderIdentifierLookup = {
  provider: ProviderCode;
  providerIdentifier: string;
};

export abstract class ITargetPaymentTransactionRepository {
  abstract insert(transaction: TargetPaymentTransactionEntity): Promise<void>;
  abstract save(transaction: TargetPaymentTransactionEntity): Promise<void>;
  abstract findById(id: string): Promise<TargetPaymentTransactionEntity | null>;
  abstract findByIdempotencyKey(
    key: IdempotencyKey,
  ): Promise<TargetPaymentTransactionEntity | null>;
  abstract findByProviderTransactionId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<TargetPaymentTransactionEntity | null>;
  abstract findByProviderInvoiceId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<TargetPaymentTransactionEntity | null>;
  abstract findByCheckoutSessionId(
    checkoutSessionId: string,
  ): Promise<TargetPaymentTransactionEntity[]>;
  abstract findBySubscriptionId(subscriptionId: string): Promise<TargetPaymentTransactionEntity[]>;
}
