import pg from 'pg';
import { put } from '@vercel/blob';
import { verifyAuth } from './_lib/verifyAuth.js';
import {
  resolveAgencyCtx,
  resolveAllAgencyMemberships,
  canManageAgency,
  canManageBranding,
  canManageTeam,
} from './_lib/agencyAuth.js';

const { Pool } = pg;

const HEX_COLOR_RE   = /^#[0-9A-Fa-f]{6}$/;
const SLUG_RE        = /^[a-z0-9-]{3,50}$/;
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_MIME = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  svg:  'image/svg+xml',
};

// ── Exported handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[api/agency] TOP-LEVEL UNHANDLED:', err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

async function _handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({
    connectionString:        process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis:       5000,
    max: 3,
  });
  pool.on('error', (err) => {
    console.error('[api/agency] idle pool client error (non-fatal):', err.message);
  });

  const { action, agencyId } = req.query;
  const authHeader = req.headers.authorization;

  try {
    // ── GET /api/agency?action=memberships ────────────────────────────────────
    if (req.method === 'GET' && action === 'memberships') {
      const memberships = await resolveAllAgencyMemberships(authHeader, pool);
      return res.status(200).json({ memberships });
    }

    // ── GET /api/agency?agencyId=&action=dashboard ────────────────────────────
    if (req.method === 'GET' && action === 'dashboard') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      const [tripCountsRes, clientCountRes, recentTripsRes] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status NOT IN ('archived', 'completed'))                        AS "activeTripCount",
             COUNT(*) FILTER (WHERE "startDate" >= NOW() AND status IN ('draft', 'ready', 'shared')) AS "upcomingTripCount",
             COUNT(*) FILTER (WHERE status = 'travelling')                                           AS "travellingCount"
           FROM "AgencyTrip"
           WHERE "agencyId" = $1`,
          [agCtx.agencyId]
        ),
        pool.query(
          `SELECT COUNT(*) AS "clientCount"
           FROM "AgencyClient"
           WHERE "agencyId" = $1`,
          [agCtx.agencyId]
        ),
        pool.query(
          `SELECT t.id, t.name, t.destination, t."startDate", t."endDate", t.status,
                  t."clientId", c.name AS "clientName", t."assignedMemberId"
           FROM "AgencyTrip" t
           LEFT JOIN "AgencyClient" c ON c.id = t."clientId"
           WHERE t."agencyId" = $1
           ORDER BY t."createdAt" DESC
           LIMIT 10`,
          [agCtx.agencyId]
        ),
      ]);

      const tc = tripCountsRes.rows[0];
      return res.status(200).json({
        activeTripCount:   parseInt(tc.activeTripCount,   10),
        upcomingTripCount: parseInt(tc.upcomingTripCount, 10),
        travellingCount:   parseInt(tc.travellingCount,   10),
        clientCount:       parseInt(clientCountRes.rows[0].clientCount, 10),
        recentTrips:       recentTripsRes.rows,
      });
    }

    // ── GET /api/agency?agencyId=&action=branding ─────────────────────────────
    if (req.method === 'GET' && action === 'branding') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      const { rows } = await pool.query(
        `SELECT b.*, a.name AS "agencyName"
         FROM "Agency" a
         LEFT JOIN "AgencyBranding" b ON b."agencyId" = a.id
         WHERE a.id = $1`,
        [agCtx.agencyId]
      );

      if (!rows.length) return res.status(404).json({ error: 'Agency not found' });

      const row        = rows[0];
      const agencyName = row.agencyName;

      // If no branding row exists yet, return defaults
      const branding = row.id
        ? row
        : {
            agencyId:                 agCtx.agencyId,
            logoUrl:                  null,
            logoDarkUrl:              null,
            primaryColor:             '#1B6B65',
            accentColor:              '#C9A96E',
            website:                  null,
            supportEmail:             null,
            phone:                    null,
            whatsapp:                 null,
            showPoweredByHiddenatlas: true,
          };

      return res.status(200).json({ branding, agencyName });
    }

    // ── GET /api/agency?agencyId=&action=team ─────────────────────────────────
    if (req.method === 'GET' && action === 'team') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

      const { rows } = await pool.query(
        `SELECT m.id, m."agencyId", m."clerkUserId", m."userId", m.role, m.status,
                m."invitedAt", m."acceptedAt",
                u.name AS name, u.email AS email
         FROM "AgencyMember" m
         LEFT JOIN "User" u ON u.id = m."userId"
         WHERE m."agencyId" = $1
         ORDER BY m."createdAt" ASC`,
        [agCtx.agencyId]
      );

      return res.status(200).json({ members: rows });
    }

    // ── POST /api/agency?action=onboard ───────────────────────────────────────
    if (req.method === 'POST' && action === 'onboard') {
      let clerkId;
      try {
        clerkId = await verifyAuth(authHeader);
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { name, slug } = req.body ?? {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }
      if (!slug || typeof slug !== 'string') {
        return res.status(400).json({ error: 'slug is required' });
      }
      if (!SLUG_RE.test(slug)) {
        return res.status(400).json({
          error: 'slug must be 3 to 50 characters: lowercase letters, numbers, and hyphens only',
        });
      }

      // Look up User.id from clerkId
      const { rows: userRows } = await pool.query(
        `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`,
        [clerkId]
      );
      if (!userRows.length) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userId = userRows[0].id;

      // Check slug uniqueness
      const { rows: slugRows } = await pool.query(
        `SELECT id FROM "Agency" WHERE slug = $1 LIMIT 1`,
        [slug.trim()]
      );
      if (slugRows.length) {
        return res.status(409).json({ error: 'slug is already taken' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const { rows: agencyRows } = await client.query(
          `INSERT INTO "Agency" (id, name, slug, status, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, 'active', NOW(), NOW())
           RETURNING id`,
          [name.trim(), slug.trim()]
        );
        const newAgencyId = agencyRows[0].id;

        await client.query(
          `INSERT INTO "AgencyBranding" (id, "agencyId", "primaryColor", "accentColor",
                                         "showPoweredByHiddenatlas", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, '#1B6B65', '#C9A96E', true, NOW(), NOW())`,
          [newAgencyId]
        );

        const { rows: memberRows } = await client.query(
          `INSERT INTO "AgencyMember" (id, "agencyId", "clerkUserId", "userId", role, status,
                                       "invitedAt", "acceptedAt", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, 'owner', 'active', NOW(), NOW(), NOW(), NOW())
           RETURNING id`,
          [newAgencyId, clerkId, userId]
        );
        const memberId = memberRows[0].id;

        await client.query('COMMIT');
        return res.status(201).json({ agencyId: newAgencyId, memberId });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // ── POST /api/agency?agencyId=&action=update-branding ────────────────────
    if (req.method === 'POST' && action === 'update-branding') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageBranding(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const {
        logoUrl, logoDarkUrl, primaryColor, accentColor,
        website, supportEmail, phone, whatsapp, showPoweredByHiddenatlas,
      } = req.body ?? {};

      if (primaryColor !== undefined && (typeof primaryColor !== 'string' || !HEX_COLOR_RE.test(primaryColor))) {
        return res.status(400).json({ error: 'primaryColor must be a valid hex color (e.g. #1B6B65)' });
      }
      if (accentColor !== undefined && (typeof accentColor !== 'string' || !HEX_COLOR_RE.test(accentColor))) {
        return res.status(400).json({ error: 'accentColor must be a valid hex color (e.g. #C9A96E)' });
      }

      // UPSERT: on conflict preserve existing values for fields not supplied (NULL in EXCLUDED).
      // showPoweredByHiddenatlas uses COALESCE too — false is not NULL so it propagates correctly.
      const { rows } = await pool.query(
        `INSERT INTO "AgencyBranding" (id, "agencyId", "logoUrl", "logoDarkUrl",
                                       "primaryColor", "accentColor", website, "supportEmail",
                                       phone, whatsapp, "showPoweredByHiddenatlas",
                                       "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3,
                 COALESCE($4, '#1B6B65'), COALESCE($5, '#C9A96E'), $6, $7,
                 $8, $9, COALESCE($10, true),
                 NOW(), NOW())
         ON CONFLICT ("agencyId") DO UPDATE SET
           "logoUrl"                  = COALESCE(EXCLUDED."logoUrl",                  "AgencyBranding"."logoUrl"),
           "logoDarkUrl"              = COALESCE(EXCLUDED."logoDarkUrl",              "AgencyBranding"."logoDarkUrl"),
           "primaryColor"             = COALESCE(EXCLUDED."primaryColor",             "AgencyBranding"."primaryColor"),
           "accentColor"              = COALESCE(EXCLUDED."accentColor",              "AgencyBranding"."accentColor"),
           website                    = COALESCE(EXCLUDED.website,                    "AgencyBranding".website),
           "supportEmail"             = COALESCE(EXCLUDED."supportEmail",             "AgencyBranding"."supportEmail"),
           phone                      = COALESCE(EXCLUDED.phone,                      "AgencyBranding".phone),
           whatsapp                   = COALESCE(EXCLUDED.whatsapp,                   "AgencyBranding".whatsapp),
           "showPoweredByHiddenatlas" = COALESCE(EXCLUDED."showPoweredByHiddenatlas", "AgencyBranding"."showPoweredByHiddenatlas"),
           "updatedAt"                = NOW()
         RETURNING *`,
        [
          agCtx.agencyId,
          logoUrl          ?? null,
          logoDarkUrl      ?? null,
          primaryColor     ?? null,
          accentColor      ?? null,
          website          ?? null,
          supportEmail     ?? null,
          phone            ?? null,
          whatsapp         ?? null,
          showPoweredByHiddenatlas ?? null,
        ]
      );

      return res.status(200).json({ branding: rows[0] });
    }

    // ── POST /api/agency?agencyId=&action=update-agency-name ─────────────────
    if (req.method === 'POST' && action === 'update-agency-name') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageAgency(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { name } = req.body ?? {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name is required' });
      }

      await pool.query(
        `UPDATE "Agency" SET name = $1, "updatedAt" = NOW() WHERE id = $2`,
        [name.trim(), agCtx.agencyId]
      );

      return res.status(200).json({ name: name.trim() });
    }

    // ── POST /api/agency?agencyId=&action=invite-member ──────────────────────
    if (req.method === 'POST' && action === 'invite-member') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageTeam(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { email, role } = req.body ?? {};
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ error: 'email is required' });
      }
      const VALID_INVITE_ROLES = new Set(['admin', 'agent', 'editor']);
      if (!role || !VALID_INVITE_ROLES.has(role)) {
        return res.status(400).json({ error: 'role must be one of: admin, agent, editor' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Look up User by email
      const { rows: userRows } = await pool.query(
        `SELECT id, "clerkId" FROM "User" WHERE email = $1 LIMIT 1`,
        [normalizedEmail]
      );
      const existingUser = userRows[0] ?? null;

      let inviteUserId  = null;
      let inviteClerkId = `pending:${normalizedEmail}`;
      let memberStatus  = 'invited';
      let acceptedAt    = null;

      if (existingUser) {
        inviteUserId  = existingUser.id;
        inviteClerkId = existingUser.clerkId ?? `pending:${normalizedEmail}`;
        memberStatus  = 'active';
        acceptedAt    = new Date();

        // Ensure not already a member
        const { rows: existingMemberRows } = await pool.query(
          `SELECT id FROM "AgencyMember" WHERE "agencyId" = $1 AND "userId" = $2 LIMIT 1`,
          [agCtx.agencyId, existingUser.id]
        );
        if (existingMemberRows.length) {
          return res.status(409).json({ error: 'User is already a member of this agency' });
        }
      }

      const { rows: memberRows } = await pool.query(
        `INSERT INTO "AgencyMember" (id, "agencyId", "clerkUserId", "userId", role, status,
                                     "invitedByClerkUserId", "invitedAt", "acceptedAt",
                                     "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), $7, NOW(), NOW())
         RETURNING id, status`,
        [agCtx.agencyId, inviteClerkId, inviteUserId, role, memberStatus, agCtx.clerkId, acceptedAt]
      );

      return res.status(201).json({ memberId: memberRows[0].id, status: memberRows[0].status });
    }

    // ── POST /api/agency?agencyId=&action=update-member ──────────────────────
    if (req.method === 'POST' && action === 'update-member') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageTeam(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { memberId, role, status } = req.body ?? {};
      if (!memberId) return res.status(400).json({ error: 'memberId is required' });

      // Fetch target member — scoped to this agency
      const { rows: targetRows } = await pool.query(
        `SELECT id, role, status FROM "AgencyMember" WHERE id = $1 AND "agencyId" = $2 LIMIT 1`,
        [memberId, agCtx.agencyId]
      );
      if (!targetRows.length) return res.status(404).json({ error: 'Member not found' });

      const target = targetRows[0];

      // Protect owner
      if (target.role === 'owner') {
        return res.status(403).json({ error: 'Cannot modify the agency owner' });
      }

      if (role !== undefined) {
        const VALID_ROLES = new Set(['admin', 'agent', 'editor']);
        if (!VALID_ROLES.has(role)) {
          return res.status(400).json({ error: 'role must be one of: admin, agent, editor' });
        }
        await pool.query(
          `UPDATE "AgencyMember" SET role = $1, "updatedAt" = NOW() WHERE id = $2`,
          [role, memberId]
        );
      }

      if (status === 'disabled') {
        await pool.query(
          `UPDATE "AgencyMember"
           SET status = 'disabled', "disabledAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $1`,
          [memberId]
        );
      }

      return res.status(200).json({ ok: true });
    }

    // ── POST /api/agency?agencyId=&action=branding-logo-upload ───────────────
    if (req.method === 'POST' && action === 'branding-logo-upload') {
      if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

      const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId);
      if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
      if (!canManageBranding(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

      const { base64Data, filename, field } = req.body ?? {};

      if (!base64Data || typeof base64Data !== 'string') {
        return res.status(400).json({ error: 'base64Data is required' });
      }
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'filename is required' });
      }
      if (!['logoUrl', 'logoDarkUrl'].includes(field)) {
        return res.status(400).json({ error: 'field must be logoUrl or logoDarkUrl' });
      }

      // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
      const rawBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer    = Buffer.from(rawBase64, 'base64');

      if (buffer.byteLength > MAX_LOGO_BYTES) {
        return res.status(400).json({ error: 'File exceeds the 5 MB limit' });
      }

      // Determine MIME type from file extension
      const ext  = (filename.split('.').pop() ?? '').toLowerCase();
      const mime = EXT_MIME[ext];
      if (!mime) {
        return res.status(400).json({ error: 'File type not allowed. Use jpg, png, webp, or svg.' });
      }

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blobPath = `agencies/${agCtx.agencyId}/branding/${Date.now()}-${safeName}`;

      const blob = await put(blobPath, buffer, {
        access:      'public',
        contentType: mime,
      });

      // UPSERT branding row — update only the targeted logo field, preserve the other
      const logoUrlVal     = field === 'logoUrl'     ? blob.url : null;
      const logoDarkUrlVal = field === 'logoDarkUrl' ? blob.url : null;

      await pool.query(
        `INSERT INTO "AgencyBranding" (id, "agencyId", "logoUrl", "logoDarkUrl",
                                       "primaryColor", "accentColor", "showPoweredByHiddenatlas",
                                       "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, '#1B6B65', '#C9A96E', true, NOW(), NOW())
         ON CONFLICT ("agencyId") DO UPDATE SET
           "logoUrl"     = CASE WHEN $2 IS NOT NULL THEN $2 ELSE "AgencyBranding"."logoUrl"     END,
           "logoDarkUrl" = CASE WHEN $3 IS NOT NULL THEN $3 ELSE "AgencyBranding"."logoDarkUrl" END,
           "updatedAt"   = NOW()`,
        [agCtx.agencyId, logoUrlVal, logoDarkUrlVal]
      );

      return res.status(200).json({ url: blob.url });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } finally {
    try { await pool.end(); } catch {}
  }
}
