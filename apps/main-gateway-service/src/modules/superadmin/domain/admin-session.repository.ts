export type AdminSessionRecord = {
  id: string;
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
};

export abstract class AdminSessionRepository {
  abstract replace(input: {
    session: AdminSessionRecord;
    previousTokenHash: string | null;
  }): Promise<void>;
  abstract findActiveAndTouch(input: {
    tokenHash: string;
    now: Date;
  }): Promise<AdminSessionRecord | null>;
  abstract revoke(input: { tokenHash: string; now: Date }): Promise<void>;
}

export abstract class AdminLoginRateLimiter {
  abstract consume(input: { keyHash: string; now: Date }): Promise<boolean>;
}

export abstract class AdminCredentials {
  abstract matches(input: { email: string; password: string }): Promise<boolean>;
}
