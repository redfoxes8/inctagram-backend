CREATE TYPE "AdminUserProjectionPhase" AS ENUM ('NOT_READY', 'LOADING', 'READY');
CREATE TYPE "AdminUserProjectionMode" AS ENUM ('IDLE', 'BOOTSTRAP', 'RECONCILE');

CREATE TABLE "admin_user_profile_read_model" (
  "user_id" TEXT NOT NULL,
  "source_version" BIGINT NOT NULL,
  "username" TEXT,
  "profile_exists" BOOLEAN NOT NULL,
  "is_deleted" BOOLEAN NOT NULL,
  CONSTRAINT "admin_user_profile_read_model_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "admin_user_profile_read_model_id_check" CHECK (char_length("user_id") > 0),
  CONSTRAINT "admin_user_profile_read_model_version_check" CHECK ("source_version" >= 0),
  CONSTRAINT "admin_user_profile_read_model_snapshot_check" CHECK (
    CASE WHEN "is_deleted" OR NOT "profile_exists" THEN "username" IS NULL
    ELSE "username" IS NOT NULL AND char_length("username") > 0 END
  )
);

CREATE TABLE "admin_user_projection_sync" (
  "id" TEXT NOT NULL DEFAULT 'payment-user-profile-v1',
  "phase" "AdminUserProjectionPhase" NOT NULL DEFAULT 'NOT_READY',
  "mode" "AdminUserProjectionMode" NOT NULL DEFAULT 'IDLE',
  "pass_id" UUID,
  "upper_user_id" TEXT,
  "cursor" TEXT,
  "source_empty" BOOLEAN NOT NULL DEFAULT false,
  "last_batch_at" TIMESTAMPTZ(3),
  "last_completed_at" TIMESTAMPTZ(3),
  "next_run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_writers_confirmed_at" TIMESTAMPTZ(3),
  "source_deployment_revision" TEXT,
  "lease_owner" UUID,
  "lease_until" TIMESTAMPTZ(3),
  "lease_generation" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "admin_user_projection_sync_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "admin_user_projection_sync_singleton_check" CHECK ("id" = 'payment-user-profile-v1'),
  CONSTRAINT "admin_user_projection_sync_generation_check" CHECK ("lease_generation" >= 0),
  CONSTRAINT "admin_user_projection_sync_lease_check"
    CHECK (("lease_owner" IS NULL) = ("lease_until" IS NULL)),
  CONSTRAINT "admin_user_projection_sync_source_confirmation_check"
    CHECK (("source_writers_confirmed_at" IS NULL) = ("source_deployment_revision" IS NULL))
);
-- Storage readiness is not bootstrap readiness. No rollout confirmation or background activation.
INSERT INTO "admin_user_projection_sync" ("id") VALUES ('payment-user-profile-v1');
