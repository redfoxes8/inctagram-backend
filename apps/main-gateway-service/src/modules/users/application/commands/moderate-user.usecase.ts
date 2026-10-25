import { Injectable } from '@nestjs/common';
import { ITransactionManager } from '../../../../common/interfaces/transaction-manager.interface';
import { AdminUserActionAuditWriter } from '../../domain/interfaces/admin-user-action-audit.writer';
import {
  UserModerationRepository,
  type UserModerationAction,
  type UserModerationResult,
} from '../../domain/interfaces/user-moderation.repository';
import { UserAccessClock } from '../../../sessions/application/user-access-check';
import { normalizeUserBanReason } from '../../../../../../../libs/common/src/validation/normalize-user-ban-reason';
import type { UserBanReason } from '../../../../../../../libs/common/types/user-ban-reason';

@Injectable()
export class ModerateUserUseCase {
  constructor(
    private readonly transactions: ITransactionManager,
    private readonly users: UserModerationRepository,
    private readonly audit: AdminUserActionAuditWriter,
    private readonly clock: UserAccessClock,
  ) {}

  async execute(input: {
    userId: string;
    action: UserModerationAction;
    adminSessionId: string;
    reason?: unknown;
  }): Promise<{ userId: string } & UserModerationResult> {
    // Validate even a no-op/missing target before opening a transaction.
    const reason = input.action === 'BLOCK' ? normalizeUserBanReason(input.reason) : null;
    return this.transactions.execute(async (transaction) => {
      const user = await this.users.lockUser({ userId: input.userId, transaction });
      let result: UserModerationResult;
      if (input.action === 'DELETE') {
        result = {
          action: 'DELETE',
          outcome: !user ? 'NOT_FOUND' : user.deletedAt !== null ? 'ALREADY_DELETED' : 'DELETED',
        };
      } else if (input.action === 'BLOCK') {
        result = {
          action: 'BLOCK',
          outcome: !user
            ? 'NOT_FOUND'
            : user.deletedAt
              ? 'USER_DELETED'
              : user.isBanned
                ? 'ALREADY_BLOCKED'
                : 'BLOCKED',
        };
      } else {
        result = {
          action: 'UNBLOCK',
          outcome: !user
            ? 'NOT_FOUND'
            : user.deletedAt
              ? 'USER_DELETED'
              : user.isBanned
                ? 'UNBLOCKED'
                : 'ALREADY_ACTIVE',
        };
      }
      const occurredAt = this.clock.now();
      let reasonSnapshot: UserBanReason | null = null;
      if (result.outcome === 'DELETED') {
        await this.users.setDeleted({ userId: input.userId, occurredAt, transaction });
        await this.users.revokeSessionsAndEnqueue({
          userId: input.userId,
          occurredAt,
          transaction,
        });
      }
      if (result.outcome === 'BLOCKED') {
        await this.users.setBannedWithReason({
          userId: input.userId,
          reason,
          occurredAt,
          transaction,
        });
        reasonSnapshot = reason;
        await this.users.revokeSessionsAndEnqueue({
          userId: input.userId,
          occurredAt,
          transaction,
        });
      } else if (user && result.outcome === 'ALREADY_BLOCKED') {
        reasonSnapshot = user.banReason;
      } else if (user && result.outcome === 'UNBLOCKED') {
        reasonSnapshot = user.banReason;
        await this.users.clearBanAndReason({ userId: input.userId, occurredAt, transaction });
      }
      // Includes all no-ops and NOT_FOUND; no FK to a missing User or expired AdminSession.
      await this.audit.append({
        transaction,
        entry: {
          ...result,
          targetUserId: input.userId,
          occurredAt,
          adminSessionId: input.adminSessionId,
          reasonSnapshot,
        },
      });
      return { ...result, userId: input.userId };
    });
  }
}
