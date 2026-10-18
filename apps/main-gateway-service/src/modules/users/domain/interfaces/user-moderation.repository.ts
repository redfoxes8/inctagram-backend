import type { AdminUserActionResult } from '../../../../../../../libs/common/types/admin-user-action-audit';

export type UserModerationAction = 'BLOCK' | 'UNBLOCK' | 'DELETE';
export type UserModerationResult = Extract<AdminUserActionResult, { action: UserModerationAction }>;
export type ModeratedUser = { isBanned: boolean; deletedAt: Date | null };

export abstract class UserModerationRepository {
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
