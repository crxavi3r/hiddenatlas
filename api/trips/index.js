import { verifyToken } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;

// GET /api/trips
// Returns all saved AI trips for the authenticated user, newest first.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[trips/list] missing auth header');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    console.error('[trips/list] missing env vars');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkId = payload.sub;
    console.log('[trips/list] clerkId:', clerkId);
  } catch (err) {
    console.error('[trips/list] token verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    console.log('[trips/list] user lookup rows:', users.length);
    if (!users.length) return res.status(200).json([]);
    const userId = users[0].id;

    const { rows } = await pool.query(
      `SELECT
         t.id,
         t.title,
         t.destination,
         t.country,
         t.duration,
         t.overview,
         t.source,
         t."coverImage",
         t."createdAt",
         COUNT(d.id)::int AS "dayCount"
       FROM "Trip" t
       LEFT JOIN "TripDay" d ON d."tripId" = t.id
       WHERE t."userId" = $1
       GROUP BY t.id
       ORDER BY t."createdAt" DESC`,
      [userId]
    );
    console.log('[trips/list] found', rows.length, 'trips for userId:', userId);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[trips/list] DB error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
