CREATE TYPE "PostAdminUserProjectionPhase" AS ENUM ('NOT_READY', 'LOADING', 'READY');
CREATE TYPE "PostAdminUserProjectionMode" AS ENUM ('IDLE', 'BOOTSTRAP', 'RECONCILE');

CREATE TABLE "post_admin_user_profile" (
  "user_id" TEXT NOT NULL PRIMARY KEY,
  "source_version" BIGINT NOT NULL,
  "username" TEXT,
  "profile_exists" BOOLEAN NOT NULL,
  "is_deleted" BOOLEAN NOT NULL,
  CONSTRAINT "post_admin_user_profile_id_check" CHECK (length(btrim("user_id")) > 0),
  CONSTRAINT "post_admin_user_profile_version_check" CHECK ("source_version" >= 0),
  CONSTRAINT "post_admin_user_profile_snapshot_check" CHECK (
    CASE WHEN "is_deleted" OR NOT "profile_exists" THEN "username" IS NULL
    ELSE "username" IS NOT NULL AND length("username") > 0 END
  )
);

CREATE TABLE "post_admin_user_projection_sync" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'post-user-profile-v1',
  "phase" "PostAdminUserProjectionPhase" NOT NULL DEFAULT 'NOT_READY',
  "mode" "PostAdminUserProjectionMode" NOT NULL DEFAULT 'IDLE',
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
  CONSTRAINT "post_admin_user_projection_sync_singleton_check" CHECK ("id" = 'post-user-profile-v1'),
  CONSTRAINT "post_admin_user_projection_sync_generation_check" CHECK ("lease_generation" >= 0),
  CONSTRAINT "post_admin_user_projection_sync_lease_check"
    CHECK (("lease_owner" IS NULL) = ("lease_until" IS NULL)),
  CONSTRAINT "post_admin_user_projection_sync_confirmation_check"
    CHECK (("source_writers_confirmed_at" IS NULL) = ("source_deployment_revision" IS NULL)),
  CONSTRAINT "post_admin_user_projection_sync_revision_check"
    CHECK ("source_deployment_revision" IS NULL OR length(btrim("source_deployment_revision")) > 0)
);

-- Storage is not rollout confirmation: no source fixtures or READY state are synthesized.
INSERT INTO "post_admin_user_projection_sync" ("id") VALUES ('post-user-profile-v1');
