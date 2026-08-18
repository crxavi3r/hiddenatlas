// api/agency.js
// Single Vercel Function for the entire Agency surface.
// Routes via ?action= (namespaced with colons for sub-resources).
//
// Database naming: Agency tables use snake_case columns. SQL aliases them
// to camelCase at the boundary so JavaScript/API remains camelCase.
// Existing HiddenAtlas tables (Trip, User, TripDay …) keep their camelCase columns.
//
// CORE (no namespace)
//   GET  ?action=memberships
//   GET  ?agencyId=&action=dashboard
//   GET  ?agencyId=&action=branding
//   GET  ?agencyId=&action=team
//   POST ?action=onboard                   { name, slug }
//   POST ?agencyId=&action=update-branding
//   POST ?agencyId=&action=update-agency-name
//   POST ?agencyId=&action=invite-member
//   POST ?agencyId=&action=update-member
//   POST ?agencyId=&action=branding-logo-upload
//
// CLIENTS (clients:*)
//   GET  ?agencyId=&action=clients:list    [&search=]
//   GET  ?agencyId=&id=&action=clients:detail
//   POST ?agencyId=&action=clients:create  { name, email, phone, notes }
//   POST ?agencyId=&id=&action=clients:update
//   POST ?agencyId=&id=&action=clients:delete
//
// TEMPLATES (templates:*)
//   GET  ?agencyId=&action=templates:list  [&includeArchived=true]
//   POST ?agencyId=&action=templates:create
//   POST ?agencyId=&id=&action=templates:update
//   POST ?agencyId=&id=&action=templates:archive
//   POST ?agencyId=&id=&action=templates:duplicate
//
// TRIPS (trips:*)
//   PUBLIC (no auth):
//     GET  ?action=trips:resolve-share&token=
//   Authenticated:
//     GET  ?agencyId=&action=trips:list         [&status=]
//     GET  ?agencyId=&agencyTripId=&action=trips:detail
//     GET  ?agencyId=&agencyTripId=&action=trips:travellers
//     GET  ?agencyTripId=&action=trips:preview-data  (agencyId not needed)
//     GET  ?agencyId=&action=trips:list-for-client&clientId=
//     POST ?agencyId=&action=trips:create
//     POST ?agencyId=&agencyTripId=&action=trips:update-status   { status }
//     POST ?agencyId=&agencyTripId=&action=trips:update-meta     { name, ... }
//     POST ?agencyId=&agencyTripId=&action=trips:save-as-template
//     POST ?agencyId=&agencyTripId=&action=trips:generate-share
//     POST ?agencyId=&agencyTripId=&action=trips:regenerate-share
//     POST ?agencyId=&agencyTripId=&action=trips:toggle-share    { shareEnabled }
//     POST ?agencyId=&agencyTripId=&action=trips:add-traveller
//     POST ?agencyId=&agencyTripId=&action=trips:update-traveller
//     POST ?agencyId=&agencyTripId=&action=trips:remove-traveller
//     POST ?agencyId=&agencyTripId=&action=trips:reorder-travellers

import pg from 'pg';
import { put } from '@vercel/blob';
import { verifyAuth }              from './_lib/verifyAuth.js';
import { duplicateTrip }           from './_lib/duplicateTrip.js';
import { generateShareToken, hashShareToken } from './_lib/shareToken.js';
import {
  resolveAgencyCtx,
  resolveAllAgencyMemberships,
  checkIsGlobalAdmin,
  canManageAgency,
  canManageBranding,
  canManageTeam,
  canManageClients,
  canManageTemplates,
  canManageTrips,
  canEditTrips,
  canShareTrips,
} from './_lib/agencyAuth.js';

const { Pool } = pg;

const HEX_COLOR_RE   = /^#[0-9A-Fa-f]{6}$/;
const SLUG_RE        = /^[a-z0-9-]{3,50}$/;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml',
};

// ── Trip helpers ──────────────────────────────────────────────────────────────

function computeDuration(startDate, endDate) {
  if (!startDate || !endDate) return { durationDays: null, duration: '' };
  const s    = new Date(startDate + 'T00:00:00Z');
  const e    = new Date(endDate   + 'T00:00:00Z');
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (diff > 0 && diff <= 365) {
    return { durationDays: diff, duration: diff === 1 ? '1 day' : `${diff} days` };
  }
  return { durationDays: null, duration: '' };
}

async function loadTripWorkspace(pool, tripId) {
  // "Trip" table uses camelCase columns — no aliases needed here.
  const { rows: tripRows } = await pool.query(
    `SELECT id, "userId", "itinerarySlug", "itineraryId", title, destination, country,
            duration, "durationDays", overview, highlights, hotels, experiences,
            source, "coverImage", subtitle, "heroImage",
            "startDate", "endDate", travellers,
            "accommodationSummary", "arrivalInfo", "departureInfo", "generalNotes",
            COALESCE("tripType", 'personal') AS "tripType",
            "createdFrom", "isEditable",
            "pdfUrl", COALESCE("pdfStatus", 'idle') AS "pdfStatus",
            "pdfGeneratedAt", "createdAt", "updatedAt"
     FROM "Trip" WHERE id = $1`,
    [tripId]
  );
  if (!tripRows.length) return null;
  const trip = tripRows[0];

  const [{ rows: tripDays }, { rows: tripItems }, { rows: tripNotes }, { rows: tripBookings }] =
    await Promise.all([
      pool.query(
        `SELECT id, "tripId", "dayNumber", title, description, "sourceDayNumber",
                "titleOverride", "descriptionOverride", notes, "sortOrder", "isHidden", "updatedAt"
         FROM "TripDay" WHERE "tripId" = $1 ORDER BY "sortOrder" ASC, "dayNumber" ASC`,
        [tripId]
      ),
      pool.query(
        `SELECT id, "tripId", "tripDayId", "dayNumber", type, title, description,
                time, "startTime", "endTime", "durationMinutes", "locationName", address,
                latitude, longitude, notes, "bookingReference", provider, url,
                status, "isHidden", "isLocked", "sortOrder", metadata,
                "imageUrl", "imageAlt", "createdAt", "updatedAt"
         FROM "TripItem" WHERE "tripId" = $1 AND "isHidden" = false
         ORDER BY "tripDayId" NULLS LAST, "sortOrder" ASC, "createdAt" ASC`,
        [tripId]
      ),
      pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", title, content,
                "noteType", "isPinned", "createdAt", "updatedAt"
         FROM "TripNote" WHERE "tripId" = $1 ORDER BY "createdAt" ASC`,
        [tripId]
      ),
      pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", type, title,
                date, time, "locationName", address, latitude, longitude,
                provider, "confirmationReference", notes, url,
                "attachmentUrl", status, metadata, "createdAt", "updatedAt"
         FROM "TripBooking" WHERE "tripId" = $1 ORDER BY date ASC NULLS LAST, "createdAt" ASC`,
        [tripId]
      ),
    ]);

  const itemsByDayId = {};
  for (const item of tripItems) {
    const key = item.tripDayId || '__unassigned__';
    if (!itemsByDayId[key]) itemsByDayId[key] = [];
    itemsByDayId[key].push(item);
  }

  return {
    ...trip,
    days:     tripDays.map(day => ({ ...day, items: itemsByDayId[day.id] || [] })),
    notes:    tripNotes,
    bookings: tripBookings,
  };
}

