import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/purchases
// Returns { slugs: string[] } — all itinerary slugs purchased by the authenticated user.
// Used by listing pages to show "Purchased" badges without N individual access checks.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
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
    const { rows } = await pool.query(
      `SELECT i.slug
       FROM "Purchase" p
       JOIN "Itinerary" i ON i.id = p."itineraryId"
       JOIN "User" u       ON u.id = p."userId"
       WHERE u."clerkId" = $1`,
      [clerkId]
    );
    return res.status(200).json({ slugs: rows.map(r => r.slug) });
  } catch (err) {
    console.error('[purchases] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
