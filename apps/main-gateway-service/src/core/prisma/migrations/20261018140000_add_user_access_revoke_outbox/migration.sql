CREATE TABLE "UserAccessRevokeOutbox" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionIds" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseId" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  CONSTRAINT "UserAccessRevokeOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserAccessRevokeOutbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX "UserAccessRevokeOutbox_publishedAt_availableAt_idx" ON "UserAccessRevokeOutbox"("publishedAt", "availableAt");
