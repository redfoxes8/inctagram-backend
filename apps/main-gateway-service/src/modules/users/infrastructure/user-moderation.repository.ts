import { Injectable } from '@nestjs/common';
import { requireGatewayTransaction } from '../../../core/prisma/transactions/require-gateway-transaction';
import { lockGatewayUser } from '../../../core/prisma/transactions/lock-gateway-user';
import {
  UserModerationRepository,
  type ModeratedUser,
} from '../domain/interfaces/user-moderation.repository';

@Injectable()
export class PrismaUserModerationRepository extends UserModerationRepository {
  async setDeleted(input: {
    userId: string;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void> {
    // Caller owns the shared User row lock and has established deletedAt === null.
    // Do not touch confirmation, ban, profile data or payment state.
    await requireGatewayTransaction(input.transaction).user.update({
      where: { id: input.userId },
      data: { deletedAt: input.occurredAt, updatedAt: input.occurredAt },
    });
  }
  async lockUser(input: { userId: string; transaction: unknown }): Promise<ModeratedUser | null> {
    return lockGatewayUser({
      userId: input.userId,
      transaction: requireGatewayTransaction(input.transaction),
    });
  }

  async setBanned(input: {
    userId: string;
    isBanned: boolean;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void> {
    await requireGatewayTransaction(input.transaction).user.update({
      where: { id: input.userId },
      data: { isBanned: input.isBanned, updatedAt: input.occurredAt },
    });
  }

  async revokeSessionsAndEnqueue(input: {
    userId: string;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void> {
    const transaction = requireGatewayTransaction(input.transaction);
    const sessions = await transaction.session.findMany({
      where: { userId: input.userId },
      select: { id: true },
    });
    // Keep tombstones: a fresh login cannot resurrect the same device through an upsert.
    await transaction.session.updateMany({
      where: { userId: input.userId, deletedAt: null },
      data: { deletedAt: input.occurredAt, updatedAt: input.occurredAt },
    });
    await transaction.userAccessRevokeOutbox.create({
      data: {
        userId: input.userId,
        sessionIds: sessions.map((session) => session.id),
        createdAt: input.occurredAt,
        availableAt: input.occurredAt,
      },
    });
  }
}
