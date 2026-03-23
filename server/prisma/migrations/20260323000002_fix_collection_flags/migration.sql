-- ── Fix isCollection flag for parent/aggregate itineraries ───────────────────
--
-- The isCollection column was added with DEFAULT false, so all pre-existing
-- rows received false. This migration corrects the known parent itineraries.
--
-- Safe to re-run — uses WHERE clause guards.

UPDATE "Itinerary"
   SET "isCollection" = true
 WHERE slug = 'california-american-west'
   AND "isCollection" = false;
