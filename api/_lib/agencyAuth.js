// ── agencyAuth.js ─────────────────────────────────────────────────────────────
// Multi-tenant agency authorization helpers.
//
// SECURITY RULES (enforced here, never trust frontend):
//   1. Authenticate the Clerk JWT → clerkId
//   2. Look up User row → userId + role   (User table: camelCase columns)
//   3a. Global HiddenAtlas admin (User.role='admin'): may access any active Agency.
//       Returns synthetic ctx with isGlobalAdmin=true, role='owner'.
//       No AgencyMember row is created or required.
//   3b. Normal user: must have an active AgencyMember row in the requested Agency.
//       AgencyMember uses snake_case columns — always alias to camelCase.
//   4. Only return after all checks pass.
//
// Agency table columns are snake_case; existing HiddenAtlas tables (User, Trip…)
// remain camelCase.  SQL below aliases snake_case → camelCase at the boundary.

import { verifyAuth } from './verifyAuth.js';

// ── Role permission matrix ────────────────────────────────────────────────────

/** Can manage agency settings, billing, ownership. */
export function canManageAgency(role) {
  return role === 'owner';
}

/** Can manage team members (invite, change role, disable). */
export function canManageTeam(role) {
  return role === 'owner' || role === 'admin';
}

/** Can manage agency branding. */
export function canManageBranding(role) {
  return role === 'owner' || role === 'admin';
}

/** Can create/edit/archive clients. */
export function canManageClients(role) {
  return role === 'owner' || role === 'admin' || role === 'agent';
}

/** Can create/edit/archive trips. */
export function canManageTrips(role) {
  return role === 'owner' || role === 'admin' || role === 'agent';
}

/** Can edit assigned trips (editor-level access). */
export function canEditTrips(role) {
  return role === 'owner' || role === 'admin' || role === 'agent' || role === 'editor';
}

/** Can create/edit/archive templates. */
export function canManageTemplates(role) {
  return role === 'owner' || role === 'admin' || role === 'agent';
}

/** Can share trips (generate/revoke share links). */
export function canShareTrips(role) {
  return role === 'owner' || role === 'admin' || role === 'agent';
}

// ── Internal: resolve Clerk JWT → { clerkId, userId, userRole } ───────────────
// Reads from "User" table which has camelCase columns.

async function resolveUserBase(authHeader, pool) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
  } catch {
    return null;
  }
  try {
    // "User" table has camelCase columns: "clerkId", "id", "role"
    const { rows } = await pool.query(
      `SELECT id, role FROM "User" WHERE "clerkId" = $1 LIMIT 1`,
      [clerkId]
    );
    if (!rows.length) return null;
    return { clerkId, userId: rows[0].id, userRole: rows[0].role };
  } catch (err) {
    console.error('[agencyAuth] resolveUserBase DB error:', err.message);
    throw err;
  }
}

// ── Agency context resolution ─────────────────────────────────────────────────

/**
 * @typedef {Object} AgencyCtx
 * @property {string}      clerkId        — Clerk user_xxx ID
 * @property {string}      userId         — HiddenAtlas User.id
 * @property {string|null} memberId       — AgencyMember.id (null for global admin override)
 * @property {string}      agencyId       — Agency.id
 * @property {string}      role           — owner | admin | agent | editor
 * @property {string}      status         — active
 * @property {string}      agencyName     — Agency.name
 * @property {string}      agencyStatus   — Agency.status
 * @property {boolean}     isGlobalAdmin  — true when accessed via HiddenAtlas global admin override
 */

/**
 * Resolves agency membership for the authenticated user.
 *
 * Global HiddenAtlas admin (User.role='admin') bypass:
 *   - May access any active Agency by specifying agencyId.
 *   - Returns a synthetic ctx with isGlobalAdmin=true and role='owner'.
 *   - No AgencyMember row is required or created.
 *
 * Normal users:
 *   - Must have an active AgencyMember row.
 *   - Membership is resolved via AgencyMember.clerk_user_id = clerkId.
 *   - If agencyId is provided, validates membership in THAT agency specifically.
 *   - If agencyId is null, returns the first active membership found.
 *
 * AgencyMember snake_case columns are aliased to camelCase in all queries.
 *
 * @returns {Promise<AgencyCtx|null>}  null → unauthenticated or no access
 */
