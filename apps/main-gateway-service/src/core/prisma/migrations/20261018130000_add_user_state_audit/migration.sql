ALTER TABLE "User" ADD COLUMN "isBanned" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "AdminUserAction" AS ENUM ('BLOCK', 'UNBLOCK', 'DELETE');
CREATE TYPE "AdminUserActionOutcome" AS ENUM (
    'BLOCKED', 'ALREADY_BLOCKED', 'USER_DELETED', 'NOT_FOUND',
    'UNBLOCKED', 'ALREADY_ACTIVE', 'DELETED', 'ALREADY_DELETED'
);

CREATE TABLE "AdminUserActionAudit" (
    "id" TEXT NOT NULL,
    "action" "AdminUserAction" NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "outcome" "AdminUserActionOutcome" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "adminSessionId" TEXT NOT NULL,
    CONSTRAINT "AdminUserActionAudit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminUserActionAudit_action_outcome_check" CHECK (
        ("action" = 'BLOCK' AND "outcome" IN ('BLOCKED', 'ALREADY_BLOCKED', 'USER_DELETED', 'NOT_FOUND')) OR
        ("action" = 'UNBLOCK' AND "outcome" IN ('UNBLOCKED', 'ALREADY_ACTIVE', 'USER_DELETED', 'NOT_FOUND')) OR
        ("action" = 'DELETE' AND "outcome" IN ('DELETED', 'ALREADY_DELETED', 'NOT_FOUND'))
    )
);
