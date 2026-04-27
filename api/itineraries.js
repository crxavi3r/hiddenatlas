import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

// GET /api/itineraries?action=access&slug=:slug
//   Returns { hasAccess: bool, pdfUrl: string|null }
//
// GET /api/itineraries?action=pdf-url&slug=:slug
//   Auth required. Returns { pdfUrl, pdfVersion, pdfGeneratedAt } — always fresh, no purchase check.
//   Used at download time by both admin and regular users. Never cached.
//
// GET /api/itineraries?action=download&slug=:slug
//   Auth required. Validates purchase (or admin), fetches PDF from blob storage on the server,
//   and streams it to the browser with Content-Disposition: attachment. Blob URL never exposed.
//
// GET /api/itineraries?action=purchases
//   Returns { slugs: string[] } — all purchased itinerary slugs for the user
//
// GET /api/itineraries?action=assets&slug=:slug
//   Public (no auth). Returns { assets: ItineraryAsset[] } for the given slug.
//
// GET /api/itineraries?action=custom&slug=:slug[&preview=true]
//   Auth required. Owner or admin access to a private/custom itinerary + assets.
//   Returns { itinerary, assets, isAdmin }
//
// GET /api/itineraries?action=my-trips
//   Auth required. Returns purchased premium itineraries for the authenticated user.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { action, slug, preview } = req.query;

  // ── GET /api/itineraries?action=creator-map ────────────────────────────────
  // Public — returns { creators: { [itinerary_slug]: { name, slug, avatarUrl } } }
  // Used by listing + detail pages to show creator attribution without a full auth call.
  if (action === 'creator-map') {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT i.slug AS itinerary_slug, c.name, c.slug, c.avatar_url AS "avatarUrl"
         FROM "Itinerary" i
         JOIN "Creator" c ON c.id = i.creator_id AND c.is_active = true
         WHERE i.status = 'published'`
      );
      const creators = {};
      for (const row of rows) {
        creators[row.itinerary_slug] = { name: row.name, slug: row.slug, avatarUrl: row.avatarUrl };
      }
      return res.json({ creators });
    } catch (err) {
      if (err.message?.includes('does not exist')) return res.json({ creators: {} });
      console.error('[itineraries/creator-map]', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=hero-images ─────────────────────────────────
  // Public — returns { heroes: { [slug]: url } } for all itineraries that have
  // an active DB hero asset. Used by the listing page so card images stay in
  // sync with whatever is set in the CMS.
  if (action === 'hero-images') {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT i.slug, ia.url
         FROM   "ItineraryAsset" ia
         JOIN   "Itinerary"      i ON i.id = ia."itineraryId"
         WHERE  ia."assetType" = 'hero'
           AND  ia.active = true
           AND  i.status = 'published'`
      );
      const heroes = {};
      for (const row of rows) heroes[row.slug] = row.url;
      return res.json({ heroes });
    } catch (err) {
      // Table may not exist yet — return empty map so the page still renders
      if (err.message?.includes('does not exist')) return res.json({ heroes: {} });
      console.error('[itineraries/hero-images]', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=list ────────────────────────────────────────
  // Public — returns all published, public, non-collection itineraries for the
  // listing page. Includes itineraries created via CMS that are not in the
  // static data file. Short cache so publish is visible within ~30 s.
  if (action === 'list') {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT slug, title, subtitle, destination, country, region,
                "durationDays", type, "accessType", price,
                "isPrivate", "isCollection", "parentId",
                "coverImage", description, status, "isPublished"
         FROM   "Itinerary"
         WHERE  (status = 'published' OR "isPublished" = true)
           AND  ("isPrivate" = false OR "isPrivate" IS NULL)
           AND  ("isCollection" = false OR "isCollection" IS NULL)
           AND  ("parentId" IS NULL OR "parentId" = '')
           AND  (type IS NULL OR type != 'custom')
         ORDER BY "updatedAt" DESC`
      );
      return res.json({ itineraries: rows });
    } catch (err) {
      if (err.message?.includes('does not exist')) return res.json({ itineraries: [] });
      console.error('[itineraries/list]', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=assets&slug= ────────────────────────────────
  // Public — no auth required. Asset URLs are already public (Vercel Blob / CDN).
  if (action === 'assets') {
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT ia."assetType", ia."url", ia."alt", ia."caption",
                ia."dayNumber", ia."source", ia."sortOrder"
         FROM   "ItineraryAsset" ia
         JOIN   "Itinerary"      i  ON i.id = ia."itineraryId"
         WHERE  i.slug = $1
           AND  i.status = 'published'
           AND  ia.active = true
         ORDER BY ia."assetType",
                  ia."dayNumber" NULLS LAST,
                  ia."sortOrder",
                  ia."createdAt"`,
        [slug]
      );
      return res.json({ assets: rows });
    } catch (err) {
      if (err.message?.includes('does not exist')) return res.json({ assets: [] });
      console.error('[itineraries/assets]', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=content&slug= ───────────────────────────────
  // Public — no auth required. Returns days array from the published itinerary
  // record in the database. Used by the public detail page so CMS edits appear
  // without a redeploy. Only published itineraries are returned.
  if (action === 'content') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT (content::jsonb)->'days' AS days,
                "coverImage"
         FROM   "Itinerary"
         WHERE  slug = $1
           AND  status = 'published'
         LIMIT  1`,
        [slug]
      );
      if (!rows.length) return res.status(404).json({ error: 'not found' });
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
      return res.json({ days: rows[0].days ?? [], coverImage: rows[0].coverImage ?? null });
    } catch (err) {
      console.error('[itineraries/content]', err.message);
      return res.status(500).json({ error: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── All remaining actions require authentication ────────────────────────────
  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── GET /api/itineraries?action=access&slug= ──────────────────────────────
  if (action === 'access') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT p.id, COALESCE(i.pdf_url, i."pdfUrl") AS "pdfUrl"
         FROM "Purchase" p
         JOIN "Itinerary" i ON i.id = p."itineraryId"
         JOIN "User" u ON u.id = p."userId"
         WHERE u."clerkId" = $1 AND i.slug = $2
         LIMIT 1`,
        [clerkId, slug]
      );
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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

  // ── GET /api/itineraries?action=pdf-url&slug= ─────────────────────────────
  // Single source of truth for the active PDF URL + version.
  // Auth-only — no purchase check. Works for admins and regular users alike.
  // Always returns the latest value straight from DB; never cached.
  if (action === 'pdf-url') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT COALESCE(pdf_url, "pdfUrl") AS "pdfUrl",
                pdf_version                 AS "pdfVersion",
                "pdfGeneratedAt"
         FROM   "Itinerary"
         WHERE  slug = $1
         LIMIT  1`,
        [slug]
      );
      if (!rows.length) return res.status(404).json({ error: 'Itinerary not found' });

      const { pdfUrl, pdfVersion, pdfGeneratedAt } = rows[0];
      console.log('[itineraries/pdf-url] slug:', slug,
        '| pdfUrl:', pdfUrl ? pdfUrl.slice(0, 80) + '…' : '(none)',
        '| version:', pdfVersion || '(none)');

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.status(200).json({
        pdfUrl:         pdfUrl         ?? null,
        pdfVersion:     pdfVersion     ?? null,
        pdfGeneratedAt: pdfGeneratedAt ?? null,
      });
    } catch (err) {
      console.error('[itineraries/pdf-url] DB error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=download&slug= ───────────────────────────
  // Secure PDF proxy. Validates auth + purchase, fetches the blob server-side,
  // and streams it to the browser as an attachment. The public blob URL is never
  // sent to the client — only the file bytes reach the browser.
  if (action === 'download') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let pdfUrl, filename;

    try {
      const userCtx = await resolveUserCtx(req.headers.authorization, pool);
      const isAdmin  = userCtx?.isAdmin  ?? false;
      const userId   = userCtx?.userId   ?? null;

      // Fetch itinerary title + pdf_url in one query
      const { rows: itRows } = await pool.query(
        `SELECT title, COALESCE(pdf_url, "pdfUrl") AS "pdfUrl"
         FROM   "Itinerary"
         WHERE  slug = $1
         LIMIT  1`,
        [slug]
      );
      if (!itRows.length) return res.status(404).json({ error: 'Itinerary not found' });

      pdfUrl   = itRows[0].pdfUrl;
      filename = `${(itRows[0].title || slug).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;

      if (!pdfUrl) return res.status(404).json({ error: 'No PDF available for this itinerary' });

      // Non-admin users must have a valid purchase
      if (!isAdmin) {
        if (!userId) return res.status(403).json({ error: 'Access denied' });
        const { rows: purchaseRows } = await pool.query(
          `SELECT p.id
           FROM   "Purchase" p
           JOIN   "Itinerary" i ON i.id = p."itineraryId"
           WHERE  p."userId" = $1
             AND  i.slug    = $2
             AND  (p.status IS NULL OR p.status NOT IN ('refunded','cancelled','chargebacked'))
           LIMIT 1`,
          [userId, slug]
        );
        if (!purchaseRows.length) return res.status(403).json({ error: 'Access denied' });
      }
    } catch (err) {
      console.error('[itineraries/download] DB error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      // Always close the pool before we start streaming — the stream runs after
      // the try/finally block and we must not hold the connection open.
      await pool.end();
    }

    // ── Fetch blob and stream to client ──────────────────────────────────────
    console.log('[itineraries/download] streaming PDF for slug:', slug,
      '| url:', pdfUrl.slice(0, 80) + '…');
    try {
      const blobRes = await fetch(pdfUrl);
      if (!blobRes.ok) {
        console.error('[itineraries/download] blob fetch failed:', blobRes.status);
        return res.status(502).json({ error: 'Could not retrieve PDF' });
      }

      res.setHeader('Content-Type',        'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control',       'private, no-store');

      const contentLength = blobRes.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);

      // Stream chunks directly to the response — avoids buffering the whole PDF in memory
      const reader = blobRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } catch (err) {
      console.error('[itineraries/download] stream error:', err.message);
      // Headers may already be sent — can't send JSON error at this point
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream error' });
      } else {
        res.end();
      }
    }
    return;
  }

  // ── GET /api/itineraries?action=purchases ─────────────────────────────────
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

  // ── GET /api/itineraries?action=my-trips ─────────────────────────────────
  // Returns purchased premium itineraries for the user (excludes custom type).
  if (action === 'my-trips') {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows: userRows } = await pool.query(
        `SELECT id, email FROM "User" WHERE "clerkId" = $1`,
        [clerkId]
      );
      console.log('[itineraries/my-trips] clerkId:', clerkId,
        '| user:', userRows[0] ? `${userRows[0].id} <${userRows[0].email}>` : 'NOT FOUND');

      if (!userRows.length) return res.status(200).json([]);
      const userId = userRows[0].id;

      const { rows } = await pool.query(
        `SELECT
           p.id              AS "purchaseId",
           p."purchasedAt",
           p.status,
           i.slug,
           i.title,
           i.description     AS excerpt,
           i."coverImage",
           COALESCE(i.pdf_url, i."pdfUrl") AS "pdfUrl"
         FROM "Purchase" p
         JOIN "Itinerary" i ON i.id = p."itineraryId"
         WHERE p."userId" = $1
           AND (p.status IS NULL OR p.status NOT IN ('refunded', 'cancelled', 'chargebacked'))
           AND (i.type IS DISTINCT FROM 'custom')
         ORDER BY p."purchasedAt" DESC`,
        [userId]
      );
      return res.status(200).json(rows);
    } catch (err) {
      console.error('[itineraries/my-trips] DB error:', err.message);
      return res.status(500).json({ error: 'Database error', detail: err.message });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/itineraries?action=custom&slug=[&preview=true] ──────────────
  // Owner or admin access to a private/custom itinerary with assets.
  if (action === 'custom') {
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const userCtx   = await resolveUserCtx(req.headers.authorization, pool);
      const userId    = userCtx?.userId    ?? null;
      const creatorId = userCtx?.creatorId ?? null;
      const isAdmin   = userCtx?.isAdmin   ?? false;

      const { rows } = await pool.query(
        `SELECT * FROM "Itinerary" WHERE slug = $1 LIMIT 1`, [slug]
      );
      if (!rows.length) return res.status(404).json({ error: 'Itinerary not found' });
      const it = rows[0];

      // Owner = user who holds the custom itinerary (userId) OR the designer/creator who built it
      const isOwner =
        (userId    !== null && it.userId      === userId)    ||
        (creatorId !== null && it.creator_id  === creatorId);

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'You do not have access to this itinerary' });
      }

      // Owners may always preview their own itineraries (including drafts).
      // Non-owner, non-admin users can only see published itineraries.
      if (!isOwner && !isAdmin && it.status !== 'published') {
        return res.status(403).json({ error: 'This itinerary is not ready yet' });
      }

      const assetRes = await pool.query(
        `SELECT "assetType", url, alt, caption, "dayNumber", source, "sortOrder"
         FROM   "ItineraryAsset"
         WHERE  "itineraryId" = $1 AND active = true
         ORDER  BY "assetType", "dayNumber" NULLS LAST, "sortOrder", "createdAt"`,
        [it.id]
      );

      return res.json({ itinerary: it, assets: assetRes.rows, isAdmin });
    } catch (err) {
      console.error('[itineraries/custom]', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
