-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXTENDED', 'UPCOMING_PAYMENT', 'SUBSCRIPTION_EXPIRING', 'PAYMENT_FAILED', 'PAYMENT_RECOVERED', 'SUBSCRIPTION_CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationInboxOutcome" AS ENUM ('APPLIED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "businessKey" TEXT NOT NULL,
    "subscriptionId" UUID,
    "providerInvoiceId" VARCHAR(255),
    "effectiveAt" TIMESTAMPTZ(3) NOT NULL,
    "subscriptionEndsAt" TIMESTAMPTZ(3),
    "reasonCode" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMPTZ(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationInbox" (
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "businessKey" TEXT NOT NULL,
    "outcome" "NotificationInboxOutcome" NOT NULL,
    "notificationId" UUID,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationInbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL,
    "routingKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" VARCHAR(100),
    "lastErrorCode" VARCHAR(100),
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_businessKey_key" ON "Notification"("businessKey");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_userId_seenAt_createdAt_idx" ON "Notification"("userId", "seenAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_eventId_key" ON "NotificationOutbox"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_aggregateId_key" ON "NotificationOutbox"("aggregateId");

-- CreateIndex
CREATE INDEX "NotificationOutbox_status_availableAt_occurredAt_idx" ON "NotificationOutbox"("status", "availableAt", "occurredAt");

-- AddForeignKey
ALTER TABLE "NotificationInbox" ADD CONSTRAINT "NotificationInbox_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_aggregateId_fkey" FOREIGN KEY ("aggregateId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
