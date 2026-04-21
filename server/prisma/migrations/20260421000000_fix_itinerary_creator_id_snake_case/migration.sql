-- ── Fix Itinerary.creator_id column name ──────────────────────────────────────
--
-- Migration 20260415000000_add_creators added this column as "creatorId"
-- (quoted camelCase), but all application queries reference it as creator_id
-- (unquoted snake_case). PostgreSQL treats these as different identifiers.
--
-- This migration:
--   1. Renames "creatorId" → creator_id if the camelCase column exists
--   2. Adds creator_id if neither variant exists yet (fresh install that
--      ran the old migration file before this fix was applied)
--   3. Drops the old camelCase index and creates the correct snake_case one
--
-- Safe to re-run (all operations are conditional).

DO $$
BEGIN
  -- Case 1: column exists as "creatorId" (camelCase) — rename it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Itinerary'
      AND column_name  = 'creatorId'
  ) THEN
    ALTER TABLE "Itinerary" RENAME COLUMN "creatorId" TO creator_id;
    RAISE NOTICE '[fix-creator-id] renamed "creatorId" → creator_id';

  -- Case 2: neither exists — add it now (covers fresh installs where both
  --         20260415000000 and this migration run for the first time)
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Itinerary'
      AND column_name  = 'creator_id'
  ) THEN
    ALTER TABLE "Itinerary"
      ADD COLUMN creator_id TEXT REFERENCES "Creator"(id) ON DELETE SET NULL;
    RAISE NOTICE '[fix-creator-id] added creator_id column';

  ELSE
    RAISE NOTICE '[fix-creator-id] creator_id already exists — no action needed';
  END IF;
END $$;

-- Drop the old camelCase index if it exists; create the correct snake_case one.
DROP INDEX IF EXISTS "Itinerary_creatorId_idx";
CREATE INDEX IF NOT EXISTS "Itinerary_creator_id_idx" ON "Itinerary"(creator_id);

-- ── Reinstall immutability trigger with the correct column name ───────────────
-- The prior trigger (from 20260416200000_protect_creator_id_immutable) may have
-- been installed with "creatorId" in its function body. After the column rename
-- the function would reference a non-existent column. Replace it now with the
-- correct snake_case column name.

CREATE OR REPLACE FUNCTION protect_itinerary_creator_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.creator_id IS NOT NULL
     AND (NEW.creator_id IS NULL OR NEW.creator_id <> OLD.creator_id)
  THEN
    RAISE WARNING
      '[creator-guard] blocked attempt to change creator_id on itinerary %, value restored (was: %)',
      OLD.id,
      OLD.creator_id;
    NEW.creator_id := OLD.creator_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_itinerary_creator_immutable ON "Itinerary";

CREATE TRIGGER trg_itinerary_creator_immutable
  BEFORE UPDATE ON "Itinerary"
  FOR EACH ROW
  EXECUTE FUNCTION protect_itinerary_creator_immutable();
