// ── resolveUserCtx ────────────────────────────────────────────────────────────
// Shared auth helper for all API routes.
// Verifies the Clerk JWT, looks up the User row (with role) and any linked
// active Creator profile, and returns a normalised context object.
//
// Returns null when:
//   - Authorization header is missing / malformed
//   - Token is invalid or expired
//   - No matching User row found in the database AND email is not an admin email
//
// Admin email fallback:
//   If the JWT is valid but no User row exists in the DB (e.g. account created
//   outside normal sign-up flow), we look up the email via Clerk and grant admin
//   access if the email matches adminEmails.js. This prevents a catch-22 where
//   the admin cannot log in because no DB row was ever created.
//
// Usage:
//   const ctx = await resolveUserCtx(req.headers.authorization, pool);
//   if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
//   if (!ctx.isAdmin) return res.status(403).json({ error: 'Admin only' });

import { verifyAuth }          from './verifyAuth.js';
import { isAdminEmail }        from './adminEmails.js';
import { createClerkClient }   from '@clerk/backend';

/**
 * @typedef {Object} UserCtx
 * @property {string}      userId     — internal UUID from "User".id (or clerkId when no DB row)
 * @property {string}      email
 * @property {string}      role       — 'user' | 'admin' | 'designer'
 * @property {string|null} creatorId  — "Creator".id if user has an active creator profile
 * @property {boolean}     isAdmin    — role === 'admin' || isAdminEmail(email)
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

    if (!rows.length) {
      // ── No DB row found — try admin email fallback via Clerk ─────────────
      // This covers accounts created outside the normal sign-up flow (e.g. via
      // the Clerk dashboard) where no User row was ever inserted.
      console.warn(`[resolveUserCtx] no User row for clerkId=${clerkId} — checking Clerk for admin email fallback`);
      try {
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const clerkUser = await clerk.users.getUser(clerkId);
        const primaryEmail =
          clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId)?.emailAddress
          ?? clerkUser.emailAddresses[0]?.emailAddress;

        console.warn(`[resolveUserCtx] Clerk lookup result — clerkId=${clerkId} email=${primaryEmail} isAdminEmail=${isAdminEmail(primaryEmail)}`);

        if (isAdminEmail(primaryEmail)) {
          console.warn(`[resolveUserCtx] ADMIN FALLBACK GRANTED — email=${primaryEmail} clerkId=${clerkId}`);
          return {
            userId:    clerkId,   // no DB row, use clerkId as stand-in
            email:     primaryEmail,
            role:      'admin',
            creatorId: null,
            isAdmin:   true,
            isDesigner: true,
          };
        }

        console.warn(`[resolveUserCtx] UNAUTHORIZED — no User row and email ${primaryEmail} is not an admin email`);
      } catch (clerkErr) {
        console.error(`[resolveUserCtx] Clerk lookup failed for clerkId=${clerkId}:`, clerkErr.message);
      }
      return null;
    }

    const { id: userId, email, role, creatorId } = rows[0];
    const isAdmin    = role === 'admin' || isAdminEmail(email);
    const isDesigner = role === 'designer' || role === 'admin' || isAdminEmail(email) || creatorId !== null;

    console.log(`[resolveUserCtx] clerkId=${clerkId} userId=${userId} email=${email} role=${role} isAdmin=${isAdmin} isDesigner=${isDesigner}`);

    return {
      userId,
      email,
      role:       role ?? 'user',
      creatorId:  creatorId ?? null,
      isAdmin,
      isDesigner,
    };
  } catch (err) {
    console.error(`[resolveUserCtx] DB error for clerkId=${clerkId}:`, err.message);
    return null;
  }
}
