// ── Itinerary Review Queue API ────────────────────────────────────────────────
//
// GET  /api/itinerary-review?action=queue[&status=pending_review|rejected|published|all]
// GET  /api/itinerary-review?action=get&id=:id
// POST /api/itinerary-review?action=submit&id=:id     — designer submits for review
// POST /api/itinerary-review?action=approve&id=:id    — admin: approve & publish
// POST /api/itinerary-review?action=reject&id=:id     — admin: reject (body: { rejectionReason })

import pg from 'pg';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let ctx;
  try {
    ctx = await resolveUserCtx(req.headers.authorization, pool);
    if (!ctx) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    if (!ctx.isAdmin && !ctx.isDesigner) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
  } catch (err) {
    await pool.end();
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const action = req.query.action;
  const id     = req.query.id;

  try {
    if (req.method === 'GET') {
      if (action === 'queue') {
        if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });
        return res.json(await handleQueue(pool, req.query.status || 'pending_review'));
      }
      if (action === 'get') {
        if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });
        return res.json(await handleGet(pool, id));
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      if (action === 'submit')  return res.json(await handleSubmit(pool, id, ctx));
      if (action === 'approve') {
        if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });
        return res.json(await handleApprove(pool, id, body, ctx));
      }
      if (action === 'reject') {
        if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });
        return res.json(await handleReject(pool, id, body, ctx));
      }
      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[itinerary-review]', err);
    const msg = err.message?.includes('does not exist')
      ? `Database schema is not up to date — ${err.message}`
      : err.message;
    return res.status(err.status ?? 500).json({ error: msg });
  } finally {
    await pool.end();
  }
}

// ── Queue (admin) ─────────────────────────────────────────────────────────────
// Returns itineraries filtered by review status with creator + reviewer details.
async function handleQueue(pool, statusFilter) {
  const VALID = ['pending_review', 'rejected', 'published', 'all'];
  const filter = VALID.includes(statusFilter) ? statusFilter : 'pending_review';

  const whereClause = filter === 'all'
    ? `WHERE i.status IN ('pending_review', 'rejected', 'published') AND i."reviewedAt" IS NOT NULL OR i.status = 'pending_review'`
    : filter === 'published'
      ? `WHERE i.status = 'published' AND i."publishedAt" IS NOT NULL`
      : `WHERE i.status = $1`;

  const params = (filter === 'all' || filter === 'published') ? [] : [filter];

  const { rows } = await pool.query(`
    SELECT
      i.id, i.slug, i.title, i.subtitle, i.destination, i.country, i."durationDays",
      i."coverImage", i.status, i."isPublished", i."isPrivate", i.type, i."accessType",
      i.price, i."updatedAt", i."createdAt",
      i."submittedForReviewAt", i."submittedByUserId",
      i."reviewedAt",          i."reviewedByUserId",
      i."rejectionReason",     i."reviewMessage",
      i."publishedAt",
      c.name   AS creator_name,
      c.slug   AS creator_slug,
      c.avatar_url AS creator_avatar,
      sub.name AS submitted_by_name,
      sub.email AS submitted_by_email,
      rev.name AS reviewed_by_name
    FROM "Itinerary" i
    LEFT JOIN "Creator" c   ON c.id = i.creator_id
    LEFT JOIN "User"    sub ON sub.id = i."submittedByUserId"
    LEFT JOIN "User"    rev ON rev.id = i."reviewedByUserId"
    ${whereClause}
    ORDER BY
      CASE WHEN i.status = 'pending_review' THEN 0
           WHEN i.status = 'rejected'       THEN 1
           ELSE 2 END,
      i."submittedForReviewAt" DESC NULLS LAST,
      i."updatedAt" DESC
  `, params);

  return { itineraries: rows, count: rows.length };
}

// ── Get single itinerary with review fields (admin) ───────────────────────────
async function handleGet(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(`
    SELECT
      i.*,
      c.name   AS creator_name,
      c.slug   AS creator_slug,
      c.avatar_url AS creator_avatar,
      sub.name  AS submitted_by_name,
      sub.email AS submitted_by_email,
      rev.name  AS reviewed_by_name,
      rev.email AS reviewed_by_email
    FROM "Itinerary" i
    LEFT JOIN "Creator" c   ON c.id = i.creator_id
    LEFT JOIN "User"    sub ON sub.id = i."submittedByUserId"
    LEFT JOIN "User"    rev ON rev.id = i."reviewedByUserId"
    WHERE i.id = $1 LIMIT 1
  `, [id]);
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { itinerary: rows[0] };
}

