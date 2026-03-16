-- ── Itinerary CMS: extend Itinerary + add ItineraryAsset + ItineraryAIGeneration ──
--
-- This migration:
--   1. Adds CMS-specific columns to the existing Itinerary table
--      (safe to add: all use IF NOT EXISTS; existing Purchase/Checkout FKs untouched)
--   2. Back-fills status from the legacy isPublished boolean
--   3. Adds ItineraryAsset table for structured image management
--   4. Adds ItineraryAIGeneration table for AI draft traceability
--
-- Safe to re-run — all statements use IF NOT EXISTS or WHERE guards.

-- ── Extend Itinerary ─────────────────────────────────────────────────────────
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "subtitle"       TEXT,
  ADD COLUMN IF NOT EXISTS "destination"    TEXT,
  ADD COLUMN IF NOT EXISTS "country"        TEXT,
  ADD COLUMN IF NOT EXISTS "region"         TEXT,
  ADD COLUMN IF NOT EXISTS "durationDays"   INTEGER,
  ADD COLUMN IF NOT EXISTS "accessType"     TEXT         NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS "stripePriceId"  TEXT,
  ADD COLUMN IF NOT EXISTS "status"         TEXT         NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "schemaVersion"  INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "content"        JSONB        NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- Back-fill: sync isPublished → status
UPDATE "Itinerary" SET "status" = 'published' WHERE "isPublished" = true  AND "status" = 'draft';
UPDATE "Itinerary" SET "status" = 'draft'     WHERE "isPublished" = false AND "status" = 'draft';

CREATE INDEX IF NOT EXISTS "Itinerary_status_idx"     ON "Itinerary"("status");
CREATE INDEX IF NOT EXISTS "Itinerary_accessType_idx" ON "Itinerary"("accessType");
CREATE INDEX IF NOT EXISTS "Itinerary_updatedAt_idx"  ON "Itinerary"("updatedAt");

-- ── ItineraryAsset ───────────────────────────────────────────────────────────
-- Stores all images associated with an itinerary.
-- assetType: hero | gallery | research | ai_suggested | manual
-- source:    ai | manual
CREATE TABLE IF NOT EXISTS "ItineraryAsset" (
  "id"           TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "itineraryId"  TEXT         NOT NULL,
  "assetType"    TEXT         NOT NULL DEFAULT 'gallery',
  "url"          TEXT         NOT NULL,
  "alt"          TEXT,
  "caption"      TEXT,
  "sortOrder"    INTEGER      NOT NULL DEFAULT 0,
  "source"       TEXT         NOT NULL DEFAULT 'manual',
  "active"       BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "ItineraryAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItineraryAsset_itineraryId_idx" ON "ItineraryAsset"("itineraryId");
CREATE INDEX IF NOT EXISTS "ItineraryAsset_assetType_idx"   ON "ItineraryAsset"("assetType");
CREATE INDEX IF NOT EXISTS "ItineraryAsset_active_idx"      ON "ItineraryAsset"("active");

-- ── ItineraryAIGeneration ────────────────────────────────────────────────────
-- Immutable audit log of every AI draft generation request.
-- AI output is NEVER auto-published. Always requires explicit editor review.
CREATE TABLE IF NOT EXISTS "ItineraryAIGeneration" (
  "id"            TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "itineraryId"   TEXT,                  -- nullable: can generate before saving
  "prompt"        TEXT         NOT NULL,
  "rawOutput"     TEXT         NOT NULL DEFAULT '',
  "parsedOutput"  JSONB        NOT NULL DEFAULT '{}',
  "createdBy"     TEXT,                  -- admin email
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "ItineraryAIGeneration_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ItineraryAIGeneration_itineraryId_idx" ON "ItineraryAIGeneration"("itineraryId");
CREATE INDEX IF NOT EXISTS "ItineraryAIGeneration_createdAt_idx"   ON "ItineraryAIGeneration"("createdAt");
