import { createClerkClient } from '@clerk/backend';
import pg from 'pg';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Guard env vars ───────────────────────────────────────
  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'CLERK_SECRET_KEY not configured' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  // ── 2. [DEBUG] Log Authorization header presence ────────────
  const authHeader = req.headers.authorization;
  console.log('[api/auth/sync] Authorization header present:', !!authHeader);
  console.log('[api/auth/sync] Starts with Bearer:', authHeader?.startsWith('Bearer ') ?? false);

  // ── 3. Require Bearer token ─────────────────────────────────
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[api/auth/sync] REJECTED — missing Authorization header');
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  // ── 4. Verify Clerk JWT ─────────────────────────────────────
  let clerkId;
  try {
    clerkId = await verifyAuth(authHeader);
    console.log('[api/auth/sync] verifyAuth SUCCESS — clerkId:', clerkId);
  } catch (err) {
    console.warn('[api/auth/sync] verifyAuth FAILED —', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── 5. Fetch fresh profile from Clerk ───────────────────────
  let email, name;
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(clerkId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@clerk.local`;
    name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || 'HiddenAtlas User';
  } catch (err) {
    console.error('[api/auth/sync] Clerk profile fetch FAILED —', err.message);
    return res.status(500).json({ error: 'Failed to fetch Clerk user profile' });
  }

  // ── 6. Upsert into Neon ─────────────────────────────────────
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
    console.log('[api/auth/sync] DB upsert SUCCESS — userId:', rows[0].id);
    return res.status(200).json(rows[0]);
  } catch (err) {
    console.error('[api/auth/sync] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
