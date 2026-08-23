-- CreateEnum
CREATE TYPE "PaymentEntitlementOutcome" AS ENUM ('APPLIED', 'DUPLICATE', 'STALE', 'IGNORED');

-- CreateTable
CREATE TABLE "PaymentEntitlementInbox" (
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "subscriptionSequence" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" "PaymentEntitlementOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentEntitlementInbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "PaymentEntitlementCursor" (
    "userId" TEXT NOT NULL,
    "lastSubscriptionSequence" INTEGER NOT NULL,
    "activeSubscriptionId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentEntitlementCursor_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "PaymentEntitlementInbox_userId_subscriptionSequence_idx"
ON "PaymentEntitlementInbox"("userId", "subscriptionSequence");

-- AddForeignKey
ALTER TABLE "PaymentEntitlementInbox"
ADD CONSTRAINT "PaymentEntitlementInbox_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEntitlementCursor"
ADD CONSTRAINT "PaymentEntitlementCursor_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;