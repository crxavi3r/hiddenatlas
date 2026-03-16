-- ── Separate payment tracking from workflow status on CustomRequest ────────────
--
-- Before this migration, two payment-related values could appear inside the
-- workflow `status` column ('pending_payment', 'paid'), which mixed concerns.
--
-- This migration:
--   1. Adds a dedicated `paymentStatus` column (values: 'unpaid' | 'paid')
--   2. Adds `stripeSessionId` and `paidAt` for Stripe traceability
--   3. Migrates any existing polluted status values to their correct fields
--
-- Safe to re-run — all statements use IF NOT EXISTS or WHERE guards.

ALTER TABLE "CustomRequest"
  ADD COLUMN IF NOT EXISTS "paymentStatus"   TEXT         NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS "stripeSessionId" TEXT,
  ADD COLUMN IF NOT EXISTS "paidAt"          TIMESTAMPTZ;

-- Migrate records where payment state was written into the status column:
--   pending_payment  →  status = 'open',  paymentStatus = 'unpaid'
--   paid             →  status = 'open',  paymentStatus = 'paid'

UPDATE "CustomRequest"
  SET status = 'open', "paymentStatus" = 'unpaid'
  WHERE status = 'pending_payment';

UPDATE "CustomRequest"
  SET status = 'open', "paymentStatus" = 'paid'
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS "CustomRequest_paymentStatus_idx"
  ON "CustomRequest"("paymentStatus");
