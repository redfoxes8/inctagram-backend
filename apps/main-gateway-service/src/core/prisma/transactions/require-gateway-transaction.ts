import type { Prisma } from '../client';
import type { GatewayOutbox } from './gateway-outbox-wakeup';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

const activeTransactions = new WeakSet<object>();
const pendingOutboxes = new WeakMap<object, Set<GatewayOutbox>>();

// Prisma's runtime proxy shape is not proof of an interactive transaction. Track only handles
// issued by our existing manager, and release them as soon as its awaited callback finishes.
export async function withGatewayTransaction<Result>(input: {
  transaction: Prisma.TransactionClient;
  callback: (transaction: Prisma.TransactionClient) => Promise<Result>;
  outboxes?: Set<GatewayOutbox>;
}): Promise<Result> {
  if (activeTransactions.has(input.transaction)) return input.callback(input.transaction);
  activeTransactions.add(input.transaction);
  if (input.outboxes) pendingOutboxes.set(input.transaction, input.outboxes);
  try {
    return await input.callback(input.transaction);
  } finally {
    activeTransactions.delete(input.transaction);
    pendingOutboxes.delete(input.transaction);
  }
}

export function wakeGatewayOutboxAfterCommit(input: {
  transaction: unknown;
  outbox: GatewayOutbox;
}): void {
  const transaction = requireGatewayTransaction(input.transaction);
  // A borrowed handle alone does not establish that its outer transaction committed.
  pendingOutboxes.get(transaction)?.add(input.outbox);
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
