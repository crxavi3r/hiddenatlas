// ── agencyAuth.js ─────────────────────────────────────────────────────────────
// Multi-tenant agency authorization helpers.
//
// SECURITY RULES (enforced here, never trust frontend):
//   1. Authenticate the Clerk JWT → clerkId
//   2. Look up User row → userId
//   3. Look up active AgencyMember → memberId + agencyId + role
//   4. If a specific agencyId is requested, verify membership in THAT agency
//   5. Only return after all checks pass
//
// Usage:
//   const agCtx = await resolveAgencyCtx(authHeader, pool, agencyId?);
//   if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });
//   if (!canManageTeam(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

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

// ── Agency context resolution ─────────────────────────────────────────────────

/**
 * @typedef {Object} AgencyCtx
 * @property {string}      clerkId       — Clerk user_xxx ID
 * @property {string}      userId        — HiddenAtlas User.id
 * @property {string}      memberId      — AgencyMember.id
 * @property {string}      agencyId      — Agency.id the member belongs to
 * @property {string}      role          — owner | admin | agent | editor
 * @property {string}      status        — invited | active | disabled
 * @property {string}      agencyName    — Agency.name
 * @property {string}      agencyStatus  — Agency.status
 */

/**
 * Resolves agency membership for the authenticated user.
 *
 * @param {string|undefined} authHeader   Authorization header from the request
 * @param {import('pg').Pool} pool
 * @param {string|null} [agencyId]        When provided, validates membership in THIS agency specifically.
 *                                        When null/undefined, returns the first active membership found.
 * @returns {Promise<AgencyCtx|null>}     null → unauthenticated or no membership
 */
export async function resolveAgencyCtx(authHeader, pool, agencyId = null) {
  if (!authHeader?.startsWith('Bearer ')) return null;

  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
  } catch {
    return null;
  }

  try {
    // Resolve User row — we need User.id (the internal UUID), not clerkId.
    const { rows: userRows } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`,
      [clerkId]
    );
    if (!userRows.length) return null;
    const userId = userRows[0].id;

    // Build member query — scoped by agencyId if provided.
    const memberQuery = agencyId
      ? `SELECT m.id, m."agencyId", m.role, m.status,
                a.name AS "agencyName", a.status AS "agencyStatus"
         FROM "AgencyMember" m
         JOIN "Agency" a ON a.id = m."agencyId"
         WHERE m."userId" = $1
           AND m."agencyId" = $2
           AND m.status = 'active'
           AND a.status = 'active'
         LIMIT 1`
      : `SELECT m.id, m."agencyId", m.role, m.status,
                a.name AS "agencyName", a.status AS "agencyStatus"
         FROM "AgencyMember" m
         JOIN "Agency" a ON a.id = m."agencyId"
         WHERE m."userId" = $1
           AND m.status = 'active'
           AND a.status = 'active'
         ORDER BY m."createdAt" ASC
         LIMIT 1`;

    const params = agencyId ? [userId, agencyId] : [userId];
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
 * Used by the workspace selector in the frontend.
 *
 * @param {string|undefined} authHeader
 * @param {import('pg').Pool} pool
 * @returns {Promise<AgencyCtx[]>}
 */
export async function resolveAllAgencyMemberships(authHeader, pool) {
  if (!authHeader?.startsWith('Bearer ')) return [];

  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
  } catch {
    return [];
  }

  try {
    const { rows: userRows } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`,
      [clerkId]
    );
    if (!userRows.length) return [];
    const userId = userRows[0].id;

    const { rows } = await pool.query(
      `SELECT m.id, m."agencyId", m.role, m.status,
              a.name AS "agencyName", a.status AS "agencyStatus", a.slug AS "agencySlug"
       FROM "AgencyMember" m
       JOIN "Agency" a ON a.id = m."agencyId"
       WHERE m."userId" = $1
         AND m.status = 'active'
         AND a.status = 'active'
       ORDER BY m."createdAt" ASC`,
      [userId]
    );

    return rows.map(m => ({
      clerkId,
      userId,
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
