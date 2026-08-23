-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "routingKey" TEXT NOT NULL,
    "templatePurpose" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("eventId", "templateVersion")
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_availableAt_idx"
ON "NotificationDelivery"("status", "availableAt");
