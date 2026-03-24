// GET /api/itinerary-custom?slug=:slug&preview=:bool
//
// Auth-protected. Returns a custom (private) itinerary with its assets.
// Access rules:
//   - Owner (itinerary.userId = User.id for this clerkId) always has access
//   - Admin emails always have access
//   - preview=true: bypasses status check (draft visible); still requires owner or admin
//   - Otherwise: itinerary must be published

import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Sign in to view this itinerary' });
  }

  const { slug, preview } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Server misconfigured' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve userId + email
    const userRes = await pool.query(
      `SELECT id, email FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
    );
    const userId    = userRes.rows[0]?.id ?? null;
    const userEmail = userRes.rows[0]?.email ?? '';
    const isAdmin   = ADMIN_EMAILS.includes(userEmail);

    // Fetch itinerary
    const { rows } = await pool.query(
      `SELECT * FROM "Itinerary" WHERE slug = $1 LIMIT 1`, [slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Itinerary not found' });
    const it = rows[0];

    // Ownership check
    const isOwner = userId !== null && it.userId === userId;
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You do not have access to this itinerary' });
    }

    // Status check — preview=true bypasses (owner or admin already validated above)
    if (preview !== 'true' && it.status !== 'published' && !isAdmin) {
      return res.status(403).json({ error: 'This itinerary is not ready yet' });
    }

    // Fetch active assets
    const assetRes = await pool.query(
      `SELECT "assetType", url, alt, caption, "dayNumber", source, "sortOrder"
       FROM   "ItineraryAsset"
       WHERE  "itineraryId" = $1 AND active = true
       ORDER  BY "assetType", "dayNumber" NULLS LAST, "sortOrder", "createdAt"`,
      [it.id]
    );

    return res.json({ itinerary: it, assets: assetRes.rows, isAdmin });
  } catch (err) {
    console.error('[itinerary-custom]', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
