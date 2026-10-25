import { randomUUID } from 'node:crypto';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { lockGatewayUser } from '../../../core/prisma/transactions/lock-gateway-user';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import { MAX_PAYMENT_PROFILE_VERSION } from '../../../../../../libs/contracts/src/events/payment-user-profile-snapshot';
import {
  parsePaymentUserProfileChangedV1,
  PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE,
} from '../../../../../../libs/contracts/src/events/payment-user-profile-changed-v1.event';

// Caller has changed projected state in this SAME tx. No network, standalone tx or entity revision.
export async function writePaymentUserProfileSnapshot(input: {
  userId: string;
  transaction: unknown;
  occurredAt?: Date;
}): Promise<void> {
  const transaction = requireGatewayTransaction(input.transaction);
  const user = await lockGatewayUser({ userId: input.userId, transaction });
  if (!user) {
    throw new DomainException({ code: DomainExceptionCode.NotFound, message: 'User not found' });
  }
  const rows = await transaction.$queryRaw<{ version: bigint }[]>`
    UPDATE "User" SET "paymentProfileVersion" = "paymentProfileVersion" + 1
    WHERE "id" = ${input.userId} AND "paymentProfileVersion" < ${MAX_PAYMENT_PROFILE_VERSION}
    RETURNING "paymentProfileVersion" AS version
  `;
  if (rows.length !== 1) {
    throw new DomainException({
      code: DomainExceptionCode.ServiceUnavailable,
      message: 'User profile snapshot unavailable',
    });
  }
  const profile = await transaction.profile.findUnique({
    where: { userId: input.userId },
    select: { username: true },
  });
  const occurredAt = input.occurredAt ?? new Date();
  const event = parsePaymentUserProfileChangedV1({
    eventId: randomUUID(),
    eventType: PAYMENT_USER_PROFILE_CHANGED_EVENT_TYPE,
    schemaVersion: 1,
    occurredAt: occurredAt.toISOString(),
    userId: input.userId,
    sourceVersion: rows[0].version.toString(),
    username: user.deletedAt === null && profile ? profile.username : null,
    profileExists: profile !== null,
    isDeleted: user.deletedAt !== null,
  });
  await transaction.paymentUserProfileOutbox.create({
    data: {
      id: event.eventId,
      userId: input.userId,
      sourceVersion: rows[0].version,
      payload: event,
      createdAt: occurredAt,
      availableAt: occurredAt,
    },
  });
}
