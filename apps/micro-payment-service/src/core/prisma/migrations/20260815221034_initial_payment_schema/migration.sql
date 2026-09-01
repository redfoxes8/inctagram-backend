-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "CheckoutPurpose" AS ENUM ('INITIAL_SUBSCRIPTION', 'ADDITIONAL_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('CREATED', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'QUEUED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PURCHASE', 'RENEWAL');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "ProviderWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL,
    "billing_interval_count" INTEGER NOT NULL,
    "price_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_providers" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_product_id" VARCHAR(255),
    "provider_billing_id" VARCHAR(255) NOT NULL,
    "environment" VARCHAR(32) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_customers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_customer_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "purpose" "CheckoutPurpose" NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'CREATED',
    "provider_checkout_id" VARCHAR(255),
    "idempotency_key" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_subscription_id" VARCHAR(255),
    "provider_schedule_id" VARCHAR(255),
    "provider_status" VARCHAR(255),
    "sequence" INTEGER NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "auto_renew" BOOLEAN NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "next_billing_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "subscription_id" UUID,
    "checkout_session_id" UUID,
    "provider" VARCHAR(32) NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "provider_transaction_id" VARCHAR(255),
    "provider_invoice_id" VARCHAR(255),
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "paid_at" TIMESTAMPTZ(3),
    "refunded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(255) NOT NULL,
    "status" "ProviderWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processing_error" VARCHAR(500),
    "ignored_reason" VARCHAR(500),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "routing_key" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "last_error" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE INDEX "products_active_billing_interval_idx" ON "products"("is_active", "billing_interval");

-- CreateIndex
CREATE INDEX "product_providers_product_id_idx" ON "product_providers"("product_id");

-- CreateIndex
CREATE INDEX "product_providers_active_environment_idx" ON "product_providers"("provider", "environment", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "product_providers_billing_environment_key" ON "product_providers"("provider", "provider_billing_id", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "product_providers_product_environment_key" ON "product_providers"("product_id", "provider", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "provider_customers_user_provider_key" ON "provider_customers"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "provider_customers_provider_customer_key" ON "provider_customers"("provider", "provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_idempotency_key_key" ON "checkout_sessions"("idempotency_key");

-- CreateIndex
CREATE INDEX "checkout_sessions_user_created_idx" ON "checkout_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "checkout_sessions_status_expires_idx" ON "checkout_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_sessions_provider_checkout_key" ON "checkout_sessions"("provider", "provider_checkout_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_status_sequence_idx" ON "subscriptions"("user_id", "status", "sequence");

-- CreateIndex
CREATE INDEX "subscriptions_status_ends_idx" ON "subscriptions"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_sequence_key" ON "subscriptions"("user_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_key" ON "subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_schedule_key" ON "subscriptions"("provider", "provider_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_transactions_user_created_idx" ON "payment_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_subscription_created_idx" ON "payment_transactions"("subscription_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_transactions_checkout_session_idx" ON "payment_transactions"("checkout_session_id");

-- CreateIndex
CREATE INDEX "payment_transactions_status_created_idx" ON "payment_transactions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_transaction_key" ON "payment_transactions"("provider", "provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_provider_invoice_key" ON "payment_transactions"("provider", "provider_invoice_id");

-- CreateIndex
CREATE INDEX "provider_webhook_events_status_received_idx" ON "provider_webhook_events"("status", "received_at");

-- CreateIndex
CREATE INDEX "provider_webhook_events_provider_type_received_idx" ON "provider_webhook_events"("provider", "event_type", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_event_key" ON "provider_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "outbox_events_delivery_idx" ON "outbox_events"("status", "available_at", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_version_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "event_version");

-- AddForeignKey
ALTER TABLE "product_providers" ADD CONSTRAINT "product_providers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_checkout_session_id_fkey" FOREIGN KEY ("checkout_session_id") REFERENCES "checkout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain checks not expressible in Prisma schema
ALTER TABLE "products" ADD CONSTRAINT "products_billing_interval_count_positive_check" CHECK ("billing_interval_count" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_price_minor_positive_check" CHECK ("price_minor" > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_completion_facts_check" CHECK (
  ("status" = 'COMPLETED' AND "provider_checkout_id" IS NOT NULL AND "completed_at" IS NOT NULL)
  OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_sequence_positive_check" CHECK ("sequence" > 0);
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_period_check" CHECK ("starts_at" < "ends_at");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_auto_renew_facts_check" CHECK (
  ("auto_renew" = TRUE AND "status" IN ('ACTIVE', 'QUEUED') AND "next_billing_at" = "ends_at")
  OR ("auto_renew" = FALSE AND "next_billing_at" IS NULL)
);
CREATE UNIQUE INDEX "subscriptions_one_active_per_user_key"
  ON "subscriptions"("user_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "subscriptions_one_renewable_tail_per_user_key"
  ON "subscriptions"("user_id") WHERE "auto_renew" = TRUE AND "status" IN ('ACTIVE', 'QUEUED');

ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_minor_positive_check" CHECK ("amount_minor" > 0);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_kind_checkout_check" CHECK (
  ("kind" = 'PURCHASE' AND "checkout_session_id" IS NOT NULL)
  OR ("kind" = 'RENEWAL' AND "checkout_session_id" IS NULL)
);
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_lifecycle_facts_check" CHECK (
  ("status" IN ('PENDING', 'PROCESSING') AND "subscription_id" IS NULL AND "paid_at" IS NULL AND "refunded_at" IS NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
  OR ("status" = 'SUCCEEDED' AND "subscription_id" IS NOT NULL AND "provider_transaction_id" IS NOT NULL AND "paid_at" IS NOT NULL AND "refunded_at" IS NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
  OR ("status" = 'FAILED' AND "subscription_id" IS NULL AND "paid_at" IS NULL AND "refunded_at" IS NULL AND "failure_code" IS NOT NULL)
  OR ("status" IN ('REFUNDED', 'PARTIALLY_REFUNDED') AND "subscription_id" IS NOT NULL AND "provider_transaction_id" IS NOT NULL AND "paid_at" IS NOT NULL AND "refunded_at" IS NOT NULL AND "failure_code" IS NULL AND "failure_message" IS NULL)
);

ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_processed_time_check" CHECK ("processed_at" IS NULL OR "processed_at" >= "received_at");
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_lifecycle_facts_check" CHECK (
  ("status" = 'RECEIVED' AND "attempts" = 0 AND "processing_error" IS NULL AND "ignored_reason" IS NULL AND "processed_at" IS NULL)
  OR ("status" = 'PROCESSING' AND "attempts" >= 1 AND "processing_error" IS NULL AND "ignored_reason" IS NULL AND "processed_at" IS NULL)
  OR ("status" = 'PROCESSED' AND "attempts" >= 1 AND "processing_error" IS NULL AND "ignored_reason" IS NULL AND "processed_at" IS NOT NULL)
  OR ("status" = 'FAILED' AND "attempts" >= 1 AND "processing_error" IS NOT NULL AND "ignored_reason" IS NULL AND "processed_at" IS NULL)
  OR ("status" = 'IGNORED' AND "attempts" >= 1 AND "processing_error" IS NULL AND "ignored_reason" IS NOT NULL AND "processed_at" IS NOT NULL)
);

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_version_check" CHECK ("event_version" > 0);
