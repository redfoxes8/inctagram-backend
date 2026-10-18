import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { normalizeAdminEmail } from '../application/admin-token';

@Injectable()
export class AdminAuthConfig {
  readonly email: string;
  readonly passwordHash: string;
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'none';
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.email = normalizeAdminEmail(config.get<string>('SUPERADMIN_EMAIL') ?? '');
    this.passwordHash = config.get<string>('SUPERADMIN_PASSWORD_HASH') ?? '';
    const sameSite = config.get<string>('SUPERADMIN_COOKIE_SAME_SITE') ?? 'lax';
    this.sameSite = sameSite === 'none' ? 'none' : 'lax';
    this.secure = config.get<string>('NODE_ENV') === 'production' || this.sameSite === 'none';
    // Invalid/missing admin secrets close only admin login, not existing REST startup.
    this.enabled =
      isEmail(this.email) &&
      /^\$2[ab]\$(?:10|11|12|13|14|15)\$[./A-Za-z0-9]{53}$/.test(this.passwordHash) &&
      ['lax', 'none'].includes(sameSite);
  }
}
