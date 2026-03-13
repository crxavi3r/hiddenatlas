-- ── Add Event table for analytics tracking ────────────────────────────────
-- Captures page views, itinerary views, and other client-side events.
-- userId is nullable — anonymous events are tracked at session level.
-- country is populated from Vercel's x-vercel-ip-country header.
-- deviceType is inferred from User-Agent on the server side.

CREATE TABLE "Event" (
  "id"            TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"        TEXT,
  "sessionId"     TEXT,
  "eventType"     TEXT         NOT NULL,
  "itinerarySlug" TEXT,
  "pagePath"      TEXT,
  "source"        TEXT,
  "country"       TEXT,
  "deviceType"    TEXT,
  "metadata"      JSONB        NOT NULL DEFAULT '{}',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Event_userId_idx"        ON "Event"("userId");
CREATE INDEX "Event_eventType_idx"     ON "Event"("eventType");
CREATE INDEX "Event_itinerarySlug_idx" ON "Event"("itinerarySlug");
CREATE INDEX "Event_createdAt_idx"     ON "Event"("createdAt");
CREATE INDEX "Event_sessionId_idx"     ON "Event"("sessionId");