export async function resolveAgencyCtx(authHeader, pool, agencyId = null) {
  let base;
  try {
    base = await resolveUserBase(authHeader, pool);
  } catch {
    return null;
  }
  if (!base) return null;
  const { clerkId, userId, userRole } = base;

  try {
    // ── Global admin bypass ───────────────────────────────────────────────────
    if (userRole === 'admin') {
      if (!agencyId) return null;

      const { rows: agencyRows } = await pool.query(
        `SELECT id, name, status FROM "Agency" WHERE id = $1 LIMIT 1`,
        [agencyId]
      );
      if (!agencyRows.length) return null;

      const agency = agencyRows[0];
      return {
        clerkId,
        userId,
        memberId:     null,
        agencyId:     agency.id,
        role:         'owner',
        status:       'active',
        agencyName:   agency.name,
        agencyStatus: agency.status,
        isGlobalAdmin: true,
      };
    }

    // ── Normal user: require active AgencyMember ──────────────────────────────
    // AgencyMember columns: agency_id, clerk_user_id (snake_case) — aliased below.
    // Membership is keyed on clerk_user_id, NOT on a user_id foreign key.
    const memberQuery = agencyId
      ? `SELECT
           m.id,
           m."agency_id"  AS "agencyId",
           m.role,
           m.status,
           a.name         AS "agencyName",
           a.status       AS "agencyStatus"
         FROM "AgencyMember" m
         JOIN "Agency" a ON a.id = m."agency_id"
         WHERE m."clerk_user_id" = $1
           AND m."agency_id" = $2
           AND m.status = 'active'
           AND a.status = 'active'
         LIMIT 1`
      : `SELECT
           m.id,
           m."agency_id"  AS "agencyId",
           m.role,
           m.status,
           a.name         AS "agencyName",
           a.status       AS "agencyStatus"
         FROM "AgencyMember" m
         JOIN "Agency" a ON a.id = m."agency_id"
         WHERE m."clerk_user_id" = $1
           AND m.status = 'active'
           AND a.status = 'active'
         ORDER BY m."created_at" ASC
         LIMIT 1`;

    const params = agencyId ? [clerkId, agencyId] : [clerkId];
    const { rows: memberRows } = await pool.query(memberQuery, params);

    if (!memberRows.length) return null;

    const m = memberRows[0];
    return {
      clerkId,
      userId,
      memberId:     m.id,
      agencyId:     m.agencyId,
      role:         m.role,
      status:       m.status,
      agencyName:   m.agencyName,
      agencyStatus: m.agencyStatus,
      isGlobalAdmin: false,
    };
  } catch (err) {
    console.error('[agencyAuth] DB error:', err.message);
    const dbErr = new Error(`Database error: ${err.message}`);
    dbErr.isDbError = true;
    dbErr.status = 503;
    throw dbErr;
  }
}

/**
 * Returns all active agency memberships for the authenticated user.
 * Global admins return an empty array — they find agencies via the Admin panel.
 *
 * AgencyMember snake_case columns are aliased to camelCase.
 */
export async function resolveAllAgencyMemberships(authHeader, pool) {
  if (!authHeader?.startsWith('Bearer ')) return [];

  let base;
  try {
    base = await resolveUserBase(authHeader, pool);
  } catch {
    return [];
  }
  if (!base) return [];

  // Global admins do not get agency memberships in the workspace switcher.
  if (base.userRole === 'admin') return [];

  try {
    const { rows } = await pool.query(
      `SELECT
         m.id,
         m."agency_id"  AS "agencyId",
         m.role,
         m.status,
         a.name         AS "agencyName",
         a.status       AS "agencyStatus",
         a.slug         AS "agencySlug"
       FROM "AgencyMember" m
       JOIN "Agency" a ON a.id = m."agency_id"
       WHERE m."clerk_user_id" = $1
         AND m.status = 'active'
         AND a.status = 'active'
       ORDER BY m."created_at" ASC`,
      [base.clerkId]
    );

    return rows.map(m => ({
      clerkId:      base.clerkId,
      userId:       base.userId,
      memberId:     m.id,
      agencyId:     m.agencyId,
      role:         m.role,
      status:       m.status,
      agencyName:   m.agencyName,
      agencyStatus: m.agencyStatus,
      agencySlug:   m.agencySlug,
    }));
  } catch (err) {
    console.error('[agencyAuth] resolveAllAgencyMemberships error:', err.message);
    return [];
  }
}

/**
 * Checks if the authenticated user is a HiddenAtlas global admin.
 * Returns the userId if admin, null otherwise.
 */
export async function checkIsGlobalAdmin(authHeader, pool) {
  let base;
  try {
    base = await resolveUserBase(authHeader, pool);
  } catch {
    return null;
  }
  if (!base || base.userRole !== 'admin') return null;
  return base.userId;
}
