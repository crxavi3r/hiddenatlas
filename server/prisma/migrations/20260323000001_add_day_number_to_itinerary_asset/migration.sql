-- Add dayNumber column to ItineraryAsset for explicit day tracking
ALTER TABLE "ItineraryAsset"
  ADD COLUMN IF NOT EXISTS "dayNumber" INTEGER;
