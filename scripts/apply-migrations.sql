-- ============================================================
-- HiddenAtlas — consolidated migration script
-- Run this once in your Neon SQL console (or via psql) to
-- bring the production database fully up to date.
-- Every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- ── 1. CMS columns on Itinerary ─────────────────────────────────────────────
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "subtitle"       TEXT,
  ADD COLUMN IF NOT EXISTS "destination"    TEXT,
  ADD COLUMN IF NOT EXISTS "country"        TEXT,
  ADD COLUMN IF NOT EXISTS "region"         TEXT,
  ADD COLUMN IF NOT EXISTS "durationDays"   INTEGER,
  ADD COLUMN IF NOT EXISTS "accessType"     TEXT        NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS "stripePriceId"  TEXT,
  ADD COLUMN IF NOT EXISTS "status"         TEXT        NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "schemaVersion"  INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "content"        JSONB       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE "Itinerary" SET "status" = 'published' WHERE "isPublished" = true  AND "status" = 'draft';
UPDATE "Itinerary" SET "status" = 'draft'     WHERE "isPublished" = false AND "status" = 'draft';

CREATE INDEX IF NOT EXISTS "Itinerary_status_idx"     ON "Itinerary"("status");
CREATE INDEX IF NOT EXISTS "Itinerary_accessType_idx" ON "Itinerary"("accessType");
CREATE INDEX IF NOT EXISTS "Itinerary_updatedAt_idx"  ON "Itinerary"("updatedAt");

ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "isCollection" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Itinerary_isCollection_idx" ON "Itinerary"("isCollection");

-- ── 2. ItineraryAsset ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ItineraryAsset" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "itineraryId" TEXT        NOT NULL,
  "assetType"   TEXT        NOT NULL DEFAULT 'gallery',
  "url"         TEXT        NOT NULL,
  "alt"         TEXT,
  "caption"     TEXT,
  "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
  "source"      TEXT        NOT NULL DEFAULT 'manual',
  "active"      BOOLEAN     NOT NULL DEFAULT true,
  "dayNumber"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ItineraryAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItineraryAsset_itineraryId_idx" ON "ItineraryAsset"("itineraryId");
CREATE INDEX IF NOT EXISTS "ItineraryAsset_assetType_idx"   ON "ItineraryAsset"("assetType");
CREATE INDEX IF NOT EXISTS "ItineraryAsset_active_idx"      ON "ItineraryAsset"("active");

-- dayNumber may have been added separately — safe to add again
ALTER TABLE "ItineraryAsset"
  ADD COLUMN IF NOT EXISTS "dayNumber" INTEGER;

-- ── 3. ItineraryAIGeneration ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ItineraryAIGeneration" (
  "id"           TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "itineraryId"  TEXT,
  "prompt"       TEXT        NOT NULL,
  "rawOutput"    TEXT        NOT NULL DEFAULT '',
  "parsedOutput" JSONB       NOT NULL DEFAULT '{}',
  "createdBy"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ItineraryAIGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItineraryAIGeneration_itineraryId_idx" ON "ItineraryAIGeneration"("itineraryId");
CREATE INDEX IF NOT EXISTS "ItineraryAIGeneration_createdAt_idx"   ON "ItineraryAIGeneration"("createdAt");

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT 'ItineraryAsset' AS "table",
       COUNT(*)::text   AS "rows"
FROM   "ItineraryAsset";
