-- ── Purchase: support custom-request payments ────────────────────────────────
-- Adds customRequestId and currency columns, and makes userId/itineraryId
-- nullable so that anonymous or pre-itinerary custom-request purchases can
-- be recorded (previously the INSERT failed and was silently swallowed).
--
-- ── CustomRequest: pax range ──────────────────────────────────────────────────
-- Adds paxMin/paxMax so "1–2 travellers" is stored correctly instead of being
-- truncated to 1 by parseInt("1-2"). groupSize becomes nullable (kept for
-- backward compat). Existing rows are backfilled.
--
-- Idempotent: all statements use IF NOT EXISTS / DROP NOT NULL guards.

-- ── 1. Purchase: add customRequestId and currency ─────────────────────────────
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "customRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "currency"        TEXT;

-- ── 2. Purchase: make userId and itineraryId nullable ─────────────────────────
-- Anonymous custom-request purchasers have no userId; itinerary is created
-- after payment so itineraryId can be null at purchase time.
ALTER TABLE "Purchase" ALTER COLUMN "userId"      DROP NOT NULL;
ALTER TABLE "Purchase" ALTER COLUMN "itineraryId" DROP NOT NULL;

-- ── 3. Purchase: partial unique index on customRequestId ──────────────────────
-- Ensures exactly one Purchase per CustomRequest while ignoring regular
-- itinerary purchases (where customRequestId IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_customRequestId_key"
  ON "Purchase"("customRequestId")
  WHERE "customRequestId" IS NOT NULL;

-- ── 4. CustomRequest: add paxMin and paxMax ───────────────────────────────────
ALTER TABLE "CustomRequest"
  ADD COLUMN IF NOT EXISTS "paxMin" INTEGER,
  ADD COLUMN IF NOT EXISTS "paxMax" INTEGER;

-- ── 5. CustomRequest: make groupSize nullable ─────────────────────────────────
-- groupSize is kept for backward compat but new rows store the range in
-- paxMin/paxMax. Making it nullable prevents failures when the value is absent.
ALTER TABLE "CustomRequest" ALTER COLUMN "groupSize" DROP NOT NULL;

-- ── 6. Backfill existing rows ─────────────────────────────────────────────────
UPDATE "CustomRequest"
  SET "paxMin" = "groupSize",
      "paxMax" = "groupSize"
  WHERE "paxMin" IS NULL
    AND "groupSize" IS NOT NULL;
