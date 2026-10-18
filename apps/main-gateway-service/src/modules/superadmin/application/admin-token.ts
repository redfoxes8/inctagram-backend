import { createHash, randomBytes } from 'node:crypto';

export function createAdminToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAdminToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function readAdminToken(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
