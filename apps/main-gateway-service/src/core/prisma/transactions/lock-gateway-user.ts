import type { Prisma } from '../client';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export type LockedGatewayUser = { id: string; isBanned: boolean; deletedAt: Date | null };

// All session issuance/rotation and moderation lock User FIRST, then Session. SQL UPDATE/delete
// of User also serializes here, including future soft delete. Never hold this lock across AMQP.
export async function lockGatewayUser(input: {
  transaction: Prisma.TransactionClient;
  userId: string;
}): Promise<LockedGatewayUser | null> {
  const users = await input.transaction.$queryRaw<
    LockedGatewayUser[]
  >`SELECT "id", "isBanned", "deletedAt" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
  return users[0] ?? null;
}

export async function lockActiveGatewayUser(input: {
  transaction: Prisma.TransactionClient;
  userId: string;
}): Promise<void> {
  const user = await lockGatewayUser(input);
  if (user && !user.isBanned && user.deletedAt === null) return;
  throw new DomainException({ code: DomainExceptionCode.Unauthorized, message: 'Unauthorized' });
}
