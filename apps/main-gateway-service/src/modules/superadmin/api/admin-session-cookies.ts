import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AdminAuthConfig } from '../infrastructure/admin-auth.config';
import { AdminClock } from '../domain/admin-clock';
import { createAdminToken } from '../application/admin-token';
import { SUPERADMIN_GRAPHQL_PATH } from './superadmin-http-security';

@Injectable()
export class AdminSessionCookies {
  constructor(
    private readonly config: AdminAuthConfig,
    private readonly clock: AdminClock,
  ) {}

  setSession(input: { response: Response; token: string; absoluteExpiresAt: Date }): void {
    input.response.cookie('superadminSession', input.token, {
      ...this.options(),
      maxAge: Math.max(0, input.absoluteExpiresAt.getTime() - this.clock.now().getTime()),
    });
  }

  bootstrapCsrf(response: Response): void {
    // Aliased root fields share one HTTP response and one bootstrap cookie/header pair.
    if (response.hasHeader('X-Superadmin-CSRF')) return;
    const nonce = createAdminToken();
    response.cookie('superadminCsrf', nonce, this.options());
    response.setHeader('X-Superadmin-CSRF', nonce);
    response.setHeader('Cache-Control', 'no-store');
  }

  clear(response: Response): void {
    response.clearCookie('superadminSession', this.options());
    response.clearCookie('superadminCsrf', this.options());
    response.setHeader('Cache-Control', 'no-store');
  }

  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: this.config.sameSite,
      path: SUPERADMIN_GRAPHQL_PATH,
    };
  }
}
