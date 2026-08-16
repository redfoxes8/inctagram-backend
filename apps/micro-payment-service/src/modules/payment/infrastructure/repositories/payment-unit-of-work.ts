import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../core/prisma/client';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import {
  IPaymentUnitOfWork,
  PaymentUnitOfWorkCallback,
  PaymentUnitOfWorkContext,
} from '../../application/ports/payment-unit-of-work.port';
import { assertUuidIdentifier } from '../../domain/specifications/uuid-identifier.specification';
import { CheckoutSessionRepository } from './checkout-session.repository';
import { PaymentOutboxWriter } from './payment-outbox.writer';
import { PaymentTransactionRepository } from './payment-transaction.repository';
import { ProductRepository } from './product.repository';
import { ProductProviderRepository } from './product-provider.repository';
import { ProviderCustomerRepository } from './provider-customer.repository';
import { ProviderWebhookEventRepository } from './provider-webhook-event.repository';
import { SubscriptionRepository } from './subscription.repository';

type AdvisoryLockResult = { pg_advisory_xact_lock: null };

@Injectable()
export class PaymentUnitOfWork implements IPaymentUnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  public async execute<TResult>(work: PaymentUnitOfWorkCallback<TResult>): Promise<TResult> {
    return this.prisma.$transaction(async (transaction) => {
      const context: PaymentUnitOfWorkContext = {
        products: new ProductRepository(transaction),
        productProviders: new ProductProviderRepository(transaction),
        providerCustomers: new ProviderCustomerRepository(transaction),
        checkoutSessions: new CheckoutSessionRepository(transaction),
        paymentTransactions: new PaymentTransactionRepository(transaction),
        subscriptions: new SubscriptionRepository(transaction),
        providerWebhookEvents: new ProviderWebhookEventRepository(transaction),
        outbox: new PaymentOutboxWriter(transaction),
        lockUser: async (userId: string): Promise<void> => {
          assertUuidIdentifier(userId);
          await transaction.$queryRaw<AdvisoryLockResult[]>(Prisma.sql`
            SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
          `);
        },
      };
      return work(context);
    });
  }
}
