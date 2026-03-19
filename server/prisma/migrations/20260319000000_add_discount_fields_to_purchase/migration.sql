-- AddColumn Purchase.grossAmount / discountAmount / couponCode / stripeCouponId
-- Tracks the original list price, discount applied, and coupon used per purchase.
-- All new columns are nullable or have defaults so existing rows are unaffected.

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "grossAmount"    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "couponCode"     TEXT,
  ADD COLUMN IF NOT EXISTS "stripeCouponId" TEXT;
