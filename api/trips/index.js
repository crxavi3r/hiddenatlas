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
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    // No user row yet (first sign-in still processing) → return empty list
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
         t."createdAt",
         COUNT(d.id)::int AS "dayCount"
       FROM "Trip" t
       LEFT JOIN "TripDay" d ON d."tripId" = t.id
       WHERE t."userId" = $1
       GROUP BY t.id
       ORDER BY t."createdAt" DESC`,
      [userId]
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[api/trips/index] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
