-- AlterTable: add Stripe tracking fields to Purchase
ALTER TABLE "Purchase" ADD COLUMN "stripeSessionId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "stripePaymentIntentId" TEXT;

-- CreateIndex: unique session ID (webhook idempotency at DB level)
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");

-- CreateIndex: one purchase per user per itinerary
CREATE UNIQUE INDEX "Purchase_userId_itineraryId_key" ON "Purchase"("userId", "itineraryId");
