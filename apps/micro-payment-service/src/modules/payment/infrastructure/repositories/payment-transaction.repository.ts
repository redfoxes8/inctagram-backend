import { IPaymentTransactionRepository } from '../../domain/interfaces/payment-transaction.repository.interface';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PaymentTransactionEntity } from '../../domain/entities/payment-transaction.entity';
import { PaymentTransactionStatusDomain } from '../../domain/enums/payment-transaction-status.enum';
import { PaymentTransactionProvidersDomain } from '../../domain/enums/providers.enum';
import { PaymentTransaction } from '../../../../core/prisma/client';
import { PaymentTransactionPrismaRecordToUpsert, PrismaMapper } from '../mappers/prisma.mapper';

type PaymentTransactionPrismaRecord = PaymentTransaction;

@Injectable()
export class PaymentTransactionRepository implements IPaymentTransactionRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async save(paymentTransactionDomain: PaymentTransactionEntity): Promise<void> {
    const prismaRecord: PaymentTransactionPrismaRecordToUpsert =
      PrismaMapper.paymentTransactionToPrismaRecord(paymentTransactionDomain);
    await this.prismaService.paymentTransaction.upsert({
      where: { id: prismaRecord.id },
      update: prismaRecord,
      create: prismaRecord,
    });
  }

  async findById(id: string): Promise<PaymentTransactionEntity | null> {
    const result: PaymentTransactionPrismaRecord | null =
      await this.prismaService.paymentTransaction.findUnique({
        where: { id: id },
      });
    if (!result) {
      return null;
    }
    return PrismaMapper.paymentTransactionToDomain(result);
  }

  async findBySubscriptionId(id: string): Promise<PaymentTransactionEntity | null> {
    const result: PaymentTransactionPrismaRecord | null =
      await this.prismaService.paymentTransaction.findUnique({
        where: { subscriptionId: id },
      });
    if (!result) {
      return null;
    }
    return PrismaMapper.paymentTransactionToDomain(result);
  }

  async findByStatus(
    status: PaymentTransactionStatusDomain,
  ): Promise<PaymentTransactionEntity[] | null> {
    const result: PaymentTransactionPrismaRecord[] | [] =
      await this.prismaService.paymentTransaction.findMany({
        where: { status: status },
      });
    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.paymentTransactionToDomainMany(result);
  }

  async findByProvider(
    provider: PaymentTransactionProvidersDomain,
  ): Promise<PaymentTransactionEntity[] | null> {
    const result: PaymentTransactionPrismaRecord[] | [] =
      await this.prismaService.paymentTransaction.findMany({
        where: { provider: provider },
      });

    if (result.length === 0) {
      return null;
    }
    return PrismaMapper.paymentTransactionToDomainMany(result);
  }

  async deleteById(id: string): Promise<void> {
    await this.prismaService.paymentTransaction.delete({
      where: { id: id },
    });
    return;
  }
}
