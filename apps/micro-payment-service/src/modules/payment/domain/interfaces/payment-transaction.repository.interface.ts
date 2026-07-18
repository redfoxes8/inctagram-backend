import { PaymentTransactionEntity } from '../entities/payment-transaction.entity';
import { PaymentTransactionStatus } from '../enums/payment-transaction-status.enum';
import { Providers } from '../enums/providers.enum';

export abstract class IPaymentTransactionRepository {
  abstract save(paymentTransaction: PaymentTransactionEntity): void;

  abstract findById(id: string): PaymentTransactionEntity;

  abstract findBySubscriptionId(id: string): PaymentTransactionEntity;

  abstract findByStatus(status: PaymentTransactionStatus): PaymentTransactionEntity[];

  abstract findByProvider(provider: Providers): PaymentTransactionEntity[];

  abstract deleteById(id: string): void;
}
