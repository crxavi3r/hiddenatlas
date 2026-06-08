-- Migration: Add ItineraryDayStop table
-- Structured per-day stops for route map, My Trips, and PDF generation

CREATE TABLE IF NOT EXISTS "ItineraryDayStop" (
  id                   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "itineraryId"        TEXT NOT NULL REFERENCES "Itinerary"(id) ON DELETE CASCADE,
  "dayNumber"          INTEGER NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  type                 TEXT NOT NULL DEFAULT 'attraction',
  "locationName"       TEXT,
  address              TEXT,
  latitude             DOUBLE PRECISION,
  longitude            DOUBLE PRECISION,
  "suggestedTime"      TEXT,
  "durationMinutes"    INTEGER,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0,
  "isOptional"         BOOLEAN NOT NULL DEFAULT false,
  "isMajorStop"        BOOLEAN NOT NULL DEFAULT false,
  "showOnMap"          BOOLEAN NOT NULL DEFAULT true,
  "bookingRecommended" BOOLEAN NOT NULL DEFAULT false,
  "bookingUrl"         TEXT,
  notes                TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}',
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_day_stop_itinerary"   ON "ItineraryDayStop"("itineraryId");
CREATE INDEX IF NOT EXISTS "idx_day_stop_day"         ON "ItineraryDayStop"("itineraryId", "dayNumber");
CREATE INDEX IF NOT EXISTS "idx_day_stop_order"       ON "ItineraryDayStop"("itineraryId", "dayNumber", "sortOrder");
CREATE INDEX IF NOT EXISTS "idx_day_stop_show_on_map" ON "ItineraryDayStop"("showOnMap") WHERE "showOnMap" = true;
CREATE INDEX IF NOT EXISTS "idx_day_stop_type"        ON "ItineraryDayStop"(type);
