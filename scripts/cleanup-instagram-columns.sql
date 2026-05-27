-- cleanup-instagram-columns.sql
--
-- Run this in the Neon SQL editor (or via psql) to detect and clean up
-- any duplicate lowercase Instagram columns that may have been created
-- without quoted identifiers.
--
-- PostgreSQL stores unquoted identifiers as lowercase. If any migration
-- ran without quoting the column names, both:
--   "instagramPostId"    (quoted, camelCase — correct)
--   instagrampostid      (unquoted → folded to lowercase — duplicate)
-- may coexist in the Itinerary table.
--
-- This script:
--   1. Shows which Instagram columns currently exist on the table.
--   2. If lowercase duplicates exist, copies any non-null values they hold
--      into the camelCase columns (the ones the application uses).
--   3. Drops the lowercase duplicates.
--
-- Safe to run multiple times (DROP COLUMN IF EXISTS is idempotent).

-- ── Step 1: Inspect current column names ─────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Itinerary'
  AND lower(column_name) LIKE 'instagram%'
ORDER BY column_name;

-- ── Step 2: Merge lowercase data into camelCase columns ───────────────────────
-- Only runs the UPDATE if the lowercase column actually exists and has data.
-- Each statement is wrapped in a DO block so it doesn't error if the
-- lowercase column doesn't exist.

DO $$
BEGIN
  -- instagrampostid → "instagramPostId"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Itinerary' AND column_name = 'instagrampostid'
  ) THEN
    UPDATE "Itinerary"
    SET "instagramPostId" = instagrampostid
    WHERE "instagramPostId" IS NULL AND instagrampostid IS NOT NULL;
    RAISE NOTICE 'Merged % rows: instagrampostid → "instagramPostId"',
      (SELECT COUNT(*) FROM "Itinerary" WHERE "instagramPostId" IS NOT NULL AND instagrampostid IS NOT NULL);
  END IF;

  -- instagrampermalink → "instagramPermalink"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Itinerary' AND column_name = 'instagrampermalink'
  ) THEN
    UPDATE "Itinerary"
    SET "instagramPermalink" = instagrampermalink
    WHERE "instagramPermalink" IS NULL AND instagrampermalink IS NOT NULL;
    RAISE NOTICE 'Merged % rows: instagrampermalink → "instagramPermalink"',
      (SELECT COUNT(*) FROM "Itinerary" WHERE "instagramPermalink" IS NOT NULL AND instagrampermalink IS NOT NULL);
  END IF;

  -- instagrampublishedat → "instagramPublishedAt"
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Itinerary' AND column_name = 'instagrampublishedat'
  ) THEN
    UPDATE "Itinerary"
    SET "instagramPublishedAt" = instagrampublishedat
    WHERE "instagramPublishedAt" IS NULL AND instagrampublishedat IS NOT NULL;
    RAISE NOTICE 'Merged % rows: instagrampublishedat → "instagramPublishedAt"',
      (SELECT COUNT(*) FROM "Itinerary" WHERE "instagramPublishedAt" IS NOT NULL AND instagrampublishedat IS NOT NULL);
  END IF;
END $$;

-- ── Step 3: Drop lowercase duplicate columns ──────────────────────────────────
ALTER TABLE "Itinerary"
  DROP COLUMN IF EXISTS instagrampostid,
  DROP COLUMN IF EXISTS instagrampermalink,
  DROP COLUMN IF EXISTS instagrampublishedat;

-- ── Step 4: Verify result ─────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Itinerary'
  AND lower(column_name) LIKE 'instagram%'
ORDER BY column_name;

-- Expected output after cleanup:
--   instagramPermalink   | text
--   instagramPostId      | text
--   instagramPublishedAt | timestamp with time zone
