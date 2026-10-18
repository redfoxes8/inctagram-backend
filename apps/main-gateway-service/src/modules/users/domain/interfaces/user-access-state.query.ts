import type { UserAccessState } from '../../../../../../../libs/common/types/user-access-state';

/**
 * Internal read, including soft-deleted rows. null = missing; DELETED takes priority over BLOCKED.
 * ACTIVE only excludes deletion/ban; it grants no authentication or email confirmation.
 * transaction is the opaque handle from ITransactionManager.execute (optional for standalone reads).
 */
export abstract class UserAccessStateQuery {
  // OAuth preflight must see deleted email owners instead of attempting duplicate registration.
  // Not an authorization grant: session issuance still locks/rechecks User atomically.
  abstract findByEmail(input: { email: string }): Promise<UserAccessState | null>;
  abstract findByUserId(input: {
    userId: string;
    transaction?: unknown;
  }): Promise<UserAccessState | null>;
}