// agTrip must already have camelCase properties (via SQL aliases).
async function buildPortalPayload(pool, agTrip, agencyRow) {
  const [{ rows: brandingRows }, { rows: travellers }] = await Promise.all([
    // AgencyBranding uses snake_case columns — alias to camelCase.
    pool.query(
      `SELECT
         "logo_url"                    AS "logoUrl",
         "logo_dark_url"               AS "logoDarkUrl",
         "primary_color"               AS "primaryColor",
         "accent_color"                AS "accentColor",
         "website_url"                 AS "websiteUrl",
         "support_email"               AS "supportEmail",
         phone,
         whatsapp,
         "show_powered_by_hiddenatlas" AS "showPoweredByHiddenatlas"
       FROM "AgencyBranding" WHERE "agency_id" = $1`,
      [agTrip.agencyId]
    ),
    // AgencyTripTraveller uses snake_case — alias to camelCase.
    pool.query(
      `SELECT
         id, name, email,
         "traveller_type" AS "type",
         "sort_order"     AS "sortOrder"
       FROM "AgencyTripTraveller"
       WHERE "agency_trip_id" = $1
       ORDER BY "sort_order" ASC`,
      [agTrip.id]
    ),
  ]);

  let client = null;
  if (agTrip.clientId) {
    const { rows } = await pool.query(
      `SELECT name FROM "AgencyClient" WHERE id = $1 AND "agency_id" = $2`,
      [agTrip.clientId, agTrip.agencyId]
    );
    client = rows[0] || null;
  }

  const trip = agTrip.tripId ? await loadTripWorkspace(pool, agTrip.tripId) : null;

  return {
    agencyTrip: {
      id: agTrip.id, name: agTrip.name, destination: agTrip.destination,
      startDate: agTrip.startDate, endDate: agTrip.endDate, status: agTrip.status,
    },
    agency:    { name: agencyRow.name, slug: agencyRow.slug },
    branding:  brandingRows[0] || null,
    client,
    travellers,
    trip,
  };
}

// Fetch a single AgencyTrip row with full camelCase aliases.
async function fetchAgencyTrip(pool, atId, agencyId) {
  const { rows } = await pool.query(
    `SELECT
       id,
       "agency_id"              AS "agencyId",
       "trip_id"                AS "tripId",
       "client_id"              AS "clientId",
       "assigned_member_id"     AS "assignedMemberId",
       "template_id"            AS "templateId",
       name,
       destination,
       "start_date"             AS "startDate",
       "end_date"               AS "endDate",
       status,
       "share_token_hash"       AS "shareTokenHash",
       "share_enabled"          AS "shareEnabled",
       "share_expires_at"       AS "shareExpiresAt",
       "shared_at"              AS "sharedAt",
       "created_by_clerk_user_id" AS "createdByClerkUserId",
       "created_at"             AS "createdAt",
       "updated_at"             AS "updatedAt"
     FROM "AgencyTrip"
     WHERE id = $1 AND "agency_id" = $2`,
    [atId, agencyId]
  );
  return rows[0] || null;
}

// SQL fragment: traveller columns aliased to camelCase
const TRAVELLER_SELECT = `
  id, name, email,
  "traveller_type" AS "type",
  "sort_order"     AS "sortOrder",
  "created_at"     AS "createdAt",
  "updated_at"     AS "updatedAt"
`;

// ── Exported handler ──────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try { return await _handler(req, res); }
  catch (err) {
    console.error('[api/agency] TOP-LEVEL UNHANDLED:', err.message, err.stack);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
}

