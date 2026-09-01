import { Prisma } from '@prisma/client/extension';
import TransactionClient = Prisma.TransactionClient;

export abstract class ITransactionManager {
  abstract execute<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
}
