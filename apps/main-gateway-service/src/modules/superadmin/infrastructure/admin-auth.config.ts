import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { normalizeAdminEmail } from '../application/admin-token';
import { resolveSuperadminSetting, SUPERADMIN_CONFIG_DEFAULTS } from './superadmin-config-defaults';

@Injectable()
export class AdminAuthConfig {
  readonly email: string;
  readonly passwordHash: string;
  readonly secure: boolean;
  readonly sameSite: 'lax' | 'none';
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.email = normalizeAdminEmail(
      resolveSuperadminSetting({
        value: config.get<string>('SUPERADMIN_EMAIL'),
        fallback: SUPERADMIN_CONFIG_DEFAULTS.email,
      }),
    );
    this.passwordHash = resolveSuperadminSetting({
      value: config.get<string>('SUPERADMIN_PASSWORD_HASH'),
      fallback: SUPERADMIN_CONFIG_DEFAULTS.passwordHash,
    });
    const sameSite = resolveSuperadminSetting({
      value: config.get<string>('SUPERADMIN_COOKIE_SAME_SITE'),
      fallback: SUPERADMIN_CONFIG_DEFAULTS.sameSite,
    });
    this.sameSite = sameSite === 'none' ? 'none' : 'lax';
    this.secure = config.get<string>('NODE_ENV') === 'production' || this.sameSite === 'none';
    // Nonempty invalid configuration still closes login, not existing REST startup.
    this.enabled =
      isEmail(this.email) &&
      /^\$2[ab]\$(?:10|11|12|13|14|15)\$[./A-Za-z0-9]{53}$/.test(this.passwordHash) &&
      ['lax', 'none'].includes(sameSite);
  }
}
