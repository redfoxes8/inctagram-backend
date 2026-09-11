-- CreateEnum
CREATE TYPE "SubscriptionReminderNotificationType" AS ENUM ('UPCOMING_PAYMENT', 'SUBSCRIPTION_EXPIRING');

-- CreateEnum
CREATE TYPE "SubscriptionReminderStatus" AS ENUM ('PENDING', 'COMPLETED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "subscription_reminders" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_type" "SubscriptionReminderNotificationType" NOT NULL,
    "lead_days" SMALLINT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "subscription_ends_at" TIMESTAMPTZ(3) NOT NULL,
    "expected_auto_renew" BOOLEAN NOT NULL,
    "status" "SubscriptionReminderStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMPTZ(3),
    "suppressed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_reminders_subscription_end_lead_key"
  ON "subscription_reminders"("subscription_id", "subscription_ends_at", "lead_days");

-- CreateIndex
CREATE INDEX "subscription_reminders_pending_due_idx"
  ON "subscription_reminders"("due_at", "id")
  WHERE "status" = 'PENDING';

-- AddConstraint
ALTER TABLE "subscription_reminders"
  ADD CONSTRAINT "subscription_reminders_lead_days_check" CHECK ("lead_days" IN (1, 7));

-- AddForeignKey
ALTER TABLE "subscription_reminders"
  ADD CONSTRAINT "subscription_reminders_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
