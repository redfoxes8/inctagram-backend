CREATE TABLE "PostPublishedOutbox" (
  "id" UUID NOT NULL PRIMARY KEY,
  "postId" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseId" UUID,
  "leaseUntil" TIMESTAMPTZ(3),
  "publishedAt" TIMESTAMPTZ(3),
  "lastErrorCode" VARCHAR(64),
  CONSTRAINT "PostPublishedOutbox_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "PostPublishedOutbox_lease_check" CHECK (("leaseId" IS NULL) = ("leaseUntil" IS NULL)),
  CONSTRAINT "PostPublishedOutbox_payload_check" CHECK (
    (jsonb_typeof("payload") = 'object'
      AND lower("payload"->>'eventId') = "id"::text
      AND lower("payload"->>'postId') = "postId"::text) IS TRUE
  )
);

CREATE INDEX "PostPublishedOutbox_pending_due_idx"
  ON "PostPublishedOutbox" ("availableAt", "createdAt", "id") WHERE "publishedAt" IS NULL;

-- No FK or backfill: delivery survives deletion and old posts do not invent publication events.
