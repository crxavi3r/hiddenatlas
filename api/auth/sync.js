import { verifyToken, createClerkClient } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Extract token ────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  const token = authHeader.slice(7);

  // ── 2. Guard env vars ───────────────────────────────────────
  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'CLERK_SECRET_KEY not configured' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  // ── 3. Verify Clerk JWT — clerkId comes from the token, never from body ──
  let clerkId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── 4. Fetch fresh profile from Clerk ───────────────────────
  let email, name;
  try {
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const clerkUser = await clerk.users.getUser(clerkId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? `${clerkId}@clerk.local`;
    name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || 'HiddenAtlas User';
  } catch {
    return res.status(500).json({ error: 'Failed to fetch Clerk user profile' });
  }

  // ── 5. Upsert into Neon ─────────────────────────────────────
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
    console.error('[api/auth/sync] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
