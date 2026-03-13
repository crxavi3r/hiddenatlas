import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/itinerary-access?slug=:slug
// Returns { hasAccess: bool, pdfUrl: string|null }
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
    console.error('[itinerary-access] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
