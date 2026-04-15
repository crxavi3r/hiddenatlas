import { createClerkClient } from '@clerk/backend';
import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

// GET /api/auth?action=me
// Returns { role, creatorSlug, email } for the authenticated user.
// Used by the frontend to determine admin/designer access without ADMIN_EMAILS.
async function handleMe(req, res) {
  // ── Debug: log incoming auth details ────────────────────────────────────────
  const authHeader = req.headers.authorization;
  console.log('[api/auth/me] incoming request:', {
    method:        req.method,
    hasAuthHeader: !!authHeader,
    authPrefix:    authHeader ? authHeader.slice(0, 14) + '...' : 'missing',
    hasCookie:     !!req.headers.cookie,
    origin:        req.headers.origin  ?? 'none',
    host:          req.headers.host    ?? 'none',
    referer:       req.headers.referer ?? 'none',
    CLERK_SECRET_KEY_SET: !!process.env.CLERK_SECRET_KEY,
    DATABASE_URL_SET:     !!process.env.DATABASE_URL,
  });

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const ctx = await resolveUserCtx(req.headers.authorization, pool);
    if (!ctx) {
      console.warn('[api/auth/me] resolveUserCtx returned null — sending 401');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch creatorSlug if this user has a linked creator profile
    let creatorSlug = null;
    if (ctx.creatorId) {
      const { rows } = await pool.query(
        `SELECT slug FROM "Creator" WHERE id = $1 LIMIT 1`, [ctx.creatorId]
      );
      creatorSlug = rows[0]?.slug ?? null;
    }

    console.log('[api/auth/me] resolved ctx:', {
      userId:    ctx.userId,
      email:     ctx.email,
      role:      ctx.role,
      isAdmin:   ctx.isAdmin,
      isDesigner: ctx.isDesigner,
      creatorId: ctx.creatorId,
    });
    return res.status(200).json({
      role:       ctx.role,
      email:      ctx.email,
      isAdmin:    ctx.isAdmin,
      isDesigner: ctx.isDesigner,
      creatorSlug,
      creatorId:  ctx.creatorId,
    });
  } catch (err) {
    console.error('[api/auth/me]', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}

// POST /api/auth
// Syncs the authenticated Clerk user into the PostgreSQL User table.
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'me') return handleMe(req, res);
    return res.status(400).json({ error: 'Unknown GET action' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'CLERK_SECRET_KEY not configured' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  let email, name;
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(clerkId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@clerk.local`;
    name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || 'HiddenAtlas User';
  } catch (err) {
    console.error('[api/auth] Clerk profile fetch failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch Clerk user profile' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `INSERT INTO "User" (id, "clerkId", email, name, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
       ON CONFLICT ("clerkId")
       DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, "updatedAt" = NOW()
       RETURNING id, "clerkId", email, name, "createdAt"`,
      [clerkId, email, name]
    );
    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('[api/auth] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