async function _handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // eslint-disable-next-line no-undef
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({
    connectionString:        DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis:       5000,
    max: 3,
  });
  pool.on('error', err => console.error('[api/agency] pool error:', err.message));

  const { action, agencyId } = req.query;
  const agencyTripId = req.query.agencyTripId || req.query.id;
  const id = req.query.id;
  const authHeader = req.headers.authorization;

  try {
    // ════════════════════════════════════════════════════════════════════
    // PUBLIC ACTIONS — no auth required
    // ════════════════════════════════════════════════════════════════════

    if (req.method === 'GET' && action === 'trips:resolve-share') {
      const { token } = req.query;
      if (!token) return res.status(400).json({ error: 'token is required' });

      const hash = hashShareToken(token);
      // AgencyTrip: snake_case → camelCase aliases
      const { rows: atRows } = await pool.query(
        `SELECT
           id,
           "agency_id"        AS "agencyId",
           "trip_id"          AS "tripId",
           "client_id"        AS "clientId",
           name, destination,
           "start_date"       AS "startDate",
           "end_date"         AS "endDate",
           status,
           "share_enabled"    AS "shareEnabled",
           "share_expires_at" AS "shareExpiresAt"
         FROM "AgencyTrip"
         WHERE "share_token_hash" = $1 AND "share_enabled" = true`,
        [hash]
      );
      if (!atRows.length) return res.status(404).json({ error: 'Not found' });
      const agTrip = atRows[0];

      if (agTrip.shareExpiresAt && new Date(agTrip.shareExpiresAt) < new Date()) {
        return res.status(404).json({ error: 'Not found' });
      }

      const { rows: agencyRows } = await pool.query(
        `SELECT id, name, slug, status FROM "Agency" WHERE id = $1`, [agTrip.agencyId]
      );
      if (!agencyRows.length || agencyRows[0].status !== 'active') {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.status(200).json(await buildPortalPayload(pool, agTrip, agencyRows[0]));
    }

    // ════════════════════════════════════════════════════════════════════
    // CORE AGENCY ACTIONS (no resource namespace)
    // ════════════════════════════════════════════════════════════════════

    if (req.method === 'GET' && action === 'memberships') {
      const [memberships, adminUserId] = await Promise.all([
        resolveAllAgencyMemberships(authHeader, pool),
        checkIsGlobalAdmin(authHeader, pool),
      ]);
      return res.status(200).json({ memberships, isGlobalAdmin: !!adminUserId });
    }

    if (req.method === 'GET' && action === 'dashboard') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      // Use the AgencyDashboardSummary view for aggregated stats.
      // View columns: agency_id, active_trips, draft_trips, shared_trips, travelling_trips, upcoming_trips, clients
      const [summaryRes, recentTripsRes] = await Promise.all([
        pool.query(
          `SELECT
             "active_trips"     AS "activeTripCount",
             "upcoming_trips"   AS "upcomingTripCount",
             "travelling_trips" AS "travellingCount",
             "clients"          AS "totalClients"
           FROM "AgencyDashboardSummary"
           WHERE "agency_id" = $1`,
          [agCtx.agencyId]
        ),
        pool.query(
          `SELECT
             t.id, t.name, t.destination,
             t."start_date"  AS "startDate",
             t."end_date"    AS "endDate",
             t.status,
             t."client_id"   AS "clientId",
             c.name          AS "clientName"
           FROM "AgencyTrip" t
           LEFT JOIN "AgencyClient" c ON c.id = t."client_id"
           WHERE t."agency_id" = $1
           ORDER BY t."created_at" DESC LIMIT 10`,
          [agCtx.agencyId]
        ),
      ]);

      const summary = summaryRes.rows[0] ?? {
        activeTripCount: 0, upcomingTripCount: 0, travellingCount: 0, totalClients: 0,
      };

      return res.status(200).json({
        stats: {
          activeTripCount:   parseInt(summary.activeTripCount,   10) || 0,
          upcomingTripCount: parseInt(summary.upcomingTripCount, 10) || 0,
          travellingCount:   parseInt(summary.travellingCount,   10) || 0,
          totalClients:      parseInt(summary.totalClients,      10) || 0,
        },
        recentTrips: recentTripsRes.rows,
      });
    }

    if (req.method === 'GET' && action === 'branding') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      // AgencyBranding has no id column; agency_id is the primary key.
      // LEFT JOIN so we always get agencyName even if no branding row exists.
      const { rows } = await pool.query(
        `SELECT
           a.name                                   AS "agencyName",
           b."agency_id"                            AS "brandingAgencyId",
           b."logo_url"                             AS "logoUrl",
           b."logo_dark_url"                        AS "logoDarkUrl",
           b."primary_color"                        AS "primaryColor",
           b."accent_color"                         AS "accentColor",
           b."website_url"                          AS "websiteUrl",
           b."support_email"                        AS "supportEmail",
           b.phone,
           b.whatsapp,
           b."show_powered_by_hiddenatlas"          AS "showPoweredByHiddenatlas",
           b."created_at"                           AS "createdAt",
           b."updated_at"                           AS "updatedAt"
         FROM "Agency" a
         LEFT JOIN "AgencyBranding" b ON b."agency_id" = a.id
         WHERE a.id = $1`,
        [agCtx.agencyId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Agency not found' });
      const row = rows[0];

      const branding = row.brandingAgencyId ? {
        agencyId:               agCtx.agencyId,
        logoUrl:                row.logoUrl,
        logoDarkUrl:            row.logoDarkUrl,
        primaryColor:           row.primaryColor  ?? '#1B6B65',
        accentColor:            row.accentColor   ?? '#C9A96E',
        websiteUrl:             row.websiteUrl,
        supportEmail:           row.supportEmail,
        phone:                  row.phone,
        whatsapp:               row.whatsapp,
        showPoweredByHiddenatlas: row.showPoweredByHiddenatlas ?? true,
        createdAt:              row.createdAt,
        updatedAt:              row.updatedAt,
      } : {
        agencyId: agCtx.agencyId, logoUrl: null, logoDarkUrl: null,
        primaryColor: '#1B6B65', accentColor: '#C9A96E',
        websiteUrl: null, supportEmail: null, phone: null, whatsapp: null,
        showPoweredByHiddenatlas: true,
      };

      return res.status(200).json({ branding, agencyName: row.agencyName });
    }

    if (req.method === 'GET' && action === 'team') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      // AgencyMember snake_case → camelCase. No user_id column — join via clerkId.
      const { rows } = await pool.query(
        `SELECT
           m.id,
           m."agency_id"              AS "agencyId",
           m."clerk_user_id"          AS "clerkUserId",
           m.email,
           m."display_name"           AS "displayName",
           m.role,
           m.status,
           m."invited_by_clerk_user_id" AS "invitedByClerkUserId",
           m."created_at"             AS "createdAt",
           m."updated_at"             AS "updatedAt",
           u.name                     AS "userName"
         FROM "AgencyMember" m
         LEFT JOIN "User" u ON u."clerkId" = m."clerk_user_id"
         WHERE m."agency_id" = $1
         ORDER BY m."created_at" ASC`,
        [agCtx.agencyId]
      );
      return res.status(200).json({ members: rows });
    }

    if (req.method === 'POST' && action === 'onboard') {
      let clerkId;
      try { clerkId = await verifyAuth(authHeader); }
      catch { return res.status(401).json({ error: 'Unauthorized' }); }

      const { name, slug } = req.body ?? {};
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      if (!slug || !SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'slug must be 3-50 chars: lowercase letters, numbers, hyphens' });
      }

      // User table: camelCase columns
      const { rows: slugRows } = await pool.query(
        `SELECT id FROM "Agency" WHERE slug = $1 LIMIT 1`, [slug.trim()]
      );
      if (slugRows.length) return res.status(409).json({ error: 'slug is already taken' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Agency: snake_case columns
        const { rows: agRows } = await client.query(
          `INSERT INTO "Agency" (id, name, slug, status, "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, 'active', $3, NOW(), NOW()) RETURNING id`,
          [name.trim(), slug.trim(), clerkId]
        );
        const newAgencyId = agRows[0].id;

        // AgencyBranding: snake_case columns, no id column (agency_id is PK)
        await client.query(
          `INSERT INTO "AgencyBranding"
             ("agency_id", "primary_color", "accent_color", "show_powered_by_hiddenatlas", "created_at", "updated_at")
           VALUES ($1, '#1B6B65', '#C9A96E', true, NOW(), NOW())`,
          [newAgencyId]
        );

        // AgencyMember: snake_case, no user_id column — keyed by clerk_user_id
        const { rows: memberRows } = await client.query(
          `INSERT INTO "AgencyMember"
             (id, "agency_id", "clerk_user_id", email, role, status, "created_at", "updated_at")
           SELECT gen_random_uuid(), $1, $2, u.email, 'owner', 'active', NOW(), NOW()
           FROM "User" u WHERE u."clerkId" = $2
           RETURNING id`,
          [newAgencyId, clerkId]
        );

        await client.query('COMMIT');
        return res.status(201).json({
          agencyId: newAgencyId,
          memberId: memberRows[0]?.id ?? null,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    if (req.method === 'POST' && action === 'update-branding') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageBranding(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      // Accept either websiteUrl (new) or website (old) for backward compat
      const {
        logoUrl, logoDarkUrl, primaryColor, accentColor,
        websiteUrl, website,
        supportEmail, phone, whatsapp, showPoweredByHiddenatlas,
      } = req.body ?? {};
      const resolvedWebsiteUrl = websiteUrl ?? website ?? null;

      if (primaryColor !== undefined && !HEX_COLOR_RE.test(primaryColor)) {
        return res.status(400).json({ error: 'primaryColor must be a valid hex color' });
      }
      if (accentColor !== undefined && !HEX_COLOR_RE.test(accentColor)) {
        return res.status(400).json({ error: 'accentColor must be a valid hex color' });
      }

      // AgencyBranding: snake_case columns, ON CONFLICT on agency_id (the PK)
      await pool.query(
        `INSERT INTO "AgencyBranding"
           ("agency_id", "logo_url", "logo_dark_url",
            "primary_color", "accent_color", "website_url", "support_email",
            phone, whatsapp, "show_powered_by_hiddenatlas", "created_at", "updated_at")
         VALUES ($1, $2, $3, COALESCE($4,'#1B6B65'), COALESCE($5,'#C9A96E'), $6, $7, $8, $9, COALESCE($10,true), NOW(), NOW())
         ON CONFLICT ("agency_id") DO UPDATE SET
           "logo_url"                    = COALESCE(EXCLUDED."logo_url",                    "AgencyBranding"."logo_url"),
           "logo_dark_url"               = COALESCE(EXCLUDED."logo_dark_url",               "AgencyBranding"."logo_dark_url"),
           "primary_color"               = COALESCE(EXCLUDED."primary_color",               "AgencyBranding"."primary_color"),
           "accent_color"                = COALESCE(EXCLUDED."accent_color",                "AgencyBranding"."accent_color"),
           "website_url"                 = COALESCE(EXCLUDED."website_url",                 "AgencyBranding"."website_url"),
           "support_email"               = COALESCE(EXCLUDED."support_email",               "AgencyBranding"."support_email"),
           phone                         = COALESCE(EXCLUDED.phone,                         "AgencyBranding".phone),
           whatsapp                      = COALESCE(EXCLUDED.whatsapp,                      "AgencyBranding".whatsapp),
           "show_powered_by_hiddenatlas" = COALESCE(EXCLUDED."show_powered_by_hiddenatlas", "AgencyBranding"."show_powered_by_hiddenatlas"),
           "updated_at" = NOW()`,
        [
          agCtx.agencyId,
          logoUrl ?? null, logoDarkUrl ?? null,
          primaryColor ?? null, accentColor ?? null,
          resolvedWebsiteUrl, supportEmail ?? null,
          phone ?? null, whatsapp ?? null,
          showPoweredByHiddenatlas ?? null,
        ]
      );

      // Return updated branding with camelCase
      const { rows: updated } = await pool.query(
        `SELECT
           "logo_url"                    AS "logoUrl",
           "logo_dark_url"               AS "logoDarkUrl",
           "primary_color"               AS "primaryColor",
           "accent_color"                AS "accentColor",
           "website_url"                 AS "websiteUrl",
           "support_email"               AS "supportEmail",
           phone, whatsapp,
           "show_powered_by_hiddenatlas" AS "showPoweredByHiddenatlas",
           "updated_at"                  AS "updatedAt"
         FROM "AgencyBranding" WHERE "agency_id" = $1`,
        [agCtx.agencyId]
      );
      return res.status(200).json({ branding: updated[0] ?? null });
    }

    if (req.method === 'POST' && action === 'update-agency-name') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageAgency(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      const { name } = req.body ?? {};
      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
      // Agency: snake_case updated_at
      await pool.query(
        `UPDATE "Agency" SET name = $1, "updated_at" = NOW() WHERE id = $2`,
        [name.trim(), agCtx.agencyId]
      );
      return res.status(200).json({ name: name.trim() });
    }

    if (req.method === 'POST' && action === 'invite-member') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageTeam(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { email, role } = req.body ?? {};
      if (!email?.trim()) return res.status(400).json({ error: 'email is required' });
      const VALID_ROLES = new Set(['admin', 'agent', 'editor']);
      if (!VALID_ROLES.has(role)) return res.status(400).json({ error: 'role must be admin, agent, or editor' });

      const normalizedEmail = email.toLowerCase().trim();

      // Look up User by email (User table: camelCase)
      const { rows: userRows } = await pool.query(
        `SELECT id, "clerkId", name FROM "User" WHERE email = $1 LIMIT 1`, [normalizedEmail]
      );
      const existingUser = userRows[0] ?? null;

      let inviteClerkId = `pending:${normalizedEmail}`;
      let inviteDisplayName = null;
      let memberStatus = 'invited';

      if (existingUser) {
        inviteClerkId    = existingUser.clerkId ?? `pending:${normalizedEmail}`;
        inviteDisplayName = existingUser.name ?? null;
        memberStatus     = 'active';

        // Check not already a member (by clerk_user_id)
        const { rows: existingRows } = await pool.query(
          `SELECT id FROM "AgencyMember" WHERE "agency_id" = $1 AND "clerk_user_id" = $2 LIMIT 1`,
          [agCtx.agencyId, inviteClerkId]
        );
        if (existingRows.length) {
          return res.status(409).json({ error: 'User is already a member of this agency' });
        }
      }

      // AgencyMember: snake_case columns. No user_id, invited_at, accepted_at.
      const { rows: memberRows } = await pool.query(
        `INSERT INTO "AgencyMember"
           (id, "agency_id", "clerk_user_id", email, "display_name", role, status,
            "invited_by_clerk_user_id", "created_at", "updated_at")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id, status`,
        [agCtx.agencyId, inviteClerkId, normalizedEmail, inviteDisplayName, role, memberStatus, agCtx.clerkId]
      );
      return res.status(201).json({ memberId: memberRows[0].id, status: memberRows[0].status });
    }

    if (req.method === 'POST' && action === 'update-member') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageTeam(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { memberId, role, status } = req.body ?? {};
      if (!memberId) return res.status(400).json({ error: 'memberId is required' });

      const { rows: targetRows } = await pool.query(
        `SELECT id, role, status FROM "AgencyMember" WHERE id = $1 AND "agency_id" = $2 LIMIT 1`,
        [memberId, agCtx.agencyId]
      );
      if (!targetRows.length) return res.status(404).json({ error: 'Member not found' });
      if (targetRows[0].role === 'owner') return res.status(403).json({ error: 'Cannot modify the agency owner' });

      if (role !== undefined) {
        const VALID = new Set(['admin', 'agent', 'editor']);
        if (!VALID.has(role)) return res.status(400).json({ error: 'Invalid role' });
        await pool.query(
          `UPDATE "AgencyMember" SET role = $1, "updated_at" = NOW() WHERE id = $2`,
          [role, memberId]
        );
      }
      if (status === 'disabled') {
        // No disabled_at column — just set status
        await pool.query(
          `UPDATE "AgencyMember" SET status = 'disabled', "updated_at" = NOW() WHERE id = $1`,
          [memberId]
        );
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'POST' && action === 'branding-logo-upload') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageBranding(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { base64Data, filename, field } = req.body ?? {};
      if (!base64Data || !filename) return res.status(400).json({ error: 'base64Data and filename are required' });
      if (!['logoUrl', 'logoDarkUrl'].includes(field)) {
        return res.status(400).json({ error: 'field must be logoUrl or logoDarkUrl' });
      }

      const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      // eslint-disable-next-line no-undef
      const buffer = Buffer.from(rawBase64, 'base64');
      if (buffer.byteLength > MAX_LOGO_BYTES) return res.status(400).json({ error: 'File exceeds 5 MB limit' });

      const ext  = (filename.split('.').pop() ?? '').toLowerCase();
      const mime = EXT_MIME[ext];
      if (!mime) return res.status(400).json({ error: 'File type not allowed. Use jpg, png, webp, or svg.' });

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blob = await put(
        `agencies/${agCtx.agencyId}/branding/${Date.now()}-${safeName}`,
        buffer, { access: 'public', contentType: mime }
      );

      const logoUrlVal     = field === 'logoUrl'     ? blob.url : null;
      const logoDarkUrlVal = field === 'logoDarkUrl' ? blob.url : null;

      // AgencyBranding: snake_case columns, no id column, ON CONFLICT on agency_id
      await pool.query(
        `INSERT INTO "AgencyBranding"
           ("agency_id", "logo_url", "logo_dark_url", "primary_color", "accent_color",
            "show_powered_by_hiddenatlas", "created_at", "updated_at")
         VALUES ($1, $2, $3, '#1B6B65', '#C9A96E', true, NOW(), NOW())
         ON CONFLICT ("agency_id") DO UPDATE SET
           "logo_url"     = CASE WHEN $2 IS NOT NULL THEN $2 ELSE "AgencyBranding"."logo_url" END,
           "logo_dark_url" = CASE WHEN $3 IS NOT NULL THEN $3 ELSE "AgencyBranding"."logo_dark_url" END,
           "updated_at"   = NOW()`,
        [agCtx.agencyId, logoUrlVal, logoDarkUrlVal]
      );
      return res.status(200).json({ url: blob.url });
    }

    // ════════════════════════════════════════════════════════════════════
    // CLIENTS actions (clients:*)
    // ════════════════════════════════════════════════════════════════════

    if (action && action.startsWith('clients:')) {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      if (req.method === 'GET' && action === 'clients:list') {
        const search = req.query.search?.trim() || '';
        const params = [agCtx.agencyId];
        let where = `WHERE ac."agency_id" = $1`;
        if (search) {
          params.push(`%${search}%`);
          where += ` AND (ac.name ILIKE $${params.length} OR ac.email ILIKE $${params.length})`;
        }
        // AgencyClient and AgencyTrip: snake_case → camelCase
        const { rows } = await pool.query(
          `SELECT
             ac.id,
             ac."agency_id"  AS "agencyId",
             ac.name, ac.email, ac.phone, ac.notes,
             ac."created_at" AS "createdAt",
             COUNT(at2.id)::int AS "tripCount"
           FROM "AgencyClient" ac
           LEFT JOIN "AgencyTrip" at2 ON at2."client_id" = ac.id
           ${where}
           GROUP BY ac.id
           ORDER BY ac.name ASC`,
          params
        );
        return res.status(200).json({ clients: rows });
      }

      if (req.method === 'GET' && action === 'clients:detail') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        const { rows: clientRows } = await pool.query(
          `SELECT
             id,
             "agency_id"   AS "agencyId",
             name, email, phone, notes,
             "created_at"  AS "createdAt",
             "updated_at"  AS "updatedAt"
           FROM "AgencyClient" WHERE id = $1 AND "agency_id" = $2 LIMIT 1`,
          [id, agCtx.agencyId]
        );
        if (!clientRows.length) return res.status(404).json({ error: 'Client not found' });

        const { rows: trips } = await pool.query(
          `SELECT
             id, name, destination,
             "start_date" AS "startDate",
             "end_date"   AS "endDate",
             status,
             "created_at" AS "createdAt"
           FROM "AgencyTrip"
           WHERE "client_id" = $1 AND "agency_id" = $2
           ORDER BY "created_at" DESC`,
          [id, agCtx.agencyId]
        );
        return res.status(200).json({ client: clientRows[0], trips });
      }

      if (req.method === 'POST' && action === 'clients:create') {
        if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const { name, email, phone, notes } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

        const { rows } = await pool.query(
          `INSERT INTO "AgencyClient"
             (id, "agency_id", name, email, phone, notes, "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING
             id, "agency_id" AS "agencyId", name, email, phone, notes,
             "created_at" AS "createdAt", "updated_at" AS "updatedAt"`,
          [agCtx.agencyId, name.trim(), email?.trim()||null, phone?.trim()||null, notes?.trim()||null, agCtx.clerkId]
        );
        return res.status(200).json(rows[0]);
      }

      if (req.method === 'POST' && action === 'clients:update') {
        if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        if (!id) return res.status(400).json({ error: 'id is required' });
        const { name, email, phone, notes } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

        const { rowCount } = await pool.query(
          `UPDATE "AgencyClient"
           SET name=$1, email=$2, phone=$3, notes=$4, "updated_at"=NOW()
           WHERE id=$5 AND "agency_id"=$6`,
          [name.trim(), email?.trim()||null, phone?.trim()||null, notes?.trim()||null, id, agCtx.agencyId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Client not found' });
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'clients:delete') {
        if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { rows: activeTrips } = await pool.query(
          `SELECT id FROM "AgencyTrip"
           WHERE "client_id" = $1 AND "agency_id" = $2
             AND status NOT IN ('archived','completed')
           LIMIT 1`,
          [id, agCtx.agencyId]
        );
        if (activeTrips.length) {
          return res.status(409).json({ error: 'Cannot delete client with active trips. Archive or complete them first.' });
        }

        const { rowCount } = await pool.query(
          `DELETE FROM "AgencyClient" WHERE id = $1 AND "agency_id" = $2`,
          [id, agCtx.agencyId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Client not found' });
        return res.status(200).json({ ok: true });
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // TEMPLATES actions (templates:*)
    // ════════════════════════════════════════════════════════════════════

    if (action && action.startsWith('templates:')) {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      if (req.method === 'GET' && action === 'templates:list') {
        const includeArchived = req.query.includeArchived === 'true';
        // AgencyTemplate: snake_case → camelCase. Trip table: camelCase unchanged.
        const { rows } = await pool.query(
          `SELECT
             at2.id,
             at2."agency_id"     AS "agencyId",
             at2.name,
             at2.description,
             at2.destination,
             at2."source_trip_id" AS "sourceTripId",
             at2.status,
             at2."created_at"    AS "createdAt",
             at2."updated_at"    AS "updatedAt",
             t.title             AS "tripTitle",
             t."durationDays"    AS "tripDurationDays"
           FROM "AgencyTemplate" at2
           LEFT JOIN "Trip" t ON t.id = at2."source_trip_id"
           WHERE at2."agency_id" = $1
             ${includeArchived ? '' : "AND at2.status = 'active'"}
           ORDER BY at2."updated_at" DESC`,
          [agCtx.agencyId]
        );
        return res.status(200).json({ templates: rows });
      }

      if (req.method === 'POST' && action === 'templates:create') {
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const { name, description, destination, sourceTripId } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Template name is required' });

        const { rows } = await pool.query(
          `INSERT INTO "AgencyTemplate"
             (id, "agency_id", name, description, destination, "source_trip_id", status,
              "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
           RETURNING
             id, "agency_id" AS "agencyId", name, description, destination,
             "source_trip_id" AS "sourceTripId", status,
             "created_at" AS "createdAt", "updated_at" AS "updatedAt"`,
          [agCtx.agencyId, name.trim(), description?.trim()||null, destination?.trim()||null, sourceTripId||null, agCtx.clerkId]
        );
        return res.status(200).json(rows[0]);
      }

      if (req.method === 'POST' && action === 'templates:update') {
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        if (!id) return res.status(400).json({ error: 'id is required' });
        const { name, description, destination } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });

        const { rowCount } = await pool.query(
          `UPDATE "AgencyTemplate"
           SET name=$1, description=$2, destination=$3, "updated_at"=NOW()
           WHERE id=$4 AND "agency_id"=$5`,
          [name.trim(), description?.trim()||null, destination?.trim()||null, id, agCtx.agencyId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Template not found' });
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'templates:archive') {
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { rowCount } = await pool.query(
          `UPDATE "AgencyTemplate"
           SET status='archived', "updated_at"=NOW()
           WHERE id=$1 AND "agency_id"=$2`,
          [id, agCtx.agencyId]
        );
        if (!rowCount) return res.status(404).json({ error: 'Template not found' });
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'templates:duplicate') {
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { rows: tplRows } = await pool.query(
          `SELECT
             id, name, description, destination,
             "source_trip_id" AS "sourceTripId"
           FROM "AgencyTemplate" WHERE id = $1 AND "agency_id" = $2 LIMIT 1`,
          [id, agCtx.agencyId]
        );
        if (!tplRows.length) return res.status(404).json({ error: 'Template not found' });
        const tpl = tplRows[0];

        let newTripId = null;
        if (tpl.sourceTripId) {
          newTripId = await duplicateTrip(pool, tpl.sourceTripId, {
            userId: agCtx.userId, title: `${tpl.name} (copy)`, tripType: 'personal', createdFrom: 'duplicate',
          });
        }

        const { rows: newTpl } = await pool.query(
          `INSERT INTO "AgencyTemplate"
             (id, "agency_id", name, description, destination, "source_trip_id", status,
              "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
           RETURNING id`,
          [agCtx.agencyId, `${tpl.name} (copy)`, tpl.description, tpl.destination, newTripId, agCtx.clerkId]
        );
        return res.status(200).json({ templateId: newTpl[0].id });
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // TRIPS actions (trips:*)
    // ════════════════════════════════════════════════════════════════════

    if (action && action.startsWith('trips:')) {
      // trips:resolve-share handled above as public

      // trips:preview-data: auth required; agencyId not available in the URL
      // because the preview route is /agency/trips/:agencyTripId/preview.
      if (req.method === 'GET' && action === 'trips:preview-data') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        let clerkId;
        try { clerkId = await verifyAuth(authHeader); }
        catch { return res.status(401).json({ error: 'Unauthorized' }); }

        // Verify the requesting user is an active member of the agency that owns this trip
        const { rows: atRows } = await pool.query(
          `SELECT
             at.id,
             at."agency_id"   AS "agencyId",
             at."trip_id"     AS "tripId",
             at."client_id"   AS "clientId",
             at.name, at.destination,
             at."start_date"  AS "startDate",
             at."end_date"    AS "endDate",
             at.status
           FROM "AgencyTrip" at
           JOIN "AgencyMember" m
             ON m."agency_id" = at."agency_id"
            AND m."clerk_user_id" = $1
            AND m.status = 'active'
           WHERE at.id = $2 LIMIT 1`,
          [clerkId, agencyTripId]
        );
        if (!atRows.length) return res.status(404).json({ error: 'Agency trip not found' });
        const agTrip = atRows[0];

        const { rows: agencyRows } = await pool.query(
          `SELECT id, name, slug FROM "Agency" WHERE id = $1`, [agTrip.agencyId]
        );
        if (!agencyRows.length) return res.status(404).json({ error: 'Agency not found' });
        return res.status(200).json(await buildPortalPayload(pool, agTrip, agencyRows[0]));
      }

      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });
      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      // Reusable: fetch one AgencyTrip with full camelCase aliases
      const getAgencyTrip = (atId) => fetchAgencyTrip(pool, atId, agCtx.agencyId);

      // ── GET actions ──────────────────────────────────────────────────

      if (req.method === 'GET' && action === 'trips:list') {
        let query = `
          SELECT
            at.id, at.name, at.destination,
            at."start_date"          AS "startDate",
            at."end_date"            AS "endDate",
            at.status,
            at."trip_id"             AS "tripId",
            at."client_id"           AS "clientId",
            at."assigned_member_id"  AS "assignedMemberId",
            at."template_id"         AS "templateId",
            at."created_at"          AS "createdAt",
            ac.name                  AS "clientName"
          FROM "AgencyTrip" at
          LEFT JOIN "AgencyClient" ac ON ac.id = at."client_id"
          WHERE at."agency_id" = $1`;
        const params = [agCtx.agencyId];
        const { status: statusFilter } = req.query;
        if (statusFilter) { params.push(statusFilter); query += ` AND at.status = $${params.length}`; }
        query += ` ORDER BY at."created_at" DESC`;
        const { rows } = await pool.query(query, params);
        return res.status(200).json({ trips: rows });
      }

      if (req.method === 'GET' && action === 'trips:detail') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });

        const { rows: atRows } = await pool.query(
          `SELECT
             at.id,
             at."agency_id"               AS "agencyId",
             at."trip_id"                 AS "tripId",
             at."client_id"               AS "clientId",
             at."assigned_member_id"      AS "assignedMemberId",
             at."template_id"             AS "templateId",
             at.name, at.destination,
             at."start_date"              AS "startDate",
             at."end_date"               AS "endDate",
             at.status,
             at."created_by_clerk_user_id" AS "createdByClerkUserId",
             at."share_enabled"           AS "shareEnabled",
             at."share_expires_at"        AS "shareExpiresAt",
             at."shared_at"              AS "sharedAt",
             at."created_at"             AS "createdAt",
             at."updated_at"             AS "updatedAt",
             ac.name                     AS "clientName",
             ac.email                    AS "clientEmail"
           FROM "AgencyTrip" at
           LEFT JOIN "AgencyClient" ac ON ac.id = at."client_id"
           WHERE at.id = $1 AND at."agency_id" = $2`,
          [agencyTripId, agCtx.agencyId]
        );
        if (!atRows.length) return res.status(404).json({ error: 'Agency trip not found' });
        const agTrip = atRows[0];

        const { rows: travellers } = await pool.query(
          `SELECT ${TRAVELLER_SELECT}
           FROM "AgencyTripTraveller"
           WHERE "agency_trip_id" = $1
           ORDER BY "sort_order" ASC`,
          [agencyTripId]
        );

        let tripInfo = null;
        if (agTrip.tripId) {
          const { rows: tripRows } = await pool.query(
            `SELECT id, title, destination, "startDate", "endDate", "pdfStatus", "pdfUrl"
             FROM "Trip" WHERE id = $1`,
            [agTrip.tripId]
          );
          tripInfo = tripRows[0] || null;
        }
        return res.status(200).json({ ...agTrip, travellers, trip: tripInfo });
      }

      if (req.method === 'GET' && action === 'trips:list-for-client') {
        const { clientId } = req.query;
        if (!clientId) return res.status(400).json({ error: 'clientId is required' });
        const { rows } = await pool.query(
          `SELECT
             at.id, at.name, at.destination,
             at."start_date" AS "startDate",
             at."end_date"   AS "endDate",
             at.status,
             at."trip_id"   AS "tripId",
             at."created_at" AS "createdAt"
           FROM "AgencyTrip" at
           WHERE at."agency_id" = $1 AND at."client_id" = $2
           ORDER BY at."created_at" DESC`,
          [agCtx.agencyId, clientId]
        );
        return res.status(200).json(rows);
      }

      if (req.method === 'GET' && action === 'trips:travellers') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { rows } = await pool.query(
          `SELECT ${TRAVELLER_SELECT}
           FROM "AgencyTripTraveller"
           WHERE "agency_trip_id" = $1
           ORDER BY "sort_order" ASC`,
          [agencyTripId]
        );
        return res.status(200).json(rows);
      }

      // ── POST actions ─────────────────────────────────────────────────

      if (req.method === 'POST' && action === 'trips:create') {
        if (!canManageTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const {
          name, clientId, destination, startDate, endDate,
          assignedMemberId, templateId, sourceAgencyTripId,
        } = req.body || {};

        if (clientId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyClient" WHERE id = $1 AND "agency_id" = $2`,
            [clientId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Client not found in this agency' });
        }
        if (assignedMemberId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyMember" WHERE id = $1 AND "agency_id" = $2 AND status = 'active'`,
            [assignedMemberId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Member not found in this agency' });
        }

        let newTripId, resolvedTemplateId = null;

        if (templateId) {
          // AgencyTemplate: source_trip_id (snake_case)
          const { rows: tmplRows } = await pool.query(
            `SELECT id, name, "source_trip_id" AS "sourceTripId"
             FROM "AgencyTemplate"
             WHERE id = $1 AND "agency_id" = $2 AND status = 'active'`,
            [templateId, agCtx.agencyId]
          );
          if (!tmplRows.length) return res.status(400).json({ error: 'Template not found' });
          if (!tmplRows[0].sourceTripId) return res.status(400).json({ error: 'Template has no source trip' });
          newTripId = await duplicateTrip(pool, tmplRows[0].sourceTripId, {
            userId: agCtx.userId, title: name?.trim() || tmplRows[0].name,
            tripType: 'personal', createdFrom: 'duplicate',
          });
          resolvedTemplateId = templateId;

        } else if (sourceAgencyTripId) {
          if (!name?.trim()) return res.status(400).json({ error: 'name is required when duplicating' });
          const { rows: srcRows } = await pool.query(
            `SELECT id, "trip_id" AS "tripId"
             FROM "AgencyTrip"
             WHERE id = $1 AND "agency_id" = $2`,
            [sourceAgencyTripId, agCtx.agencyId]
          );
          if (!srcRows.length || !srcRows[0].tripId) {
            return res.status(400).json({ error: 'Source agency trip not found or has no linked trip' });
          }
          newTripId = await duplicateTrip(pool, srcRows[0].tripId, {
            userId: agCtx.userId, title: name.trim(), tripType: 'personal', createdFrom: 'duplicate',
          });

        } else {
          if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
          const { durationDays, duration } = computeDuration(startDate, endDate);
          // Trip table: camelCase columns
          const { rows: created } = await pool.query(
            `INSERT INTO "Trip"
               (id, "userId", title, destination, country, duration, "durationDays",
                overview, highlights, hotels, experiences, source,
                "tripType", "createdFrom", "isEditable",
                "startDate", "endDate", "personalPdfConfig", "itinerarySnapshot", "pdfStatus",
                "createdAt", "updatedAt")
             VALUES
               (gen_random_uuid(), $1, $2, $3, '', $4, $5,
                '', '[]', '[]', '[]', 'MANUAL',
                'personal', 'manual', true,
                $6, $7, '{}', '{}', 'idle', NOW(), NOW())
             RETURNING id`,
            [agCtx.userId, name.trim(), destination||'', duration, durationDays, startDate||null, endDate||null]
          );
          newTripId = created[0].id;
          if (durationDays && durationDays > 0) {
            for (let i = 0; i < durationDays; i++) {
              await pool.query(
                `INSERT INTO "TripDay"
                   (id, "tripId", "dayNumber", title, description, "sortOrder", "isHidden", "resetToOriginal", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, '', $4, false, false, NOW())`,
                [newTripId, i + 1, `Day ${i + 1}`, i + 1]
              );
            }
          }
        }

        // AgencyTrip: snake_case columns
        const { rows: atInserted } = await pool.query(
          `INSERT INTO "AgencyTrip"
             (id, "agency_id", "trip_id", "client_id", "assigned_member_id", "template_id",
              name, destination, "start_date", "end_date", status,
              "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, NOW(), NOW())
           RETURNING id`,
          [
            agCtx.agencyId, newTripId,
            clientId||null, assignedMemberId||null, resolvedTemplateId,
            name?.trim()||'', destination||null, startDate||null, endDate||null,
            agCtx.clerkId,
          ]
        );
        return res.status(200).json({ agencyTripId: atInserted[0].id, tripId: newTripId });
      }

      if (req.method === 'POST' && action === 'trips:update-status') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canManageTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { status } = req.body || {};
        const VALID = ['draft','ready','shared','travelling','completed','archived'];
        if (!VALID.includes(status)) {
          return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
        }
        await pool.query(
          `UPDATE "AgencyTrip" SET status = $1, "updated_at" = NOW() WHERE id = $2`,
          [status, agencyTripId]
        );
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'trips:update-meta') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const body = req.body || {};
        const { name, clientId, destination, startDate, endDate, assignedMemberId } = body;

        if (clientId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyClient" WHERE id = $1 AND "agency_id" = $2`,
            [clientId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Client not found' });
        }

        const sets = [], params = [];
        const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
        // AgencyTrip uses snake_case column names
        if ('name' in body)             add('name',                 name?.trim()||null);
        if ('clientId' in body)         add('"client_id"',          clientId||null);
        if ('destination' in body)      add('destination',          destination||null);
        if ('startDate' in body)        add('"start_date"',         startDate||null);
        if ('endDate' in body)          add('"end_date"',           endDate||null);
        if ('assignedMemberId' in body) add('"assigned_member_id"', assignedMemberId||null);
        if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
        sets.push(`"updated_at" = NOW()`);
        params.push(agencyTripId);
        await pool.query(
          `UPDATE "AgencyTrip" SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'trips:save-as-template') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip || !agTrip.tripId) return res.status(400).json({ error: 'Agency trip has no linked trip' });

        const { templateName, description } = req.body || {};
        if (!templateName?.trim()) return res.status(400).json({ error: 'templateName is required' });

        const newTripId = await duplicateTrip(pool, agTrip.tripId, {
          userId: agCtx.userId, title: templateName.trim(), tripType: 'personal', createdFrom: 'manual',
        });

        const { rows } = await pool.query(
          `INSERT INTO "AgencyTemplate"
             (id, "agency_id", name, description, destination, "source_trip_id", status,
              "created_by_clerk_user_id", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
           RETURNING id`,
          [agCtx.agencyId, templateName.trim(), description||null, agTrip.destination||null, newTripId, agCtx.clerkId]
        );
        return res.status(200).json({ templateId: rows[0].id });
      }

      if (req.method === 'POST' && action === 'trips:generate-share') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        if (agTrip.shareEnabled && agTrip.shareTokenHash) {
          return res.status(200).json({ shareEnabled: true, alreadyShared: true });
        }
        const { token, hash } = generateShareToken();
        await pool.query(
          `UPDATE "AgencyTrip"
           SET "share_token_hash" = $1, "share_enabled" = true, "shared_at" = NOW(), "updated_at" = NOW()
           WHERE id = $2`,
          [hash, agencyTripId]
        );
        return res.status(200).json({ shareUrl: '/travel/' + token, shareEnabled: true });
      }

      if (req.method === 'POST' && action === 'trips:regenerate-share') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { token, hash } = generateShareToken();
        await pool.query(
          `UPDATE "AgencyTrip"
           SET "share_token_hash" = $1, "share_enabled" = true, "shared_at" = NOW(), "updated_at" = NOW()
           WHERE id = $2`,
          [hash, agencyTripId]
        );
        return res.status(200).json({ shareUrl: '/travel/' + token });
      }

      if (req.method === 'POST' && action === 'trips:toggle-share') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { shareEnabled } = req.body || {};
        if (typeof shareEnabled !== 'boolean') {
          return res.status(400).json({ error: 'shareEnabled must be a boolean' });
        }
        await pool.query(
          `UPDATE "AgencyTrip" SET "share_enabled" = $1, "updated_at" = NOW() WHERE id = $2`,
          [shareEnabled, agencyTripId]
        );
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'trips:add-traveller') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { name, email, type } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
        const travellerType = ['adult', 'child'].includes(type) ? type : 'adult';

        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM "AgencyTripTraveller" WHERE "agency_trip_id" = $1`,
          [agencyTripId]
        );
        const { rows: inserted } = await pool.query(
          `INSERT INTO "AgencyTripTraveller"
             (id, "agency_trip_id", name, email, "traveller_type", "sort_order", "created_at", "updated_at")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING ${TRAVELLER_SELECT}`,
          [agencyTripId, name.trim(), email?.trim()||null, travellerType, (countRows[0].cnt||0)+1]
        );
        return res.status(200).json(inserted[0]);
      }

      if (req.method === 'POST' && action === 'trips:update-traveller') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { travellerId, name, email, type } = req.body || {};
        if (!travellerId) return res.status(400).json({ error: 'travellerId is required' });

        const { rows: tvRows } = await pool.query(
          `SELECT id FROM "AgencyTripTraveller" WHERE id = $1 AND "agency_trip_id" = $2`,
          [travellerId, agencyTripId]
        );
        if (!tvRows.length) return res.status(404).json({ error: 'Traveller not found' });

        const resolvedType = ['adult', 'child'].includes(type) ? type : null;
        await pool.query(
          `UPDATE "AgencyTripTraveller"
           SET name = COALESCE($1, name),
               email = COALESCE($2, email),
               "traveller_type" = COALESCE($3, "traveller_type"),
               "updated_at" = NOW()
           WHERE id = $4`,
          [name?.trim()||null, email?.trim()||null, resolvedType, travellerId]
        );
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'trips:remove-traveller') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { travellerId } = req.body || {};
        if (!travellerId) return res.status(400).json({ error: 'travellerId is required' });

        const { rows: tvRows } = await pool.query(
          `SELECT id FROM "AgencyTripTraveller" WHERE id = $1 AND "agency_trip_id" = $2`,
          [travellerId, agencyTripId]
        );
        if (!tvRows.length) return res.status(404).json({ error: 'Traveller not found' });

        await pool.query(`DELETE FROM "AgencyTripTraveller" WHERE id = $1`, [travellerId]);
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'POST' && action === 'trips:reorder-travellers') {
        if (!agencyTripId) return res.status(400).json({ error: 'agencyTripId is required' });
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(agencyTripId);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { order } = req.body || {};
        if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

        for (const item of order) {
          if (!item.id || item.sortOrder == null) continue;
          await pool.query(
            `UPDATE "AgencyTripTraveller"
             SET "sort_order" = $1, "updated_at" = NOW()
             WHERE id = $2 AND "agency_trip_id" = $3`,
            [item.sortOrder, item.id, agencyTripId]
          );
        }
        return res.status(200).json({ ok: true });
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // ADMIN actions (admin:*) — requires HiddenAtlas global admin role
    // ════════════════════════════════════════════════════════════════════

    if (action && action.startsWith('admin:')) {
      const adminUserId = await checkIsGlobalAdmin(authHeader, pool);
      if (!adminUserId) return res.status(403).json({ error: 'Forbidden: requires global HiddenAtlas admin' });

      // GET admin:list-agencies — all agencies with aggregated stats
      if (req.method === 'GET' && action === 'admin:list-agencies') {
        const { rows } = await pool.query(
          `SELECT
             a.id, a.name, a.slug, a.status,
             a."created_at"                                                              AS "createdAt",
             COUNT(DISTINCT m.id)::int                                                   AS "memberCount",
             COUNT(DISTINCT ac.id)::int                                                  AS "clientCount",
             COUNT(DISTINCT at2.id)::int                                                 AS "tripCount",
             COUNT(DISTINCT at2.id) FILTER (WHERE at2.status NOT IN ('archived','completed'))::int AS "activeTripCount"
           FROM "Agency" a
           LEFT JOIN "AgencyMember" m  ON m."agency_id" = a.id
           LEFT JOIN "AgencyClient" ac ON ac."agency_id" = a.id
           LEFT JOIN "AgencyTrip"  at2 ON at2."agency_id" = a.id
           GROUP BY a.id
           ORDER BY a."created_at" DESC`
        );
        return res.status(200).json({ agencies: rows });
      }

      // GET admin:get-agency — full detail for one agency
      if (req.method === 'GET' && action === 'admin:get-agency') {
        const { agencyId: targetAgencyId } = req.query;
        if (!targetAgencyId) return res.status(400).json({ error: 'agencyId is required' });

        const [agencyRes, metricsRes, membersRes, tripsRes] = await Promise.all([
          pool.query(
            `SELECT id, name, slug, status,
                    "created_at" AS "createdAt",
                    "updated_at" AS "updatedAt"
             FROM "Agency" WHERE id = $1`,
            [targetAgencyId]
          ),
          pool.query(
            `SELECT
               COUNT(DISTINCT m.id)::int                                                    AS "memberCount",
               COUNT(DISTINCT ac.id)::int                                                   AS "clientCount",
               COUNT(DISTINCT at2.id)::int                                                  AS "tripCount",
               COUNT(DISTINCT at2.id) FILTER (WHERE at2.status NOT IN ('archived','completed'))::int AS "activeTripCount",
               COUNT(DISTINCT at2.id) FILTER (WHERE at2."start_date" >= NOW() AND at2.status IN ('draft','ready','shared'))::int AS "upcomingTripCount"
             FROM "Agency" a
             LEFT JOIN "AgencyMember" m  ON m."agency_id"  = a.id
             LEFT JOIN "AgencyClient" ac ON ac."agency_id" = a.id
             LEFT JOIN "AgencyTrip"  at2 ON at2."agency_id" = a.id
             WHERE a.id = $1`,
            [targetAgencyId]
          ),
          // AgencyMember: snake_case → camelCase. Join User via clerkId.
          pool.query(
            `SELECT
               m.id, m.role, m.status,
               m."display_name" AS "displayName",
               m.email
             FROM "AgencyMember" m
             WHERE m."agency_id" = $1
             ORDER BY m."created_at" ASC`,
            [targetAgencyId]
          ),
          // AgencyTrip + AgencyClient: snake_case → camelCase
          pool.query(
            `SELECT
               at2.id, at2.name, at2.destination,
               at2."start_date" AS "startDate",
               at2."end_date"   AS "endDate",
               at2.status,
               at2."created_at" AS "createdAt",
               ac.name          AS "clientName"
             FROM "AgencyTrip" at2
             LEFT JOIN "AgencyClient" ac ON ac.id = at2."client_id"
             WHERE at2."agency_id" = $1
             ORDER BY at2."created_at" DESC LIMIT 10`,
            [targetAgencyId]
          ),
        ]);

        if (!agencyRes.rows.length) return res.status(404).json({ error: 'Agency not found' });

        return res.status(200).json({
          agency:      agencyRes.rows[0],
          metrics:     metricsRes.rows[0],
          members:     membersRes.rows,
          recentTrips: tripsRes.rows,
        });
      }

      // GET admin:search-users — find HiddenAtlas users by email for owner assignment
      if (req.method === 'GET' && action === 'admin:search-users') {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) return res.status(200).json({ users: [] });
        // User table: camelCase columns
        const { rows } = await pool.query(
          `SELECT id, name, email, role, "clerkId"
           FROM "User"
           WHERE email ILIKE $1 OR name ILIKE $1
           ORDER BY email ASC LIMIT 10`,
          [`%${q}%`]
        );
        return res.status(200).json({ users: rows });
      }

      // POST admin:create-agency — create Agency + AgencyBranding + AgencyMember
      if (req.method === 'POST' && action === 'admin:create-agency') {
        const { name, slug, ownerUserId } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
        if (!slug?.trim() || !/^[a-z0-9-]{3,50}$/.test(slug)) {
          return res.status(400).json({ error: 'slug must be 3-50 lowercase chars, numbers, hyphens' });
        }
        if (!ownerUserId) return res.status(400).json({ error: 'ownerUserId is required' });

        const { rows: slugRows } = await pool.query(
          `SELECT id FROM "Agency" WHERE slug = $1 LIMIT 1`, [slug.trim()]
        );
        if (slugRows.length) return res.status(409).json({ error: 'Slug is already taken' });

        // User table: camelCase
        const { rows: ownerRows } = await pool.query(
          `SELECT id, "clerkId", name, email FROM "User" WHERE id = $1 LIMIT 1`, [ownerUserId]
        );
        if (!ownerRows.length) return res.status(404).json({ error: 'Owner user not found' });
        const owner = ownerRows[0];

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Agency: snake_case columns
          const { rows: agRows } = await client.query(
            `INSERT INTO "Agency" (id, name, slug, status, "created_at", "updated_at")
             VALUES (gen_random_uuid(), $1, $2, 'active', NOW(), NOW())
             RETURNING id, name, slug`,
            [name.trim(), slug.trim()]
          );
          const newAgencyId = agRows[0].id;

          // AgencyBranding: snake_case, no id column
          await client.query(
            `INSERT INTO "AgencyBranding"
               ("agency_id", "primary_color", "accent_color", "show_powered_by_hiddenatlas",
                "created_at", "updated_at")
             VALUES ($1, '#1B6B65', '#C9A96E', true, NOW(), NOW())`,
            [newAgencyId]
          );

          // AgencyMember: snake_case, no user_id
          await client.query(
            `INSERT INTO "AgencyMember"
               (id, "agency_id", "clerk_user_id", email, "display_name", role, status,
                "created_at", "updated_at")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'owner', 'active', NOW(), NOW())`,
            [newAgencyId, owner.clerkId, owner.email, owner.name]
          );

          await client.query('COMMIT');
          return res.status(201).json({
            agencyId: newAgencyId, name: agRows[0].name, slug: agRows[0].slug,
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      // POST admin:update-agency — update name, slug, status
      if (req.method === 'POST' && action === 'admin:update-agency') {
        const { agencyId: targetAgencyId, name, slug, status } = req.body || {};
        if (!targetAgencyId) return res.status(400).json({ error: 'agencyId is required' });

        const { rows: existing } = await pool.query(
          `SELECT id FROM "Agency" WHERE id = $1 LIMIT 1`, [targetAgencyId]
        );
        if (!existing.length) return res.status(404).json({ error: 'Agency not found' });

        if (slug) {
          if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
            return res.status(400).json({ error: 'Invalid slug format' });
          }
          const { rows: slugRows } = await pool.query(
            `SELECT id FROM "Agency" WHERE slug = $1 AND id != $2 LIMIT 1`, [slug, targetAgencyId]
          );
          if (slugRows.length) return res.status(409).json({ error: 'Slug is already taken' });
        }

        const VALID_STATUSES = new Set(['active', 'disabled', 'archived']);
        if (status && !VALID_STATUSES.has(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }

        const sets = [], params = [];
        const add = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
        if (name)   add('name',   name.trim());
        if (slug)   add('slug',   slug.trim());
        if (status) add('status', status);
        if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
        sets.push(`"updated_at" = NOW()`);
        params.push(targetAgencyId);
        await pool.query(
          `UPDATE "Agency" SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });

  } finally {
    try { await pool.end(); } catch (_e) { /* ignore */ } // eslint-disable-line no-unused-vars
  }
}
