CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminSession_expiry_check" CHECK (
        "lastSeenAt" >= "createdAt" AND "idleExpiresAt" <= "absoluteExpiresAt"
        AND "idleExpiresAt" > "lastSeenAt" AND "absoluteExpiresAt" > "createdAt"
    )
);
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

CREATE TABLE "AdminLoginRateLimit" (
    "keyHash" CHAR(64) NOT NULL,
    "attempts" TIMESTAMP(3)[] NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminLoginRateLimit_pkey" PRIMARY KEY ("keyHash"),
    CONSTRAINT "AdminLoginRateLimit_attempts_check" CHECK (cardinality("attempts") <= 5)
);
CREATE INDEX "AdminLoginRateLimit_updatedAt_idx" ON "AdminLoginRateLimit"("updatedAt");
