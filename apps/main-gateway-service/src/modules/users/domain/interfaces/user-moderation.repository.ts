import type { AdminUserActionResult } from '../../../../../../../libs/common/types/admin-user-action-audit';
import type { UserBanReason } from '../../../../../../../libs/common/types/user-ban-reason';

export type UserModerationAction = 'BLOCK' | 'UNBLOCK' | 'DELETE';
export type UserModerationResult = Extract<AdminUserActionResult, { action: UserModerationAction }>;
export type ModeratedUser = {
  isBanned: boolean;
  deletedAt: Date | null;
  banReason: UserBanReason | null;
};

export abstract class UserModerationRepository {
  // Caller owns the User lock. No session/audit side effects: S3 coordinates those in the same tx.
  abstract setBannedWithReason(input: {
    userId: string;
    reason: UserBanReason | null;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void>;
  abstract clearBanAndReason(input: {
    userId: string;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void>;
  abstract setDeleted(input: {
    userId: string;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void>;
  abstract lockUser(input: { userId: string; transaction: unknown }): Promise<ModeratedUser | null>;
  abstract setBanned(input: {
    userId: string;
    isBanned: boolean;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void>;
  abstract revokeSessionsAndEnqueue(input: {
    userId: string;
    occurredAt: Date;
    transaction: unknown;
  }): Promise<void>;
}
