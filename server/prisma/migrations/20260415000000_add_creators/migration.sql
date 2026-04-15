-- ── Creator marketplace layer ─────────────────────────────────────────────────
--
-- Adds:
--   1. "Creator" table  — public profiles for itinerary creators/influencers
--   2. "creatorId" FK   — nullable on Itinerary for backwards compatibility
--
-- Safe to re-run — all statements use IF NOT EXISTS or ADD COLUMN IF NOT EXISTS.

-- ── Creator ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Creator" (
  "id"        TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "name"      TEXT        NOT NULL,
  "slug"      TEXT        NOT NULL,
  "avatarUrl" TEXT,
  "bio"       TEXT,
  "userId"    TEXT,          -- FK to User.id — links creator profile to a Clerk account
  "isActive"  BOOLEAN     NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Creator_slug_key"   ON "Creator"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Creator_userId_key" ON "Creator"("userId") WHERE "userId" IS NOT NULL;

-- ── Add creatorId to Itinerary ────────────────────────────────────────────────
ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "creatorId" TEXT REFERENCES "Creator"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Itinerary_creatorId_idx" ON "Itinerary"("creatorId");
