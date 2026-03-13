-- ── Extend CustomRequest with full form fields + workflow status ─────────────
-- Uses IF NOT EXISTS throughout so this is safe to re-run if partially applied.

ALTER TABLE "CustomRequest"
  ADD COLUMN IF NOT EXISTS "phone"     TEXT,
  ADD COLUMN IF NOT EXISTS "duration"  TEXT,
  ADD COLUMN IF NOT EXISTS "groupType" TEXT,
  ADD COLUMN IF NOT EXISTS "budget"    TEXT,
  ADD COLUMN IF NOT EXISTS "style"     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "status"    TEXT  NOT NULL DEFAULT 'open';

CREATE INDEX IF NOT EXISTS "CustomRequest_status_idx"    ON "CustomRequest"("status");
CREATE INDEX IF NOT EXISTS "CustomRequest_createdAt_idx" ON "CustomRequest"("createdAt");
