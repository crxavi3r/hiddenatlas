-- Adds Instagram permalink + published-at columns, and permalink to the audit log.
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).

-- instagramPermalink: permanent URL to the published Instagram post
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "instagramPermalink"   TEXT,
  ADD COLUMN IF NOT EXISTS "instagramPublishedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "Itinerary_instagramPermalink_idx"
  ON "Itinerary"("instagramPermalink")
  WHERE "instagramPermalink" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Itinerary_instagramPublishedAt_idx"
  ON "Itinerary"("instagramPublishedAt")
  WHERE "instagramPublishedAt" IS NOT NULL;

-- permalink on the audit log so each row is self-contained
ALTER TABLE "InstagramPublishLog"
  ADD COLUMN IF NOT EXISTS "permalink" TEXT;
