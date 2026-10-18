import { Injectable } from '@nestjs/common';
import { AdminSessionRepository } from '../domain/admin-session.repository';
import { AdminClock } from '../domain/admin-clock';
import { hashAdminToken } from './admin-token';

@Injectable()
export class SuperadminLogoutUseCase {
  constructor(
    private readonly sessions: AdminSessionRepository,
    private readonly clock: AdminClock,
  ) {}

  async execute(input: { token: string | null }): Promise<void> {
    if (input.token)
      await this.sessions.revoke({ tokenHash: hashAdminToken(input.token), now: this.clock.now() });
  }
}
