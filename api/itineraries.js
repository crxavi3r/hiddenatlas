import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/itineraries?action=access&slug=:slug
//   Returns { hasAccess: bool, pdfUrl: string|null }
//
// GET /api/itineraries?action=purchases
//   Returns { slugs: string[] } — all purchased itinerary slugs for the user
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

  const { action, slug } = req.query;

  // ── GET /api/itineraries?action=access&slug= ───────────────────────────────
  if (action === 'access') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT p.id, i."pdfUrl"
         FROM "Purchase" p
         JOIN "Itinerary" i ON i.id = p."itineraryId"
         JOIN "User" u ON u.id = p."userId"
         WHERE u."clerkId" = $1 AND i.slug = $2
         LIMIT 1`,
        [clerkId, slug]
      );
      return res.status(200).json({
        hasAccess: rows.length > 0,
        pdfUrl: rows[0]?.pdfUrl ?? null,
      });
    } catch (err) {
      console.error('[itineraries/access] DB error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=purchases ──────────────────────────────────
  if (action === 'purchases') {
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
      console.error('[itineraries/purchases] DB error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=access or ?action=purchases' });
}