// ── Submit for review (designer or admin) ─────────────────────────────────────
// Sets status → pending_review, isPublished → false, clears previous review state.
export async function handleSubmit(pool, id, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  // Ownership check for non-admin
  if (!ctx.isAdmin) {
    const { rows: ownership } = await pool.query(
      `SELECT creator_id AS "creatorId", status FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
    );
    if (!ownership.length) throw Object.assign(new Error('Not found'), { status: 404 });
    if (ownership[0].creatorId !== ctx.creatorId) {
      throw Object.assign(new Error('You can only submit your own itineraries for review.'), { status: 403 });
    }
    const currentStatus = ownership[0].status;
    if (!['draft', 'rejected'].includes(currentStatus)) {
      throw Object.assign(
        new Error(`Cannot submit: itinerary is already ${currentStatus}.`),
        { status: 422 }
      );
    }
  }

  // ctx.userId is User.id for real DB rows; for admin-email-fallback it may be clerkId.
  // Only store submittedByUserId when we have a confirmed real User row.
  const submittedByUserId = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  const { rows } = await pool.query(`
    UPDATE "Itinerary" SET
      status                = 'pending_review',
      "isPublished"         = false,
      "submittedForReviewAt" = NOW(),
      "submittedByUserId"   = $2,
      "reviewedAt"          = NULL,
      "reviewedByUserId"    = NULL,
      "reviewMessage"       = NULL,
      "updatedAt"           = NOW()
    WHERE id = $1
    RETURNING id, slug, status, "isPublished", "submittedForReviewAt", "submittedByUserId"
  `, [id, submittedByUserId]);

  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { itinerary: rows[0], message: 'Submitted for admin review.' };
}

// ── Approve & publish (admin only) ────────────────────────────────────────────
async function handleApprove(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const reviewMessage = (body.reviewMessage || '').trim() || null;

  // Validate: premium itineraries need a Stripe Price ID
  const { rows: check } = await pool.query(
    `SELECT type, "stripePriceId", "pricingPlanId" FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!check.length) throw Object.assign(new Error('Not found'), { status: 404 });
  if (check[0].type === 'premium' && !check[0].stripePriceId && !check[0].pricingPlanId) {
    throw Object.assign(
      new Error('Cannot approve: premium itinerary has no Stripe Price ID. Assign a pricing plan first.'),
      { status: 422 }
    );
  }

  const reviewerUserId = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  const { rows } = await pool.query(`
    UPDATE "Itinerary" SET
      status              = 'published',
      "isPublished"       = true,
      "isPrivate"         = CASE
        WHEN type != 'custom' THEN false
        ELSE "isPrivate"
      END,
      "reviewedAt"        = NOW(),
      "reviewedByUserId"  = $2,
      "reviewMessage"     = $3,
      "rejectionReason"   = NULL,
      "publishedAt"       = NOW(),
      "updatedAt"         = NOW()
    WHERE id = $1
    RETURNING id, slug, status, "isPublished", "publishedAt", "reviewedAt"
  `, [id, reviewerUserId, reviewMessage]);

  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  // Sync linked CustomRequest
  await pool.query(
    `UPDATE "CustomRequest" SET status = 'done' WHERE "itineraryId" = $1 AND status != 'done'`,
    [id]
  ).catch(err => console.warn('[itinerary-review/approve] CustomRequest sync failed:', err.message));

  return { itinerary: rows[0], message: 'Itinerary approved and published.' };
}

// ── Reject (admin only) ───────────────────────────────────────────────────────
async function handleReject(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const rejectionReason = (body.rejectionReason || '').trim();
  if (!rejectionReason) {
    throw Object.assign(new Error('Rejection reason is required.'), { status: 422 });
  }

  const reviewerUserId = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  const { rows } = await pool.query(`
    UPDATE "Itinerary" SET
      status             = 'rejected',
      "isPublished"      = false,
      "reviewedAt"       = NOW(),
      "reviewedByUserId" = $2,
      "rejectionReason"  = $3,
      "reviewMessage"    = $3,
      "updatedAt"        = NOW()
    WHERE id = $1
    RETURNING id, slug, status, "isPublished", "rejectionReason", "reviewedAt"
  `, [id, reviewerUserId, rejectionReason]);

  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { itinerary: rows[0], message: 'Itinerary rejected.' };
}
