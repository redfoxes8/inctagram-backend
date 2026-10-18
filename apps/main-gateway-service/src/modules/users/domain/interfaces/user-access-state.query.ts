import type { UserAccessState } from '../../../../../../../libs/common/types/user-access-state';

/**
 * Internal read, including soft-deleted rows. null = missing; DELETED takes priority over BLOCKED.
 * ACTIVE only excludes deletion/ban; it grants no authentication or email confirmation.
 * transaction is the opaque handle from ITransactionManager.execute (optional for standalone reads).
 */
export abstract class UserAccessStateQuery {
  abstract findByUserId(input: {
    userId: string;
    transaction?: unknown;
  }): Promise<UserAccessState | null>;
}
