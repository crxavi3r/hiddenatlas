-- Safe additive migration: purchase discount tracking
-- All columns are nullable (or have a DEFAULT) so no existing row is broken.
-- Run in production with:
--   psql $DATABASE_URL -f this_file.sql
-- Idempotent: safe to run more than once.

-- ── Step 1: Add columns ───────────────────────────────────────────────────────
ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "grossAmount"           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "netAmount"             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discountAmount"        DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "couponCode"            TEXT,
  ADD COLUMN IF NOT EXISTS "discountType"          TEXT,
  ADD COLUMN IF NOT EXISTS "discountValue"         DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stripePromotionCodeId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeCouponId"        TEXT;

-- ── Step 2: Backfill legacy rows ──────────────────────────────────────────────
-- For every purchase that existed before discount tracking was added:
--   grossAmount = amount  (full price = what they paid, no discount was possible)
--   netAmount   = amount  (same)
--   discountAmount = 0    (no discount was in effect)
-- Rows already backfilled (grossAmount IS NOT NULL) are untouched.
UPDATE "Purchase"
SET
  "grossAmount"    = amount,
  "netAmount"      = amount,
  "discountAmount" = 0
WHERE "grossAmount" IS NULL;
