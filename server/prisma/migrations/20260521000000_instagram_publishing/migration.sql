-- ── Instagram Publishing ──────────────────────────────────────────────────────
-- Adds Instagram Graph API integration for itinerary publishing:
--   1. instagram_account_id + access token columns on Creator
--   2. instagramPostId column on Itinerary
--   3. InstagramPublishLog audit table
--
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Run with: node scripts/migrate.mjs (or the Prisma migration runner)

-- ── 1. Creator: Instagram connection ─────────────────────────────────────────
-- Stores the connected Instagram Business Account ID, the long-lived access
-- token (valid ~60 days), and its expiry timestamp.
ALTER TABLE "Creator"
  ADD COLUMN IF NOT EXISTS instagram_account_id       TEXT,
  ADD COLUMN IF NOT EXISTS instagram_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS instagram_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_creator_instagram_account
  ON "Creator"(instagram_account_id);

-- ── 2. Itinerary: Instagram post reference ────────────────────────────────────
-- Stores the ID of the published Instagram post for this itinerary.
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "instagramPostId" TEXT;

CREATE INDEX IF NOT EXISTS idx_itinerary_instagram_post
  ON "Itinerary"("instagramPostId");

-- ── 3. InstagramPublishLog — immutable audit log ──────────────────────────────
-- Records every publish attempt (success and failure) for audit purposes.
-- Rows are never deleted or modified; new rows are appended on each attempt.
CREATE TABLE IF NOT EXISTS "InstagramPublishLog" (
  "id"                 TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "itineraryId"        TEXT        NOT NULL,
  "creatorId"          TEXT,
  "instagramAccountId" TEXT,
  "instagramPostId"    TEXT,
  "caption"            TEXT,
  "status"             TEXT        NOT NULL DEFAULT 'pending',  -- success | failed
  "errorMessage"       TEXT,
  "publishedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "InstagramPublishLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InstagramPublishLog_itineraryId_idx"
  ON "InstagramPublishLog"("itineraryId");

CREATE INDEX IF NOT EXISTS "InstagramPublishLog_creatorId_idx"
  ON "InstagramPublishLog"("creatorId");

CREATE INDEX IF NOT EXISTS "InstagramPublishLog_status_idx"
  ON "InstagramPublishLog"("status");
