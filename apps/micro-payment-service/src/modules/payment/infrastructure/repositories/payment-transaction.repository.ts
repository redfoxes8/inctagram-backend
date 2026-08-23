import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import {
  IPaymentTransactionRepository,
  PaymentProviderIdentifierLookup,
  PaymentTransactionInsertResult,
} from '../../domain/interfaces/payment-transaction.repository.interface';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.value-object';
import { PaymentPrismaMapper } from '../mappers/payment-prisma.mapper';
import type { PaymentPrismaClient } from './payment-prisma-client.type';

@Injectable()
export class PaymentTransactionRepository implements IPaymentTransactionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PaymentPrismaClient) {}

  public async insert(transaction: PaymentTransactionEntity): Promise<void> {
    await this.prisma.paymentTransaction.create({
      data: PaymentPrismaMapper.paymentTransactionToPrisma(transaction),
    });
  }

  public async insertOrGetByProviderInvoiceId(
    transaction: PaymentTransactionEntity,
  ): Promise<PaymentTransactionInsertResult> {
    const providerInvoiceId = transaction.getProviderInvoiceId();
    if (!providerInvoiceId) throw new Error('Renewal invoice correlation is required');
    const result = await this.prisma.paymentTransaction.createMany({
      data: [PaymentPrismaMapper.paymentTransactionToPrisma(transaction)],
      skipDuplicates: true,
    });
    const persisted = await this.findByProviderInvoiceId({
      provider: transaction.getProvider(),
      providerIdentifier: providerInvoiceId,
    });
    if (!persisted) throw new Error('Renewal invoice transaction conflict is inconsistent');
    return { transaction: persisted, inserted: result.count === 1 };
  }

  public async save(transaction: PaymentTransactionEntity): Promise<void> {
    const data = PaymentPrismaMapper.paymentTransactionToPrisma(transaction);
    await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data });
  }

  public async findById(id: string): Promise<PaymentTransactionEntity | null> {
    const record = await this.prisma.paymentTransaction.findUnique({ where: { id } });
    return record ? PaymentPrismaMapper.paymentTransactionToDomain(record) : null;
  }

  public async findByIdempotencyKey(key: IdempotencyKey): Promise<PaymentTransactionEntity | null> {
    const record = await this.prisma.paymentTransaction.findUnique({
      where: { idempotencyKey: key.getValue() },
    });
    return record ? PaymentPrismaMapper.paymentTransactionToDomain(record) : null;
  }

  public async findByProviderTransactionId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<PaymentTransactionEntity | null> {
    const record = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerTransactionId: {
          provider: lookup.provider.getValue(),
          providerTransactionId: lookup.providerIdentifier,
        },
      },
    });
    return record ? PaymentPrismaMapper.paymentTransactionToDomain(record) : null;
  }

  public async findByProviderInvoiceId(
    lookup: PaymentProviderIdentifierLookup,
  ): Promise<PaymentTransactionEntity | null> {
    const record = await this.prisma.paymentTransaction.findUnique({
      where: {
        provider_providerInvoiceId: {
          provider: lookup.provider.getValue(),
          providerInvoiceId: lookup.providerIdentifier,
        },
      },
    });
    return record ? PaymentPrismaMapper.paymentTransactionToDomain(record) : null;
  }

  public async findByCheckoutSessionId(
    checkoutSessionId: string,
  ): Promise<PaymentTransactionEntity[]> {
    const records = await this.prisma.paymentTransaction.findMany({
      where: { checkoutSessionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.paymentTransactionToDomain(record));
  }

  public async findBySubscriptionId(subscriptionId: string): Promise<PaymentTransactionEntity[]> {
    const records = await this.prisma.paymentTransaction.findMany({
      where: { subscriptionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return records.map((record) => PaymentPrismaMapper.paymentTransactionToDomain(record));
  }
}
