import type { AdminUserActionAuditEntry } from '../../../../../../../libs/common/types/admin-user-action-audit';

/**
 * Gateway persistent audit, owned by Users+Sessions/security. No secrets or human attribution.
 * Pass the SAME opaque tx from ITransactionManager.execute as User/Session writes (4B/05).
 * NOT_FOUND uses a separate short execute callback. No implicit standalone/autocommit fallback.
 * Each append creates a new record; one record per command is the future use case's responsibility.
 * Optional reasonSnapshot stores the resulting reason for BLOCK/ALREADY_BLOCKED, or the reason
 * before clearing for UNBLOCK. Legacy/no-user outcomes may omit it; S3 supplies these snapshots.
 */
export abstract class AdminUserActionAuditWriter {
  abstract append(input: {
    entry: AdminUserActionAuditEntry;
    transaction: unknown;
  }): Promise<{ auditId: string }>;
}
