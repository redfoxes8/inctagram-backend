import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';
import { PaymentTransactionStatusDomain } from '../enums/payment-transaction-status.enum';
import { PaymentTransactionProvidersDomain } from '../enums/providers.enum';

export abstract class IPaymentTransactionRepository {
  abstract save(paymentTransaction: PaymentTransactionEntity): Promise<void>;

  abstract findById(id: string): Promise<PaymentTransactionEntity | null>;

  abstract findBySubscriptionId(id: string): Promise<PaymentTransactionEntity | null>;

  abstract findByStatus(
    status: PaymentTransactionStatusDomain,
  ): Promise<PaymentTransactionEntity[] | null>;

  abstract findByProvider(
    provider: PaymentTransactionProvidersDomain,
  ): Promise<PaymentTransactionEntity[] | null>;

  abstract deleteById(id: string): Promise<void>;
}
