import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/my-trips
// Returns all paid purchased itineraries for the authenticated user,
// ordered by purchase date descending.
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
      `SELECT
         p.id              AS "purchaseId",
         p."purchasedAt",
         p.status,
         i.slug,
         -- Fall back to content JSON hero title when the DB column is a raw stub (title = slug)
         COALESCE(NULLIF(i.title, i.slug), i.content->'hero'->>'title', i.slug)                    AS title,
         -- Fall back to content JSON short description when description is empty
         COALESCE(NULLIF(i.description,''), i.content->'summary'->>'shortDescription', '')          AS excerpt,
         COALESCE(NULLIF(i."coverImage",''), i.content->'hero'->>'coverImage', '')                  AS "coverImage",
         i."pdfUrl"
       FROM "Purchase" p
       JOIN "Itinerary" i ON i.id = p."itineraryId"
       JOIN "User"      u ON u.id = p."userId"
       WHERE u."clerkId" = $1
         AND (p.status IS NULL OR p.status NOT IN ('refunded', 'cancelled', 'chargebacked'))
       ORDER BY p."purchasedAt" DESC`,
      [clerkId]
    );
    console.log('[my-trips] clerkId:', clerkId, '| purchases returned:', rows.length,
      '| statuses:', rows.map(r => r.status));
    return res.status(200).json(rows);
  } catch (err) {
    console.error('[my-trips] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
