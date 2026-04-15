// ── Creators API ───────────────────────────────────────────────────────────────
//
// Public reads (no auth):
//   GET /api/creators?action=list                     — all active creators
//   GET /api/creators?action=get&slug=:slug           — creator profile + their published itineraries
//
// Admin only:
//   POST /api/creators?action=create                  — create creator
//   POST /api/creators?action=update&id=:id           — update creator (admin or self)
//   POST /api/creators?action=delete&id=:id           — delete creator (admin only)

import pg                     from 'pg';
import path                   from 'path';
import { verifyAuth }         from './_lib/verifyAuth.js';
import { put as blobPut }     from '@vercel/blob';

const { Pool } = pg;

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function resolveUser(authHeader, pool) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const clerkId = await verifyAuth(authHeader);
    const { rows } = await pool.query(
      `SELECT u.id, u.email, c.id as "creatorId"
       FROM "User" u
       LEFT JOIN "Creator" c ON c.user_id = u.id AND c.is_active = true
       WHERE u."clerkId" = $1 LIMIT 1`,
      [clerkId]
    );
    if (!rows.length) return null;
    const { id: userId, email, creatorId } = rows[0];
    return { userId, email, isAdmin: ADMIN_EMAILS.includes(email), creatorId };
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
  const action = req.query.action;
  const id     = req.query.id;

  try {
    // ── Public GET actions ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (action === 'list') {
        return res.json(await handleList(pool));
      }
      if (action === 'get') {
        const slug = req.query.slug;
        if (!slug) return res.status(400).json({ error: 'slug is required' });
        return res.json(await handleGet(pool, slug));
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    // ── Protected POST actions ──────────────────────────────────────────────
    if (req.method === 'POST') {
      const ctx = await resolveUser(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

      const body = req.body ?? {};

      if (action === 'upload-avatar') {
        if (!ctx.isAdmin) return res.status(403).json({ error: 'Admin only' });
        return res.json(await handleUploadAvatar(body));
      }

      if (action === 'create') {
        if (!ctx.isAdmin) return res.status(403).json({ error: 'Admin only' });
        return res.json(await handleCreate(pool, body));
      }

      if (action === 'update') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        // Admin can update any creator; a creator can update their own profile
        if (!ctx.isAdmin && ctx.creatorId !== id) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        return res.json(await handleUpdate(pool, id, body, ctx));
      }

      if (action === 'delete') {
        if (!ctx.isAdmin) return res.status(403).json({ error: 'Admin only' });
        if (!id) return res.status(400).json({ error: 'id is required' });
        return res.json(await handleDelete(pool, id));
      }

      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[creators]', err);
    return res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

// ── List all active creators ──────────────────────────────────────────────────
async function handleList(pool) {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.slug, c.avatar_url AS "avatarUrl", c.bio, c.is_active AS "isActive",
           c.user_id AS "userId", c.created_at AS "createdAt",
           COUNT(i.id) FILTER (WHERE i.status = 'published' AND i."isPrivate" = false AND i."isCollection" = false)::int AS itinerary_count,
           COUNT(i.id)::int AS total_itinerary_count,
           u.email AS linked_email
    FROM "Creator" c
    LEFT JOIN "Itinerary" i ON i.creator_id = c.id
    LEFT JOIN "User" u ON u.id = c.user_id
    GROUP BY c.id, u.email
    ORDER BY c.name ASC
  `);
  return { creators: rows };
}

// ── Get creator by slug + their published itineraries ─────────────────────────
async function handleGet(pool, slug) {
  const { rows: creatorRows } = await pool.query(
    `SELECT id, name, slug, avatar_url AS "avatarUrl", bio, is_active AS "isActive", created_at AS "createdAt"
     FROM "Creator" WHERE slug = $1 AND is_active = true LIMIT 1`,
    [slug]
  );
  if (!creatorRows.length) {
    const err = new Error('Creator not found'); err.status = 404; throw err;
  }
  const creator = creatorRows[0];

  const { rows: itineraryRows } = await pool.query(
    `SELECT id, slug, title, subtitle, country, destination, "durationDays",
            "coverImage", type, "accessType", price, status, "isCollection"
     FROM "Itinerary"
     WHERE creator_id = $1
       AND status = 'published'
       AND "isPrivate" = false
     ORDER BY "createdAt" DESC`,
    [creator.id]
  );

  return { creator, itineraries: itineraryRows };
}

// ── Upload avatar → Vercel Blob ───────────────────────────────────────────────
async function handleUploadAvatar(body) {
  const { slug, filename, data: base64Data } = body;
  if (!slug)       throw Object.assign(new Error('slug is required'), { status: 400 });
  if (!filename)   throw Object.assign(new Error('filename is required'), { status: 400 });
  if (!base64Data) throw Object.assign(new Error('data is required'), { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(new Error('Image uploads are not configured (missing BLOB_READ_WRITE_TOKEN)'), { status: 503 });
  }

  const rawBase   = path.basename(filename);
  const ext       = rawBase.split('.').pop().toLowerCase();
  const base      = (rawBase.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'avatar';
  const ts        = Date.now().toString(36).slice(-5);
  const safeName  = `${base}-${ts}.${ext}`;
  const blobPath  = `creators/${slug}/avatar/${safeName}`;

  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
  const contentType = MIME[ext] ?? 'image/jpeg';

  let blobUrl;
  try {
    const result = await blobPut(blobPath, Buffer.from(base64Data, 'base64'), { access: 'public', contentType, addRandomSuffix: false });
    blobUrl = result.url;
  } catch (err) {
    console.error('[creators/upload-avatar] Vercel Blob put failed:', err);
    throw Object.assign(new Error('Upload failed. Please try again.'), { status: 502 });
  }

  return { url: blobUrl };
}

// ── Create creator ────────────────────────────────────────────────────────────
async function handleCreate(pool, body) {
  const { name, slug, avatarUrl = null, bio = null, userId = null, isActive = true } = body;
  if (!name || !slug) {
    const err = new Error('name and slug are required'); err.status = 400; throw err;
  }
  const { rows } = await pool.query(
    `INSERT INTO "Creator" (name, slug, avatar_url, bio, user_id, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [name, slug, avatarUrl, bio, userId || null, isActive]
  );
  return { creator: rows[0] };
}

// ── Update creator ────────────────────────────────────────────────────────────
async function handleUpdate(pool, id, body, ctx) {
  const { name, slug, avatarUrl, bio, userId, isActive } = body;
  const updates = [];
  const values  = [];
  let   idx     = 1;

  if (name      !== undefined) { updates.push(`name = $${idx++}`);        values.push(name); }
  if (slug      !== undefined) { updates.push(`slug = $${idx++}`);        values.push(slug); }
  if (avatarUrl !== undefined) { updates.push(`avatar_url = $${idx++}`); values.push(avatarUrl); }
  if (bio       !== undefined) { updates.push(`bio = $${idx++}`);        values.push(bio); }
  // Only admins can re-assign userId
  if (userId !== undefined && ctx.isAdmin) {
    updates.push(`user_id = $${idx++}`);
    values.push(userId || null);
  }
  if (isActive  !== undefined && ctx.isAdmin) {
    updates.push(`is_active = $${idx++}`);
    values.push(isActive);
  }

  if (!updates.length) {
    const err = new Error('No fields to update'); err.status = 400; throw err;
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE "Creator" SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!rows.length) {
    const err = new Error('Creator not found'); err.status = 404; throw err;
  }
  return { creator: rows[0] };
}

// ── Delete creator ────────────────────────────────────────────────────────────
async function handleDelete(pool, id) {
  // Itineraries with this creatorId will have it set to NULL via ON DELETE SET NULL
  await pool.query(`DELETE FROM "Creator" WHERE id = $1`, [id]);
  return { ok: true };
}
