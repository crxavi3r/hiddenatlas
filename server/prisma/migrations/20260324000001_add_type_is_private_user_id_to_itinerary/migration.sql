-- ── Add type, isPrivate, userId to Itinerary ──────────────────────────────────
--
-- type:      'free' | 'premium' | 'custom'  (extends the legacy accessType field)
-- isPrivate: true for custom / private itineraries
-- userId:    nullable owner — set for custom itineraries assigned to a specific user
--
-- Back-fill logic:
--   type      = 'free'    if accessType = 'free',  else 'premium'
--   isPrivate = false     for all existing rows (none are custom)
--   userId    = NULL      for all existing rows
--
-- Safe to re-run — uses IF NOT EXISTS.

ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS type        TEXT    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "userId"    TEXT;

-- Back-fill type for existing paid itineraries
UPDATE "Itinerary"
   SET type = 'premium'
 WHERE "accessType" = 'paid'
   AND type = 'free';

CREATE INDEX IF NOT EXISTS "Itinerary_type_idx"      ON "Itinerary"(type);
CREATE INDEX IF NOT EXISTS "Itinerary_isPrivate_idx" ON "Itinerary"("isPrivate");
CREATE INDEX IF NOT EXISTS "Itinerary_userId_idx"    ON "Itinerary"("userId");
