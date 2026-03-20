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
    // ── Step 1: resolve User by clerkId ──────────────────────────────────────
    const { rows: userRows } = await pool.query(
      `SELECT id, email, "clerkId" FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    console.log('[my-trips] clerkId:', clerkId,
      '| user found:', userRows.length ? `${userRows[0].id} (${userRows[0].email})` : 'NOT FOUND');

    if (!userRows.length) {
      return res.status(200).json([]);
    }
    const userId = userRows[0].id;

    // ── Step 2: all purchases for this userId (diagnostic — no Itinerary join) ─
    const { rows: rawPurchases } = await pool.query(
      `SELECT p.id, p."itineraryId", p.status, p."purchasedAt"
       FROM "Purchase" p
       WHERE p."userId" = $1
       ORDER BY p."purchasedAt" DESC`,
      [userId]
    );
    console.log('[my-trips] raw purchases for userId', userId, ':',
      rawPurchases.map(r => ({ id: r.id, itineraryId: r.itineraryId, status: r.status })));

    // ── Step 3: resolve Itinerary rows for those purchases ────────────────────
    const itinIds = rawPurchases.map(r => r.itineraryId).filter(Boolean);
    const { rows: itinRows } = itinIds.length
      ? await pool.query(
          `SELECT id, slug, title, description, "coverImage", "pdfUrl", content
           FROM "Itinerary" WHERE id = ANY($1)`,
          [itinIds]
        )
      : { rows: [] };
    const itinById = Object.fromEntries(itinRows.map(i => [i.id, i]));
    console.log('[my-trips] itinerary rows resolved:',
      itinRows.map(i => ({ id: i.id, slug: i.slug })));

    // ── Step 4: join manually and filter ─────────────────────────────────────
    const EXCLUDED_STATUSES = new Set(['refunded', 'cancelled', 'chargebacked']);
    const result = rawPurchases
      .filter(p => !EXCLUDED_STATUSES.has(p.status))
      .map(p => {
        const itin = itinById[p.itineraryId];
        if (!itin) {
          console.warn('[my-trips] no Itinerary row for itineraryId:', p.itineraryId,
            '| purchaseId:', p.id);
          return null;
        }
        // Fall back to content JSON when the DB column is a raw stub (title = slug)
        const content = itin.content ?? {};
        const hero    = content.hero    ?? {};
        const summary = content.summary ?? {};
        const title = (itin.title && itin.title !== itin.slug)
          ? itin.title
          : (hero.title || itin.slug);
        const excerpt = itin.description?.trim()
          ? itin.description
          : (summary.shortDescription || '');
        const coverImage = itin.coverImage?.trim()
          ? itin.coverImage
          : (hero.coverImage || '');

        return {
          purchaseId:  p.id,
          purchasedAt: p.purchasedAt,
          status:      p.status,
          slug:        itin.slug,
          title,
          excerpt,
          coverImage,
          pdfUrl:      itin.pdfUrl ?? null,
        };
      })
      .filter(Boolean);

    console.log('[my-trips] final result:', result.length, 'items —',
      result.map(r => r.slug));
    return res.status(200).json(result);

  } catch (err) {
    console.error('[my-trips] DB error:', err.message, err.stack);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
