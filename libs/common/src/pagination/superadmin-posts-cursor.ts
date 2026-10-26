import { isUUID } from 'class-validator';
import type { SuperadminPostsCursor } from '../../types/superadmin-posts';
import { DomainException } from '../exceptions/domain-exception';
import { DomainExceptionCode } from '../exceptions/domain-exception-codes';

export function isSuperadminPostTimestamp(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    value.startsWith('0000')
  )
    return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function encodeSuperadminPostsCursor(input: SuperadminPostsCursor): string {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

export function decodeSuperadminPostsCursor(input: {
  value: string;
  searchUsername: string | null;
}): SuperadminPostsCursor {
  try {
    if (
      !input.value ||
      Buffer.byteLength(input.value, 'utf8') > 1024 ||
      !/^[A-Za-z0-9_-]+$/.test(input.value)
    )
      throw new Error();
    const bytes = Buffer.from(input.value, 'base64url');
    const json = bytes.toString('utf8');
    if (bytes.toString('base64url') !== input.value || !Buffer.from(json, 'utf8').equals(bytes))
      throw new Error();
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const cursor = value as Record<string, unknown>;
    const keys = ['v', 'createdAt', 'postId', 'searchUsername'];
    if (
      Object.keys(cursor).length !== keys.length ||
      !Object.keys(cursor).every((key) => keys.includes(key)) ||
      cursor.v !== 1 ||
      !isSuperadminPostTimestamp(cursor.createdAt) ||
      typeof cursor.postId !== 'string' ||
      !isUUID(cursor.postId) ||
      cursor.searchUsername !== input.searchUsername
    )
      throw new Error();
    return {
      v: 1,
      createdAt: cursor.createdAt,
      postId: cursor.postId,
      searchUsername: input.searchUsername,
    };
  } catch {
    throw new DomainException({
      code: DomainExceptionCode.BadRequest,
      message: 'Invalid superadmin posts cursor',
    });
  }
}
