-- ── Creator marketplace layer ─────────────────────────────────────────────────
--
-- Adds:
--   1. "Creator" table  — public profiles for itinerary creators/influencers
--   2. creator_id FK    — nullable on Itinerary for backwards compatibility
--
-- Safe to re-run — all statements use IF NOT EXISTS or ADD COLUMN IF NOT EXISTS.

-- ── Creator ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Creator" (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  avatar_url  TEXT,
  bio         TEXT,
  email       TEXT,
  user_id     TEXT,          -- FK to User.id — links creator profile to a Clerk account
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Creator_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "Creator_slug_key"    ON "Creator"(slug);
CREATE UNIQUE INDEX IF NOT EXISTS "Creator_user_id_key" ON "Creator"(user_id) WHERE user_id IS NOT NULL;

-- ── Add creator_id to Itinerary ──────────────────────────────────────────────
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS creator_id TEXT REFERENCES "Creator"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Itinerary_creator_id_idx" ON "Itinerary"(creator_id);
