import { timingSafeEqual } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { json, type NextFunction, type Request, type Response } from 'express';

export const SUPERADMIN_GRAPHQL_PATH = '/api/v1/graphql';
export type SuperadminHttpPolicy = Readonly<{ allowedOrigins: string[] }>;

export function parseSuperadminOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return [
    ...new Set(
      value.split(',').map((entry) => {
        const origin = entry.trim();
        const url = new URL(origin);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
          throw new Error('SUPERADMIN_ALLOWED_ORIGINS must contain exact HTTP origins');
        }
        return origin;
      }),
    ),
  ];
}

export function assertSuperadminCsrf(request: Request): void {
  const header = request.get('x-superadmin-csrf');
  const cookie: unknown = request.cookies?.superadminCsrf;
  if (
    typeof header === 'string' &&
    typeof cookie === 'string' &&
    header.length > 0 &&
    header.length <= 512 &&
    Buffer.byteLength(header) === Buffer.byteLength(cookie) &&
    timingSafeEqual(Buffer.from(header), Buffer.from(cookie))
  )
    return;
  throw new Error('Invalid CSRF nonce');
}

// Call before Nest installs its default 100 KiB parser/global REST CORS middleware.
export function setupSuperadminHttp(input: {
  app: INestApplication;
  policy: SuperadminHttpPolicy;
}): void {
  const parser = json({ limit: 256 * 1024, strict: true });
  input.app.use((request: Request, response: Response, next: NextFunction): void => {
    if (request.path.toLowerCase().replace(/\/+$/, '') !== SUPERADMIN_GRAPHQL_PATH) return next();
    const reject = (status: number, code: string): void => {
      response
        .status(status)
        .json({ errors: [{ message: 'Request rejected', extensions: { code } }] });
    };
    const origin = request.get('origin');
    if (!origin || !input.policy.allowedOrigins.includes(origin)) return reject(403, 'FORBIDDEN');
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Expose-Headers', 'X-Superadmin-CSRF');
    response.setHeader('Cache-Control', 'no-store');
    response.vary('Origin');
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'POST');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Superadmin-CSRF');
      response.status(204).end();
      return;
    }
    if (request.method !== 'POST') return reject(405, 'BAD_USER_INPUT');
    if (!request.is('application/json')) return reject(415, 'BAD_USER_INPUT');
    parser(request, response, (error: unknown): void => {
      if (error) {
        const tooLarge =
          typeof error === 'object' &&
          error !== null &&
          'type' in error &&
          error.type === 'entity.too.large';
        return reject(tooLarge ? 413 : 400, 'BAD_USER_INPUT');
      }
      if (Array.isArray(request.body)) return reject(400, 'BAD_USER_INPUT');
      next();
    });
  });
}
