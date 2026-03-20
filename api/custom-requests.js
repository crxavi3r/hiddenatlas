import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/custom-requests
// Returns the authenticated user's custom planning requests, newest first.
// If a request has a tripId, includes basic trip info (title, destination).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve internal user ID
    const userRes = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
    );
    const userId = userRes.rows[0]?.id;
    if (!userId) return res.status(200).json([]);

    const { rows } = await pool.query(`
      SELECT
        cr.id,
        cr.destination,
        cr.dates,
        cr.status,
        cr."createdAt",
        cr."tripId",
        t.title           AS "tripTitle",
        t.destination     AS "tripDestination",
        t."itinerarySlug" AS "tripItinerarySlug",
        itin.status       AS "linkedItineraryStatus",
        itin.slug         AS "linkedItinerarySlug"
      FROM "CustomRequest" cr
      LEFT JOIN "Trip" t       ON t.id    = cr."tripId"
      LEFT JOIN "Itinerary" itin ON itin.id = cr."itineraryId"
      WHERE cr."userId" = $1
      ORDER BY cr."createdAt" DESC
    `, [userId]);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[custom-requests] error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end().catch(() => {});
  }
}
