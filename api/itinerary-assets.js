// GET /api/itinerary-assets?slug=<slug>
//
// Public endpoint — returns all active ItineraryAsset records for the given
// itinerary slug. No auth required: asset URLs are already public (Vercel Blob
// access:'public' or static CDN paths). Consumers are the public itinerary
// detail page and any preview / PDF pipeline that needs DB-uploaded images.
//
// Response: { assets: ItineraryAsset[] }
//   Each asset: { assetType, url, alt, caption, dayNumber, source, sortOrder }

import pg from 'pg';
const { Pool } = pg;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  // DATABASE_URL may be absent in local builds without .env — return empty gracefully
  if (!process.env.DATABASE_URL) return res.json({ assets: [] });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT ia."assetType", ia."url", ia."alt", ia."caption",
              ia."dayNumber", ia."source", ia."sortOrder"
       FROM   "ItineraryAsset" ia
       JOIN   "Itinerary"      i  ON i.id = ia."itineraryId"
       WHERE  i.slug = $1
         AND  ia.active = true
       ORDER BY ia."assetType",
                ia."dayNumber" NULLS LAST,
                ia."sortOrder",
                ia."createdAt"`,
      [slug]
    );
    return res.json({ assets: rows });
  } catch (err) {
    // Table may not exist yet (pre-migration) — return empty instead of 500
    if (err.message?.includes('does not exist')) {
      return res.json({ assets: [] });
    }
    console.error('[itinerary-assets]', err);
    return res.status(500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}
