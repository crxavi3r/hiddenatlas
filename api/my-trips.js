import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET /api/my-trips
// Returns all purchased itineraries for the authenticated user.
// Two-step: 1) resolve User.id from clerkId, 2) query Purchases by User.id directly.
// This avoids the JOIN "User" pattern in the main query which was silently
// dropping California purchases when the userId didn't match via that path.
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
    // ── Step 1: resolve internal userId from clerkId ──────────────────────────
    const { rows: userRows } = await pool.query(
      `SELECT id, email FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    console.log('[my-trips] clerkId:', clerkId,
      '| user:', userRows[0] ? `${userRows[0].id} <${userRows[0].email}>` : 'NOT FOUND');

    if (!userRows.length) {
      return res.status(200).json([]);
    }
    const userId = userRows[0].id;

    // ── Step 2: purchases for this userId joined with Itinerary ───────────────
    // Uses userId directly — no JOIN "User" — so ALL purchases for this user
    // are returned regardless of how the clerkId<>userId mapping was created.
    const { rows } = await pool.query(
      `SELECT
         p.id              AS "purchaseId",
         p."purchasedAt",
         p.status,
         i.slug,
         i.title,
         i.description     AS excerpt,
         i."coverImage",
         i."pdfUrl"
       FROM "Purchase" p
       JOIN "Itinerary" i ON i.id = p."itineraryId"
       WHERE p."userId" = $1
         AND (p.status IS NULL OR p.status NOT IN ('refunded', 'cancelled', 'chargebacked'))
       ORDER BY p."purchasedAt" DESC`,
      [userId]
    );

    console.log('[my-trips] purchases returned:', rows.length,
      '| slugs:', rows.map(r => r.slug),
      '| statuses:', rows.map(r => r.status));

    return res.status(200).json(rows);

  } catch (err) {
    // Return detail in response so the on-screen debug panel can show it
    console.error('[my-trips] DB error:', err.message, err.stack);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
