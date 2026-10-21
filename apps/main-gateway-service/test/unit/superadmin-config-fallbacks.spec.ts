import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { AdminAuthConfig } from '../../src/modules/superadmin/infrastructure/admin-auth.config';
import { ConfiguredAdminCredentials } from '../../src/modules/superadmin/infrastructure/configured-admin-credentials';
import { SuperadminPaymentsConfig } from '../../src/modules/superadmin/infrastructure/superadmin-payments.config';
import { parseSuperadminOrigins } from '../../src/modules/superadmin/api/superadmin-http-security';
import { SUPERADMIN_CONFIG_DEFAULTS } from '../../src/modules/superadmin/infrastructure/superadmin-config-defaults';

const SETTING_NAMES = [
  'SUPERADMIN_EMAIL',
  'SUPERADMIN_PASSWORD_HASH',
  'SUPERADMIN_ALLOWED_ORIGINS',
  'SUPERADMIN_COOKIE_SAME_SITE',
  'SUPERADMIN_PAYMENTS_TIMEOUT_MS',
] as const;

describe('explicitly approved superadmin configuration fallbacks', () => {
  let inherited: Record<string, string | undefined>;
  beforeEach(() => {
    inherited = Object.fromEntries(SETTING_NAMES.map((name) => [name, process.env[name]]));
    for (const name of SETTING_NAMES) delete process.env[name];
  });
  afterEach(() => {
    for (const name of SETTING_NAMES) {
      if (inherited[name] === undefined) delete process.env[name];
      else process.env[name] = inherited[name];
    }
  });

  it.each([undefined, '', ' \t\n '])(
    'resolves all five absent/blank settings in production (%p), without writing process.env',
    async (value) => {
      const settings = Object.fromEntries(SETTING_NAMES.map((name) => [name, value]));
      const config = new ConfigService({ NODE_ENV: 'production', ...settings });
      const auth = new AdminAuthConfig(config);
      expect(auth.enabled).toBe(true);
      expect(auth.email).toBe('admin@gmail.com');
      expect(auth.sameSite).toBe('lax');
      expect(auth.secure).toBe(true);
      expect(bcrypt.getRounds(auth.passwordHash)).toBe(12);
      expect(await bcrypt.compare('admin', auth.passwordHash)).toBe(true);
      expect(
        await new ConfiguredAdminCredentials(auth).matches({
          email: auth.email,
          password: 'admin',
        }),
      ).toBe(true);
      expect(
        await new ConfiguredAdminCredentials(auth).matches({
          email: auth.email,
          password: 'incorrect-fixture',
        }),
      ).toBe(false);
      expect(parseSuperadminOrigins(value)).toEqual([
        'https://nymbi.org',
        'https://dev.nymbi.org:3000',
      ]);
      expect(new SuperadminPaymentsConfig(config).timeoutMs).toBe(3000);
      for (const name of SETTING_NAMES) expect(process.env[name]).toBeUndefined();
    },
  );

  it('preserves nonempty overrides for all five values, including real bcrypt matching', async () => {
    const passwordHash = await bcrypt.hash('override-fixture-only', 10);
    const config = new ConfigService({
      NODE_ENV: 'test',
      SUPERADMIN_EMAIL: ' OVERRIDE@example.test ',
      SUPERADMIN_PASSWORD_HASH: passwordHash,
      SUPERADMIN_COOKIE_SAME_SITE: 'none',
      SUPERADMIN_PAYMENTS_TIMEOUT_MS: '1500',
    });
    const auth = new AdminAuthConfig(config);
    expect(auth.enabled).toBe(true);
    expect(auth.email).toBe('override@example.test');
    expect(auth.passwordHash).toBe(passwordHash);
    expect(auth.sameSite).toBe('none');
    expect(auth.secure).toBe(true);
    const credentials = new ConfiguredAdminCredentials(auth);
    expect(
      await credentials.matches({ email: auth.email, password: 'override-fixture-only' }),
    ).toBe(true);
    expect(await credentials.matches({ email: auth.email, password: 'admin' })).toBe(false);
    expect(parseSuperadminOrigins('https://override.example.test')).toEqual([
      'https://override.example.test',
    ]);
    expect(new SuperadminPaymentsConfig(config).timeoutMs).toBe(1500);
  });

  it('resolves email and hash independently, without discarding a valid override', async () => {
    const emailOnly = new AdminAuthConfig(
      new ConfigService({ SUPERADMIN_EMAIL: 'other@example.test' }),
    );
    expect(emailOnly.enabled).toBe(true);
    expect(emailOnly.email).toBe('other@example.test');
    expect(emailOnly.passwordHash).toBe(SUPERADMIN_CONFIG_DEFAULTS.passwordHash);
    const overrideHash = await bcrypt.hash('hash-only-fixture', 10);
    const hashOnly = new AdminAuthConfig(
      new ConfigService({ SUPERADMIN_PASSWORD_HASH: overrideHash }),
    );
    expect(hashOnly.email).toBe(SUPERADMIN_CONFIG_DEFAULTS.email);
    expect(hashOnly.passwordHash).toBe(overrideHash);
    expect(hashOnly.enabled).toBe(true);
  });

  it.each([
    { SUPERADMIN_EMAIL: 'not-an-email' },
    { SUPERADMIN_PASSWORD_HASH: 'malformed' },
    { SUPERADMIN_PASSWORD_HASH: SUPERADMIN_CONFIG_DEFAULTS.passwordHash.replace('$12$', '$04$') },
    { SUPERADMIN_COOKIE_SAME_SITE: 'invalid' },
    { SUPERADMIN_COOKIE_SAME_SITE: ' lax ' },
  ])('keeps invalid nonempty auth config closed (case %#)', async (settings) => {
    const config = new AdminAuthConfig(new ConfigService(settings));
    expect(config.enabled).toBe(false);
    await expect(
      new ConfiguredAdminCredentials(config).matches({
        email: 'admin@gmail.com',
        password: 'admin',
      }),
    ).rejects.toMatchObject({ code: 503 });
  });

  it.each([
    '*',
    'https://nymbi.org/superadmin',
    'https://nymbi.org,',
    'invalid',
    'ftp://example.test',
  ])('rejects invalid nonempty origins rather than falling back (%s)', (value) => {
    expect(() => parseSuperadminOrigins(value)).toThrow();
  });

  it.each([1, 30000, '1', '30000'])('preserves valid timeout boundary %p', (value) => {
    expect(
      new SuperadminPaymentsConfig(new ConfigService({ SUPERADMIN_PAYMENTS_TIMEOUT_MS: value }))
        .timeoutMs,
    ).toBe(Number(value));
  });
  it.each(['0', '-1', '30001', 'bad', ' 3000 ', true, {}, 1.5])(
    'does not replace invalid nonempty timeout %p',
    (value) => {
      expect(
        () =>
          new SuperadminPaymentsConfig(new ConfigService({ SUPERADMIN_PAYMENTS_TIMEOUT_MS: value }))
            .timeoutMs,
      ).toThrow();
    },
  );
});
