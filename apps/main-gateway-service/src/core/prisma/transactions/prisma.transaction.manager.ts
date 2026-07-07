import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client/extension';
import TransactionClient = Prisma.TransactionClient;
import { ITransactionManager } from '../../../common/interfaces/transaction-manager.interface';

@Injectable()
export class PrismaTransactionManager implements ITransactionManager {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction((tx: TransactionClient) => {
      return callback(tx);
    });
  }
}
