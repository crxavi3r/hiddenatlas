-- ── Step 1: Remove existing duplicate Trip rows ──────────────────────────────
-- Keep only the newest row per (userId, destination, source).
-- TripDay rows cascade-delete automatically.
-- TripEvent rows are unaffected (no FK on tripId — intentional audit preservation).
DELETE FROM "Trip"
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY "userId", destination, source
        ORDER BY "createdAt" DESC
      ) AS rn
    FROM "Trip"
  ) ranked
  WHERE rn > 1
);

-- ── Step 2: Add itinerarySlug column ─────────────────────────────────────────
-- Stores the stable slug for curated itineraries (FREE_JOURNEY / PREMIUM_JOURNEY).
-- NULL for AI_GENERATED trips (users may have many AI trips to the same destination).
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "itinerarySlug" TEXT DEFAULT NULL;

-- ── Step 3: Partial unique index ─────────────────────────────────────────────
-- Enforces one Trip per user per curated itinerary.
-- Partial (WHERE NOT NULL) allows unlimited AI-generated trips.
CREATE UNIQUE INDEX "Trip_userId_itinerarySlug_key"
  ON "Trip"("userId", "itinerarySlug")
  WHERE "itinerarySlug" IS NOT NULL;
