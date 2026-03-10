import pg from 'pg';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/trips
// Returns all saved AI trips for the authenticated user, newest first.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────
  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
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
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[trips/list] DB error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
