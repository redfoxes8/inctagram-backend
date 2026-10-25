import type { UserBanReason } from './user-ban-reason';

export const ADMIN_USER_ACTION_OUTCOMES = {
  BLOCK: ['BLOCKED', 'ALREADY_BLOCKED', 'USER_DELETED', 'NOT_FOUND'],
  UNBLOCK: ['UNBLOCKED', 'ALREADY_ACTIVE', 'USER_DELETED', 'NOT_FOUND'],
  DELETE: ['DELETED', 'ALREADY_DELETED', 'NOT_FOUND'],
} as const;

type Action = keyof typeof ADMIN_USER_ACTION_OUTCOMES;
export type AdminUserActionResult = {
  [Name in Action]: Readonly<{
    action: Name;
    outcome: (typeof ADMIN_USER_ACTION_OUTCOMES)[Name][number];
  }>;
}[Action];

export type AdminUserActionAuditEntry = AdminUserActionResult &
  Readonly<{
    targetUserId: string;
    occurredAt: Date;
    adminSessionId: string;
    // Optional for pre-S3 callers; null is also a valid legacy snapshot.
    reasonSnapshot?: UserBanReason | null;
  }>;
