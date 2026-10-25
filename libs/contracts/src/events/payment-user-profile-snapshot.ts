export const MAX_PAYMENT_PROFILE_VERSION = 9223372036854775807n;

export type PaymentUserProfileSnapshot = Readonly<{
  userId: string;
  // Canonical decimal string on the wire; never convert a source revision to Number.
  sourceVersion: string;
}> &
  Readonly<
    | { isDeleted: true; profileExists: boolean; username: null }
    | { isDeleted: false; profileExists: false; username: null }
    | { isDeleted: false; profileExists: true; username: string }
  >;

/** Fixed message: do not echo the untrusted payload into logs or transport errors. */
export class PaymentUserProfileContractError extends Error {
  constructor() {
    super('Invalid payment user profile contract');
    this.name = 'PaymentUserProfileContractError';
  }
}

export function parsePaymentProfileVersion(value: unknown): bigint {
  if (typeof value === 'string' && value.length <= 19 && /^(0|[1-9][0-9]*)$/.test(value)) {
    const version = BigInt(value);
    if (version <= MAX_PAYMENT_PROFILE_VERSION) return version;
  }
  throw new PaymentUserProfileContractError();
}

export function normalizePaymentUserProfileSnapshot(value: unknown): PaymentUserProfileSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PaymentUserProfileContractError();
  }
  const fields = value as Record<string, unknown>;
  const keys = ['userId', 'sourceVersion', 'username', 'profileExists', 'isDeleted'];
  if (
    Object.keys(fields).length !== keys.length ||
    !Object.keys(fields).every((key) => keys.includes(key)) ||
    typeof fields.userId !== 'string' ||
    fields.userId.trim().length === 0 ||
    typeof fields.sourceVersion !== 'string' ||
    typeof fields.profileExists !== 'boolean' ||
    typeof fields.isDeleted !== 'boolean'
  ) {
    throw new PaymentUserProfileContractError();
  }
  parsePaymentProfileVersion(fields.sourceVersion);
  const identity = { userId: fields.userId, sourceVersion: fields.sourceVersion };
  if (fields.isDeleted) {
    if (fields.username === null) {
      return { ...identity, isDeleted: true, profileExists: fields.profileExists, username: null };
    }
  } else if (!fields.profileExists) {
    if (fields.username === null) {
      return { ...identity, isDeleted: false, profileExists: false, username: null };
    }
  } else if (typeof fields.username === 'string' && fields.username.length > 0) {
    // Preserve source TEXT IDs/usernames verbatim. No trim, HTML conversion or alphabet folding.
    return { ...identity, isDeleted: false, profileExists: true, username: fields.username };
  }
  throw new PaymentUserProfileContractError();
}
