import type { Prisma } from '../client';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

const activeTransactions = new WeakSet<object>();

// Prisma's runtime proxy shape is not proof of an interactive transaction. Track only handles
// issued by our existing manager, and release them as soon as its awaited callback finishes.
export async function withGatewayTransaction<Result>(input: {
  transaction: Prisma.TransactionClient;
  callback: (transaction: Prisma.TransactionClient) => Promise<Result>;
}): Promise<Result> {
  activeTransactions.add(input.transaction);
  try {
    return await input.callback(input.transaction);
  } finally {
    activeTransactions.delete(input.transaction);
  }
}

// No root-client/autocommit fallback and no dependency on private Prisma properties/symbols.
export function requireGatewayTransaction(value: unknown): Prisma.TransactionClient {
  if (typeof value === 'object' && value !== null && activeTransactions.has(value)) {
    return value as Prisma.TransactionClient;
  }
  throw new DomainException({
    code: DomainExceptionCode.InternalServerError,
    message: 'Gateway transaction required',
  });
}
