import { Injectable } from '@nestjs/common';
import { ITransactionManager } from '../../../../common/interfaces/transaction-manager.interface';
import { AdminUserActionAuditWriter } from '../../domain/interfaces/admin-user-action-audit.writer';
import {
  UserModerationRepository,
  type UserModerationAction,
  type UserModerationResult,
} from '../../domain/interfaces/user-moderation.repository';
import { UserAccessClock } from '../../../sessions/application/user-access-check';

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
  }): Promise<{ userId: string } & UserModerationResult> {
    return this.transactions.execute(async (transaction) => {
      const user = await this.users.lockUser({ userId: input.userId, transaction });
      let result: UserModerationResult;
      if (input.action === 'BLOCK') {
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
      if (result.outcome === 'BLOCKED' || result.outcome === 'UNBLOCKED') {
        await this.users.setBanned({
          userId: input.userId,
          isBanned: result.outcome === 'BLOCKED',
          occurredAt,
          transaction,
        });
        if (result.outcome === 'BLOCKED')
          await this.users.revokeSessionsAndEnqueue({
            userId: input.userId,
            occurredAt,
            transaction,
          });
      }
      // Includes all no-ops and NOT_FOUND; no FK to a missing User or expired AdminSession.
      await this.audit.append({
        transaction,
        entry: {
          ...result,
          targetUserId: input.userId,
          occurredAt,
          adminSessionId: input.adminSessionId,
        },
      });
      return { ...result, userId: input.userId };
    });
  }
}
