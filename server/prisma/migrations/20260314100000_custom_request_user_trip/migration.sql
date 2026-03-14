-- Add userId (nullable) and tripId (nullable) to CustomRequest
-- userId links the request to the logged-in user who submitted it.
-- tripId links to a Trip when admin creates the itinerary for this request.

ALTER TABLE "CustomRequest" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "CustomRequest" ADD COLUMN IF NOT EXISTS "tripId" TEXT;

CREATE INDEX IF NOT EXISTS "CustomRequest_userId_idx" ON "CustomRequest"("userId");
