-- ── Add isCollection flag to Itinerary ───────────────────────────────────────
--
-- Parent/aggregate itineraries (e.g. "California and The American West") act
-- as containers for child variant itineraries and should be excluded from the
-- default CMS list view.  isCollection = true marks these containers.
--
-- Safe to re-run — uses IF NOT EXISTS.

ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "isCollection" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Itinerary_isCollection_idx" ON "Itinerary"("isCollection");
