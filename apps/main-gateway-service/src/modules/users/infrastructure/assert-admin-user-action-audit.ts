import { isUUID } from 'class-validator';
import {
  ADMIN_USER_ACTION_OUTCOMES,
  type AdminUserActionAuditEntry,
} from '../../../../../../libs/common/types/admin-user-action-audit';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';

export function assertAdminUserActionAudit(
  value: unknown,
): asserts value is AdminUserActionAuditEntry {
  if (typeof value === 'object' && value !== null) {
    const { action, outcome, targetUserId, occurredAt, adminSessionId } = value as Record<
      string,
      unknown
    >;
    // The writer separately normalizes/validates the optional reasonSnapshot before INSERT.
    const fields = [
      'action',
      'outcome',
      'targetUserId',
      'occurredAt',
      'adminSessionId',
      'reasonSnapshot',
    ];
    if (
      typeof action === 'string' &&
      Object.hasOwn(ADMIN_USER_ACTION_OUTCOMES, action) &&
      typeof outcome === 'string' &&
      typeof targetUserId === 'string' &&
      targetUserId.trim().length > 0 &&
      occurredAt instanceof Date &&
      Number.isFinite(occurredAt.getTime()) &&
      typeof adminSessionId === 'string' &&
      isUUID(adminSessionId) &&
      Object.keys(value).every((field) => fields.includes(field))
    ) {
      const outcomes: readonly string[] =
        ADMIN_USER_ACTION_OUTCOMES[action as keyof typeof ADMIN_USER_ACTION_OUTCOMES];
      if (outcomes.includes(outcome)) return;
    }
  }
  // Caller errors are rejected before issuing any INSERT, without echoing sensitive input.
  throw new DomainException({
    code: DomainExceptionCode.BadRequest,
    message: 'Invalid admin audit entry',
  });
}
