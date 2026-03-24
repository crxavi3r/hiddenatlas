-- ── Add pricingKey to Itinerary ──────────────────────────────────────────────
--
-- Stores the pricing plan key (e.g. 'premium_complete', 'premium_essential',
-- 'premium_short') alongside the Stripe Price ID so the CMS can show the
-- correct plan selected in the dropdown without re-resolving from env vars.
--
-- Safe to re-run — uses IF NOT EXISTS.

ALTER TABLE "Itinerary"
  ADD COLUMN IF NOT EXISTS "pricingKey" TEXT;
