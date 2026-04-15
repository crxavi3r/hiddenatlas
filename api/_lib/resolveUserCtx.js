// ── resolveUserCtx ────────────────────────────────────────────────────────────
// Shared auth helper for all API routes.
// Verifies the Clerk JWT, looks up the User row (with role) and any linked
// active Creator profile, and returns a normalised context object.
//
// Returns null when:
//   - Authorization header is missing / malformed
//   - Token is invalid or expired
//   - No matching User row found in the database
//
// Usage:
//   const ctx = await resolveUserCtx(req.headers.authorization, pool);
//   if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
//   if (!ctx.isAdmin) return res.status(403).json({ error: 'Admin only' });

import { verifyAuth } from './verifyAuth.js';
import { isAdminEmail } from './adminEmails.js';

/**
 * @typedef {Object} UserCtx
 * @property {string}      userId     — internal UUID from "User".id
 * @property {string}      email
 * @property {string}      role       — 'user' | 'admin' | 'designer'
 * @property {string|null} creatorId  — "Creator".id if user has an active creator profile
 * @property {boolean}     isAdmin    — role === 'admin'
 * @property {boolean}     isDesigner — role === 'designer' OR role === 'admin'
 */

/**
 * @param {string|undefined} authHeader
 * @param {import('pg').Pool} pool
 * @returns {Promise<UserCtx|null>}
 */
export async function resolveUserCtx(authHeader, pool) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
  } catch {
    return null;
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role, c.id AS "creatorId"
       FROM "User" u
       LEFT JOIN "Creator" c ON c.user_id = u.id AND c.is_active = true
       WHERE u."clerkId" = $1 LIMIT 1`,
      [clerkId]
    );
    if (!rows.length) return null;
    const { id: userId, email, role, creatorId } = rows[0];
    return {
      userId,
      email,
      role:       role ?? 'user',
      creatorId:  creatorId ?? null,
      isAdmin:    role === 'admin' || isAdminEmail(email),
      // Designer if: explicit role OR admin OR has an active Creator profile linked
      isDesigner: role === 'designer' || role === 'admin' || isAdminEmail(email) || creatorId !== null,
    };
  } catch {
    return null;
  }
}
