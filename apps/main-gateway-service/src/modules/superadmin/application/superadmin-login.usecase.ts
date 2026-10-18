import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainException } from '../../../../../../libs/common/src/exceptions/domain-exception';
import { DomainExceptionCode } from '../../../../../../libs/common/src/exceptions/domain-exception-codes';
import {
  AdminCredentials,
  AdminLoginRateLimiter,
  AdminSessionRepository,
} from '../domain/admin-session.repository';
import { ADMIN_ABSOLUTE_MS, ADMIN_IDLE_MS, AdminClock } from '../domain/admin-clock';
import { createAdminToken, hashAdminToken, normalizeAdminEmail } from './admin-token';

@Injectable()
export class SuperadminLoginUseCase {
  constructor(
    private readonly credentials: AdminCredentials,
    private readonly rateLimiter: AdminLoginRateLimiter,
    private readonly sessions: AdminSessionRepository,
    private readonly clock: AdminClock,
  ) {}

  async execute(input: {
    email: string;
    password: string;
    ip: string;
    previousToken: string | null;
  }): Promise<{ token: string; absoluteExpiresAt: Date }> {
    const email = normalizeAdminEmail(input.email);
    const allowed = await this.rateLimiter.consume({
      keyHash: hashAdminToken(JSON.stringify([input.ip, email])),
      now: this.clock.now(),
    });
    if (!allowed) {
      throw new DomainException({
        code: DomainExceptionCode.TooManyRequests,
        message: 'Too many requests',
      });
    }
    if (!(await this.credentials.matches({ email, password: input.password }))) {
      throw new DomainException({
        code: DomainExceptionCode.Unauthorized,
        message: 'Authentication required',
      });
    }
    const now = this.clock.now();
    const token = createAdminToken();
    const absoluteExpiresAt = new Date(now.getTime() + ADMIN_ABSOLUTE_MS);
    await this.sessions.replace({
      session: {
        id: randomUUID(),
        tokenHash: hashAdminToken(token),
        createdAt: now,
        lastSeenAt: now,
        idleExpiresAt: new Date(now.getTime() + ADMIN_IDLE_MS),
        absoluteExpiresAt,
        revokedAt: null,
      },
      previousTokenHash: input.previousToken ? hashAdminToken(input.previousToken) : null,
    });
    return { token, absoluteExpiresAt };
  }
}
