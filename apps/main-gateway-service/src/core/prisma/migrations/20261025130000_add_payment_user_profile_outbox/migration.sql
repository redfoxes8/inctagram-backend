ALTER TABLE "User" ADD COLUMN "paymentProfileVersion" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_payment_profile_version_check"
  CHECK ("paymentProfileVersion" >= 0);

CREATE TABLE "PaymentUserProfileOutbox" (
  "id" UUID NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceVersion" BIGINT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" UUID,
  "leaseUntil" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  CONSTRAINT "PaymentUserProfileOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentUserProfileOutbox_version_check" CHECK ("sourceVersion" >= 0),
  CONSTRAINT "PaymentUserProfileOutbox_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "PaymentUserProfileOutbox_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "PaymentUserProfileOutbox_lease_check"
    CHECK (("leaseId" IS NULL) = ("leaseUntil" IS NULL))
);
CREATE UNIQUE INDEX "PaymentUserProfileOutbox_userId_sourceVersion_key"
  ON "PaymentUserProfileOutbox" ("userId", "sourceVersion");
CREATE INDEX "PaymentUserProfileOutbox_publishedAt_availableAt_idx"
  ON "PaymentUserProfileOutbox" ("publishedAt", "availableAt");
-- No backfill events: source writers begin in P1b.
