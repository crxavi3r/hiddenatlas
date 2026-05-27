-- Adds instagramPermalink column to Itinerary
-- Stores the permanent URL to the published Instagram post so it can be
-- surfaced in the CMS without a live API call.
ALTER TABLE "Itinerary" ADD COLUMN IF NOT EXISTS "instagramPermalink" TEXT;

CREATE INDEX IF NOT EXISTS "Itinerary_instagramPermalink_idx"
  ON "Itinerary"("instagramPermalink")
  WHERE "instagramPermalink" IS NOT NULL;
