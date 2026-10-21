// Explicitly approved educational fallbacks, including in production (2026-10-21).
// Keep values here; never write resolved values to process.env or runtime logs.
export const SUPERADMIN_CONFIG_DEFAULTS = {
  email: 'admin@gmail.com',
  passwordHash: '$2b$12$xb3LVf8JQXb3dvD.U0/iY.o70yIHYz0aoQ7C2d57ZPf0g7AefwDWi',
  allowedOrigins: 'https://nymbi.org,https://dev.nymbi.org:3000',
  sameSite: 'lax',
  paymentsTimeoutMs: 3000,
} as const;

export function resolveSuperadminSetting<Value>(input: {
  value: Value | undefined;
  fallback: Value;
}): Value {
  if (input.value === undefined || (typeof input.value === 'string' && !input.value.trim())) {
    return input.fallback;
  }
  // Preserve nonempty values for the existing validator, including invalid ones.
  return input.value;
}
