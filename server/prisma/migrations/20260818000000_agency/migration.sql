-- Migration: HiddenAtlas for Agencies
-- Creates all Agency tables for the B2B2C white-label feature.
-- IDs follow the project convention: TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text
-- All queries must be scoped by agency_id — multi-tenant security is enforced at the API layer.

-- ── Agency ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Agency" (
  id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',  -- active | disabled | archived
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_agency_slug" ON "Agency"(slug);
CREATE INDEX IF NOT EXISTS "idx_agency_status" ON "Agency"(status);

-- ── AgencyBranding ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgencyBranding" (
  id                              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyId"                      TEXT        NOT NULL UNIQUE REFERENCES "Agency"(id) ON DELETE CASCADE,
  "logoUrl"                       TEXT,
  "logoDarkUrl"                   TEXT,
  "primaryColor"                  TEXT        NOT NULL DEFAULT '#1B6B65',
  "accentColor"                   TEXT        NOT NULL DEFAULT '#C9A96E',
  website                         TEXT,
  "supportEmail"                  TEXT,
  phone                           TEXT,
  whatsapp                        TEXT,
  "showPoweredByHiddenatlas"      BOOLEAN     NOT NULL DEFAULT true,
  "customDomain"                  TEXT,
  "customDomainVerifiedAt"        TIMESTAMPTZ,
  "createdAt"                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_agency_branding_agency" ON "AgencyBranding"("agencyId");

-- ── AgencyMember ─────────────────────────────────────────────────────────────
-- Links a Clerk user (clerkUserId) to an Agency with a role.
-- userId is the HiddenAtlas User.id — may be null while status = 'invited'.
CREATE TABLE IF NOT EXISTS "AgencyMember" (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyId"               TEXT        NOT NULL REFERENCES "Agency"(id) ON DELETE CASCADE,
  "clerkUserId"            TEXT        NOT NULL,
  "userId"                 TEXT        REFERENCES "User"(id) ON DELETE SET NULL,
  role                     TEXT        NOT NULL DEFAULT 'agent',    -- owner | admin | agent | editor
  status                   TEXT        NOT NULL DEFAULT 'invited',  -- invited | active | disabled
  "invitedByClerkUserId"   TEXT,
  "invitedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "acceptedAt"             TIMESTAMPTZ,
  "disabledAt"             TIMESTAMPTZ,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_agency_member_unique" ON "AgencyMember"("agencyId", "clerkUserId");
CREATE INDEX IF NOT EXISTS "idx_agency_member_agency"       ON "AgencyMember"("agencyId");
CREATE INDEX IF NOT EXISTS "idx_agency_member_clerk_user"   ON "AgencyMember"("clerkUserId");
CREATE INDEX IF NOT EXISTS "idx_agency_member_user"         ON "AgencyMember"("userId");
CREATE INDEX IF NOT EXISTS "idx_agency_member_status"       ON "AgencyMember"(status);

-- ── AgencyClient ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgencyClient" (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyId"  TEXT        NOT NULL REFERENCES "Agency"(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_agency_client_agency" ON "AgencyClient"("agencyId");

-- ── AgencyTemplate ───────────────────────────────────────────────────────────
-- source_trip_id points to an independent Trip created as the template base.
-- Editing the template means editing that Trip; it must never be a client trip.
CREATE TABLE IF NOT EXISTS "AgencyTemplate" (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyId"       TEXT        NOT NULL REFERENCES "Agency"(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  destination      TEXT,
  "sourceTripId"   TEXT        REFERENCES "Trip"(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'active',  -- active | archived
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_agency_template_agency"  ON "AgencyTemplate"("agencyId");
CREATE INDEX IF NOT EXISTS "idx_agency_template_status"  ON "AgencyTemplate"(status);
CREATE INDEX IF NOT EXISTS "idx_agency_template_trip"    ON "AgencyTemplate"("sourceTripId");

-- ── AgencyTrip ───────────────────────────────────────────────────────────────
-- Wrapper around an existing Trip. trip_id points to the real Trip record.
-- share_token_hash stores SHA-256(raw_token) — raw token is NEVER persisted.
CREATE TABLE IF NOT EXISTS "AgencyTrip" (
  id                       TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyId"               TEXT        NOT NULL REFERENCES "Agency"(id) ON DELETE CASCADE,
  "tripId"                 TEXT        REFERENCES "Trip"(id) ON DELETE SET NULL,
  "clientId"               TEXT        REFERENCES "AgencyClient"(id) ON DELETE SET NULL,
  "assignedMemberId"       TEXT        REFERENCES "AgencyMember"(id) ON DELETE SET NULL,
  "templateId"             TEXT        REFERENCES "AgencyTemplate"(id) ON DELETE SET NULL,
  name                     TEXT        NOT NULL,
  destination              TEXT,
  "startDate"              DATE,
  "endDate"                DATE,
  status                   TEXT        NOT NULL DEFAULT 'draft',  -- draft | ready | shared | travelling | completed | archived
  "createdByClerkUserId"   TEXT        NOT NULL,
  "shareTokenHash"         TEXT,
  "shareEnabled"           BOOLEAN     NOT NULL DEFAULT false,
  "shareExpiresAt"         TIMESTAMPTZ,
  "sharedAt"               TIMESTAMPTZ,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_agency_trip_agency"   ON "AgencyTrip"("agencyId");
CREATE INDEX IF NOT EXISTS "idx_agency_trip_client"   ON "AgencyTrip"("clientId");
CREATE INDEX IF NOT EXISTS "idx_agency_trip_member"   ON "AgencyTrip"("assignedMemberId");
CREATE INDEX IF NOT EXISTS "idx_agency_trip_status"   ON "AgencyTrip"(status);
CREATE INDEX IF NOT EXISTS "idx_agency_trip_trip"     ON "AgencyTrip"("tripId");

-- ── AgencyTripTraveller ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AgencyTripTraveller" (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "agencyTripId"   TEXT        NOT NULL REFERENCES "AgencyTrip"(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  email            TEXT,
  type             TEXT        NOT NULL DEFAULT 'adult',  -- adult | child
  "sortOrder"      INTEGER     NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_agency_trip_traveller_trip" ON "AgencyTripTraveller"("agencyTripId");
