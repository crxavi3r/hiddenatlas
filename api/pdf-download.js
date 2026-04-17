// GET /api/pdf-download?slug=:slug
//
// Protected download endpoint for premium PDF itineraries.
//
// Security model:
//   1. Validates Clerk JWT — 401 if missing/invalid.
//   2. Checks the caller holds a valid purchase for this itinerary,
//      OR is the owner of a custom itinerary, OR is an admin — 403 otherwise.
//   3. Reads the latest pdf_url from the DB (never a stale client-cached URL).
//   4. Fetches the PDF blob server-side (no CORS constraints, private blob token
//      injected server-side so it is never exposed to the browser).
//   5. Streams the binary to the browser with appropriate headers.
//
// Private blobs (uploaded with access:'private') carry '.private.' in their URL
// and require BLOB_READ_WRITE_TOKEN for the server fetch.
// Legacy public blobs ('.public.') are fetched without auth for backward compat.

import pg              from 'pg';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    const ctx = await resolveUserCtx(req.headers.authorization, pool);
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

    // ── 2. Fetch itinerary (latest pdf_url comes from DB, never from client) ──
    const { rows } = await pool.query(
      `SELECT id, slug, title, type, "userId",
              COALESCE(pdf_url, "pdfUrl") AS pdf_url
       FROM   "Itinerary"
       WHERE  slug = $1
       LIMIT  1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Itinerary not found' });
    const it = rows[0];

    if (!it.pdf_url) {
      return res.status(404).json({ error: 'No PDF available for this itinerary' });
    }

    // ── 3. Authorize ──────────────────────────────────────────────────────────
    // Admins bypass all checks.
    // Custom itinerary owners (Itinerary.userId === User.id) have access.
    // Everyone else must hold a valid (non-refunded) purchase.
    if (!ctx.isAdmin) {
      const isOwner = Boolean(it.userId && it.userId === ctx.userId);
      if (!isOwner) {
        const { rows: purchaseRows } = await pool.query(
          `SELECT 1
           FROM   "Purchase"
           WHERE  "userId"       = $1
             AND  "itineraryId"  = $2
             AND  (status IS NULL OR status NOT IN ('refunded', 'cancelled', 'chargebacked'))
           LIMIT  1`,
          [ctx.userId, it.id]
        );
        if (!purchaseRows.length) {
          console.warn('[pdf-download] 403 — no purchase — userId:', ctx.userId, '| slug:', slug);
          return res.status(403).json({ error: 'You do not have access to this PDF' });
        }
      }
    }

    // ── 4. Fetch PDF from blob storage ────────────────────────────────────────
    // Private blobs (.private.blob.vercel-storage.com) require the token.
    // Public blobs (.public.blob.vercel-storage.com) are still reachable without auth
    // for backward compatibility with PDFs uploaded before the private migration.
    const isPrivate = it.pdf_url.includes('.private.blob.vercel-storage.com');
    const blobHeaders = {};
    if (isPrivate) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('[pdf-download] BLOB_READ_WRITE_TOKEN not set — cannot fetch private blob');
        return res.status(500).json({ error: 'Server misconfigured' });
      }
      blobHeaders.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
    }

    const blobRes = await fetch(it.pdf_url, { headers: blobHeaders });
    if (!blobRes.ok) {
      console.error('[pdf-download] blob fetch failed:', blobRes.status,
        '|', it.pdf_url.slice(0, 80));
      return res.status(502).json({ error: 'Failed to retrieve PDF from storage' });
    }

    const buffer   = Buffer.from(await blobRes.arrayBuffer());
    const filename = `${it.slug}-hiddenatlas.pdf`;

    console.log('[pdf-download] serving —', it.slug,
      '| userId:', ctx.userId, '| isAdmin:', ctx.isAdmin,
      '| private:', isPrivate, '| bytes:', buffer.length);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.end(buffer);

  } catch (err) {
    if (err.isDbError) {
      console.error('[pdf-download] DB error:', err.message);
      return res.status(503).json({ error: 'Database unavailable' });
    }
    console.error('[pdf-download] unexpected error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await pool.end();
  }
}
