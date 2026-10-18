import { Injectable } from '@nestjs/common';
import { AdminPrincipalVerifier, type AdminPrincipal } from '../domain/admin-principal';
import { AdminSessionRepository } from '../domain/admin-session.repository';
import { AdminClock } from '../domain/admin-clock';
import { hashAdminToken, readAdminToken } from '../application/admin-token';

@Injectable()
export class SessionAdminPrincipalVerifier extends AdminPrincipalVerifier {
  constructor(
    private readonly sessions: AdminSessionRepository,
    private readonly clock: AdminClock,
  ) {
    super();
  }

  async verify(input: { sessionToken: string | null }): Promise<AdminPrincipal | null> {
    const token = readAdminToken(input.sessionToken);
    if (!token) return null;
    const session = await this.sessions.findActiveAndTouch({
      tokenHash: hashAdminToken(token),
      now: this.clock.now(),
    });
    return session ? { role: 'SUPERADMIN', sessionId: session.id } : null;
  }
}
