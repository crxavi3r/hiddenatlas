-- Add source column to Trip table.
-- Tracks where the trip originated: AI_GENERATED | FREE_JOURNEY | PREMIUM_JOURNEY
-- Default: AI_GENERATED for backward compatibility with rows already in the DB.
ALTER TABLE "Trip" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'AI_GENERATED';
