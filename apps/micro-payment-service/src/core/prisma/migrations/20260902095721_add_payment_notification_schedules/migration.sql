-- CreateEnum
CREATE TYPE "PaymentNotificationScheduleType" AS ENUM ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXTENDED', 'PAYMENT_FAILED', 'PAYMENT_RECOVERED', 'SUBSCRIPTION_CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentNotificationScheduleStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_notification_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_type" "PaymentNotificationScheduleType" NOT NULL,
    "business_key" VARCHAR(512) NOT NULL,
    "source_subscription_id" UUID,
    "effective_at" TIMESTAMPTZ(3) NOT NULL,
    "subscription_ends_at" TIMESTAMPTZ(3),
    "provider_invoice_id" VARCHAR(255),
    "reason_code" VARCHAR(100),
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "PaymentNotificationScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_notification_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_notification_schedule_sources" (
    "source_transaction_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_notification_schedule_sources_pkey" PRIMARY KEY ("source_transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_notification_schedules_business_key_key" ON "payment_notification_schedules"("business_key");

-- CreateIndex
CREATE INDEX "payment_notification_schedules_status_due_idx" ON "payment_notification_schedules"("status", "due_at");

-- CreateIndex
CREATE INDEX "payment_notification_schedules_user_status_due_idx" ON "payment_notification_schedules"("user_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "payment_notification_schedule_sources_schedule_idx" ON "payment_notification_schedule_sources"("schedule_id");

-- AddForeignKey
ALTER TABLE "payment_notification_schedule_sources" ADD CONSTRAINT "payment_notification_schedule_sources_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "payment_notification_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
