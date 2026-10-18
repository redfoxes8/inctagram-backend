import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../client';
import { ITransactionManager } from '../../../common/interfaces/transaction-manager.interface';
import { withGatewayTransaction } from './require-gateway-transaction';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaTransactionManager implements ITransactionManager {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction((tx: TransactionClient) => {
      return withGatewayTransaction({ transaction: tx, callback });
    });
  }
}
