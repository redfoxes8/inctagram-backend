import { isUUID, maxLength } from 'class-validator';
import {
  SUPERADMIN_POSTS_DEFAULT_FIRST,
  SUPERADMIN_POSTS_MAX_FIRST,
  type SuperadminPostsInput,
  type SuperadminPostsFilter,
  type SuperadminPostPublishedInput,
  type SuperadminPostPublishedFilter,
} from '../../types/superadmin-posts';
import { decodeSuperadminPostsCursor } from '../pagination/superadmin-posts-cursor';
import { DomainException } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';

function normalizeSearch(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalidInput();
  const search = value.trim();
  if (!maxLength(search, 100)) throw invalidInput();
  return search || null;
}

export function normalizeSuperadminPostsInput(input: SuperadminPostsInput): SuperadminPostsFilter {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidInput();
  const first = input.first === undefined ? SUPERADMIN_POSTS_DEFAULT_FIRST : input.first;
  if (!Number.isInteger(first) || first < 1 || first > SUPERADMIN_POSTS_MAX_FIRST)
    throw invalidInput();
  const searchUsername = normalizeSearch(input.searchUsername);
  if (input.after !== undefined && input.after !== null && typeof input.after !== 'string')
    throw invalidInput();
  const after =
    input.after == null
      ? null
      : decodeSuperadminPostsCursor({ value: input.after, searchUsername });
  return { first, searchUsername, after };
}

export function normalizeSuperadminPostPublishedInput(
  input: SuperadminPostPublishedInput,
): SuperadminPostPublishedFilter {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.postId !== 'string' ||
    !isUUID(input.postId)
  )
    throw invalidInput();
  const confirmed =
    input.authorMissingConfirmed === undefined ? false : input.authorMissingConfirmed;
  if (
    typeof confirmed !== 'boolean' ||
    (input.authorUserId !== undefined &&
      (typeof input.authorUserId !== 'string' || !input.authorUserId.trim())) ||
    (confirmed && !input.authorUserId)
  )
    throw invalidInput();
  return {
    postId: input.postId,
    searchUsername: normalizeSearch(input.searchUsername),
    authorMissingConfirmed: confirmed,
    authorUserId: input.authorUserId ?? null,
  };
}

function invalidInput(): DomainException {
  return new DomainException({
    code: DomainExceptionCode.BadRequest,
    message: 'Invalid superadmin posts input',
  });
}
