import { UserBanReasonCode, type UserBanReason } from '../../types/user-ban-reason';
import { DomainException } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';

// Internal boundary shared by moderation storage and audit; no Prisma or GraphQL dependency.
export function normalizeUserBanReason(value: unknown): UserBanReason | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw invalidReason();
  const fields = value as Record<string, unknown>;
  if (!Object.keys(fields).every((name) => name === 'code' || name === 'text')) {
    throw invalidReason();
  }
  if (fields.text !== undefined && fields.text !== null && typeof fields.text !== 'string') {
    throw invalidReason();
  }
  const text = typeof fields.text === 'string' ? fields.text.trim() : '';
  if (fields.code === undefined || fields.code === null) {
    if (text.length === 0) return null;
    throw invalidReason();
  }
  if (fields.code === UserBanReasonCode.AnotherReason) {
    // Unicode code points, matching PostgreSQL char_length (not UTF-16 code units).
    const length = [...text].length;
    if (length >= 1 && length <= 500) return { code: fields.code, text };
    throw invalidReason();
  }
  if (
    fields.code === UserBanReasonCode.BadBehavior ||
    fields.code === UserBanReasonCode.AdvertisingPlacement
  ) {
    if (text.length === 0) return { code: fields.code, text: null };
  }
  throw invalidReason();
}

function invalidReason(): DomainException {
  return new DomainException({
    code: DomainExceptionCode.BadRequest,
    message: 'Invalid ban reason',
  });
}
