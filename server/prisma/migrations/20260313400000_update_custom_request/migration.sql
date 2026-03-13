-- ── Extend CustomRequest with full form fields + workflow status ─────────────
-- Adds the fields submitted via the custom planning form that were previously
-- only sent by email, plus a status field for the admin workflow.

ALTER TABLE "CustomRequest"
  ADD COLUMN "phone"     TEXT,
  ADD COLUMN "duration"  TEXT,
  ADD COLUMN "groupType" TEXT,
  ADD COLUMN "budget"    TEXT,
  ADD COLUMN "style"     JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "status"    TEXT  NOT NULL DEFAULT 'open';

CREATE INDEX "CustomRequest_status_idx"    ON "CustomRequest"("status");
CREATE INDEX "CustomRequest_createdAt_idx" ON "CustomRequest"("createdAt");
