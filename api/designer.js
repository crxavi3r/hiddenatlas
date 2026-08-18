// api/designer.js — Designer applications + pricing plans
//
// GET  ?action=application-status
// POST ?action=apply
// GET  ?action=list                   (auth: designer or admin; admin: ?designerUserId=)
// GET  ?action=list-public            (public; ?designerSlug= or ?designerUserId=)
// POST ?action=create
// POST ?action=update&id=
// POST ?action=toggle&id=
// POST ?action=reorder

import pg     from 'pg';
import Stripe  from 'stripe';
import { randomUUID } from 'crypto';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

export default async function handler(req, res) {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[api/designer] unhandled error:', err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

async function _handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000,
    max: 3,
  });
  pool.on('error', (err) => {
    console.error('[api/designer] pool error (non-fatal):', err.message);
  });

  try {
    const { action } = req.query;
    const id = req.query.id;

    // ── Public: list-public (no auth) ────────────────────────────────────────
    if (req.method === 'GET' && action === 'list-public') {
      const designerSlug   = req.query.designerSlug   || null;
      const designerUserId = req.query.designerUserId || null;
      return res.json(await handleListPublic(pool, designerSlug, designerUserId));
    }

    // ── Application status (GET, auth required) ──────────────────────────────
    if (req.method === 'GET' && action === 'application-status') {
      const ctx = await resolveUserCtx(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

      const { rows } = await pool.query(
        `SELECT id, status, "createdAt"
         FROM "DesignerApplication"
         WHERE "userId" = $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [ctx.userId]
      );
      const latest = rows[0] ?? null;
      const isDesignerOrAdmin = ctx.role === 'designer' || ctx.role === 'admin';
      const hasPendingApplication = latest?.status === 'pending';
      const canApply = !isDesignerOrAdmin && !hasPendingApplication;

      return res.status(200).json({
        role: ctx.role,
        hasPendingApplication,
        latestApplicationStatus: latest?.status ?? null,
        latestApplicationCreatedAt: latest?.createdAt ?? null,
        canApply,
      });
    }

    // ── Pricing: list (auth required) ────────────────────────────────────────
    if (req.method === 'GET' && action === 'list') {
      const ctx = await resolveUserCtx(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
      if (!ctx.isAdmin && !ctx.isDesigner) return res.status(403).json({ error: 'Forbidden' });
      const targetUserId = ctx.isAdmin ? (req.query.designerUserId || ctx.userId) : ctx.userId;
      return res.json(await handleList(pool, targetUserId));
    }

    // ── POST actions ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      // apply — public auth required
      if (action === 'apply') {
        const ctx = await resolveUserCtx(req.headers.authorization, pool);
        if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

        if (ctx.role === 'designer' || ctx.role === 'admin') {
          return res.status(409).json({
            error: 'already_designer',
            message: 'Your designer profile is active.',
          });
        }

        const { rows: pending } = await pool.query(
          `SELECT id FROM "DesignerApplication"
           WHERE "userId" = $1 AND status = 'pending' LIMIT 1`,
          [ctx.userId]
        );
        if (pending.length > 0) {
          return res.status(409).json({
            error: 'already_pending',
            message: 'Your application has already been received and is waiting for review.',
          });
        }

        const { fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message } = req.body ?? {};
        if (!fullName?.trim())  return res.status(400).json({ error: 'Full name is required.' });
        if (!email?.trim())     return res.status(400).json({ error: 'Email is required.' });
        if (!bio?.trim())       return res.status(400).json({ error: 'Bio is required.' });
        if (!message?.trim())   return res.status(400).json({ error: 'Message is required.' });

        const newId = randomUUID();
        const now   = new Date();
        await pool.query(
          `INSERT INTO "DesignerApplication"
             (id, "userId", "fullName", email, bio, "websiteUrl", "instagramUrl", "expertiseRegions", message, status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $10)`,
          [newId, ctx.userId, fullName.trim(), email.trim(), bio.trim(),
           websiteUrl?.trim() || null, instagramUrl?.trim() || null,
           expertiseRegions?.trim() || null, message.trim(), now]
        );
        try {
          await sendAdminNotification({ fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message });
        } catch (emailErr) {
          console.error('[api/designer/apply] admin notification email failed:', emailErr.message);
        }
        return res.status(201).json({ ok: true, applicationId: newId });
      }

      // Pricing POST actions — designer or admin
      const ctx = await resolveUserCtx(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
      if (!ctx.isAdmin && !ctx.isDesigner) return res.status(403).json({ error: 'Forbidden' });

      const body = req.body ?? {};

      if (action === 'create') {
        return res.json(await handleCreate(pool, body, ctx));
      }
      if (action === 'update') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        return res.json(await handleUpdate(pool, id, body, ctx));
      }
      if (action === 'toggle') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        return res.json(await handleToggle(pool, id, ctx));
      }
      if (action === 'reorder') {
        return res.json(await handleReorder(pool, body, ctx));
      }
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[api/designer]', err);
    return res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── Pricing plan helpers ──────────────────────────────────────────────────────

async function assertPlanOwner(pool, planId, ctx) {
  if (ctx.isAdmin) return;
  const { rows } = await pool.query(
    `SELECT "designerUserId" FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`, [planId]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });
  if (rows[0].designerUserId !== ctx.userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

function formatPlan(row) {
  return {
    id:              row.id,
    designerUserId:  row.designerUserId,
    name:            row.name,
    description:     row.description,
    planType:        row.planType,
    audienceLabel:   row.audienceLabel,
    travelerMin:     row.travelerMin,
    travelerMax:     row.travelerMax,
    priceCents:      row.priceCents,
    currency:        row.currency,
    stripeProductId: row.stripeProductId,
    stripePriceId:   row.stripePriceId,
    isActive:        row.isActive,
    isCustomQuote:   row.isCustomQuote,
    sortOrder:       row.sortOrder,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
    displayPrice: row.isCustomQuote
      ? 'Custom quote'
      : row.priceCents != null
        ? `€${(row.priceCents / 100).toFixed(row.priceCents % 100 === 0 ? 0 : 2)}`
        : null,
  };
}

async function handleList(pool, designerUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM "DesignerPricingPlan"
     WHERE "designerUserId" = $1
     ORDER BY "sortOrder" ASC, "createdAt" ASC`,
    [designerUserId]
  );
  return { plans: rows.map(formatPlan) };
}

async function handleListPublic(pool, designerSlug, designerUserId) {
  let userId = designerUserId || null;

  if (!userId && designerSlug) {
    const { rows } = await pool.query(
      `SELECT u.id FROM "Creator" c
       JOIN "User" u ON u.id = c.user_id
       WHERE c.slug = $1 AND c.is_active = true
       LIMIT 1`,
      [designerSlug]
    );
    userId = rows[0]?.id ?? null;
  }
  if (!userId) return { plans: [] };

  const { rows } = await pool.query(
    `SELECT * FROM "DesignerPricingPlan"
     WHERE "designerUserId" = $1 AND "isActive" = true
     ORDER BY "sortOrder" ASC, "createdAt" ASC`,
    [userId]
  );
  return { plans: rows.map(formatPlan) };
}

async function handleCreate(pool, body, ctx) {
  const {
    name,
    description     = null,
    planType        = 'custom',
    audienceLabel   = null,
    travelerMin     = null,
    travelerMax     = null,
    priceCents      = null,
    currency        = 'EUR',
    isActive        = true,
    isCustomQuote   = false,
    sortOrder       = 0,
    designerUserId: bodyDesignerUserId,
  } = body;

  if (!name?.trim()) throw Object.assign(new Error('name is required'), { status: 400 });

  const designerUserId = ctx.isAdmin ? (bodyDesignerUserId || ctx.userId) : ctx.userId;

  let stripeProductId = null;
  let stripePriceId   = null;

  if (!isCustomQuote && priceCents && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY);
      const product = await stripe.products.create({
        name:     name.trim(),
        metadata: { designer_user_id: designerUserId, plan_type: planType },
      });
      stripeProductId = product.id;
      const price = await stripe.prices.create({
        product:     product.id,
        unit_amount: priceCents,
        currency:    currency.toLowerCase(),
        metadata:    { designer_user_id: designerUserId },
      });
      stripePriceId = price.id;
    } catch (err) {
      console.error('[api/designer/create] Stripe error:', err.message);
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO "DesignerPricingPlan"
       (id, "designerUserId", name, description, "planType", "audienceLabel",
        "travelerMin", "travelerMax", "priceCents", currency,
        "stripeProductId", "stripePriceId",
        "isActive", "isCustomQuote", "sortOrder", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
     RETURNING *`,
    [
      designerUserId, name.trim(), description || null, planType, audienceLabel || null,
      travelerMin ?? null, travelerMax ?? null, priceCents ?? null, currency,
      stripeProductId, stripePriceId,
      isActive, isCustomQuote, sortOrder,
    ]
  );
  return { plan: formatPlan(rows[0]) };
}

async function handleUpdate(pool, id, body, ctx) {
  await assertPlanOwner(pool, id, ctx);

  const { rows: current } = await pool.query(
    `SELECT * FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!current.length) throw Object.assign(new Error('Plan not found'), { status: 404 });
  const plan = current[0];

  const {
    name          = plan.name,
    description   = plan.description,
    planType      = plan.planType,
    audienceLabel = plan.audienceLabel,
    travelerMin   = plan.travelerMin,
    travelerMax   = plan.travelerMax,
    priceCents,
    currency      = plan.currency,
    isActive      = plan.isActive,
    isCustomQuote = plan.isCustomQuote,
    sortOrder     = plan.sortOrder,
  } = body;

  const newPriceCents = priceCents !== undefined ? priceCents : plan.priceCents;
  let newStripePriceId = plan.stripePriceId;

  const priceChanged = newPriceCents !== plan.priceCents;
  if (priceChanged && !isCustomQuote && newPriceCents && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      if (plan.stripePriceId) {
        await stripe.prices.update(plan.stripePriceId, { active: false }).catch(() => {});
      }
      let productId = plan.stripeProductId;
      if (!productId) {
        const product = await stripe.products.create({
          name:     name.trim(),
          metadata: { designer_user_id: plan.designerUserId, plan_type: planType },
        });
        productId = product.id;
        await pool.query(
          `UPDATE "DesignerPricingPlan" SET "stripeProductId" = $1 WHERE id = $2`,
          [productId, id]
        );
      }
      const price = await stripe.prices.create({
        product:     productId,
        unit_amount: newPriceCents,
        currency:    currency.toLowerCase(),
        metadata:    { designer_user_id: plan.designerUserId },
      });
      newStripePriceId = price.id;
    } catch (err) {
      console.error('[api/designer/update] Stripe error:', err.message);
    }
  }
  if (isCustomQuote) newStripePriceId = null;

  const { rows } = await pool.query(
    `UPDATE "DesignerPricingPlan" SET
       name            = $2,
       description     = $3,
       "planType"      = $4,
       "audienceLabel" = $5,
       "travelerMin"   = $6,
       "travelerMax"   = $7,
       "priceCents"    = $8,
       currency        = $9,
       "stripePriceId" = $10,
       "isActive"      = $11,
       "isCustomQuote" = $12,
       "sortOrder"     = $13,
       "updatedAt"     = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      name?.trim() ?? plan.name,
      description ?? null,
      planType,
      audienceLabel ?? null,
      travelerMin ?? null,
      travelerMax ?? null,
      isCustomQuote ? null : (newPriceCents ?? null),
      currency,
      isCustomQuote ? null : newStripePriceId,
      isActive,
      isCustomQuote,
      sortOrder,
    ]
  );
  return { plan: formatPlan(rows[0]) };
}

async function handleToggle(pool, id, ctx) {
  await assertPlanOwner(pool, id, ctx);
  const { rows } = await pool.query(
    `UPDATE "DesignerPricingPlan"
     SET "isActive" = NOT "isActive", "updatedAt" = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });
  return { plan: formatPlan(rows[0]) };
}

async function handleReorder(pool, body, ctx) {
  const orders = body.orders;
  if (!Array.isArray(orders) || orders.length === 0) return { ok: true };

  if (!ctx.isAdmin) {
    const ids = orders.map(o => o.id);
    const { rows } = await pool.query(
      `SELECT id FROM "DesignerPricingPlan"
       WHERE id = ANY($1) AND "designerUserId" != $2`,
      [ids, ctx.userId]
    );
    if (rows.length > 0) {
      throw Object.assign(new Error('Forbidden: some plans do not belong to you'), { status: 403 });
    }
  }

  for (const { id, sortOrder } of orders) {
    await pool.query(
      `UPDATE "DesignerPricingPlan" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [sortOrder, id]
    );
  }
  return { ok: true };
}

// ── Email helper ──────────────────────────────────────────────────────────────

async function sendAdminNotification({ fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[api/designer] RESEND_API_KEY not set — skipping admin notification');
    return;
  }
  const { Resend } = await import('resend');
  const resend     = new Resend(process.env.RESEND_API_KEY);
  const adminTo    = process.env.ADMIN_NOTIFICATION_EMAIL ?? 'cristiano.xavier@hiddenatlas.travel';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
      <h2 style="color:#1B6B65;margin-bottom:24px;">New Designer Application</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;width:150px;vertical-align:top;">Name</td><td style="padding:8px 0;">${esc(fullName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Email</td><td style="padding:8px 0;">${esc(email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Website</td><td style="padding:8px 0;">${websiteUrl ? esc(websiteUrl) : '—'}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Instagram</td><td style="padding:8px 0;">${instagramUrl ? esc(instagramUrl) : '—'}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Expertise</td><td style="padding:8px 0;">${expertiseRegions ? esc(expertiseRegions) : '—'}</td></tr>
      </table>
      <h3 style="color:#1B6B65;margin-bottom:8px;">Bio</h3>
      <p style="line-height:1.7;background:#F4F1EC;padding:16px;border-radius:4px;margin-bottom:20px;">${esc(bio)}</p>
      <h3 style="color:#1B6B65;margin-bottom:8px;">Message</h3>
      <p style="line-height:1.7;background:#F4F1EC;padding:16px;border-radius:4px;margin-bottom:28px;">${esc(message)}</p>
      <a href="https://hiddenatlas.travel/admin/designer-applications" style="display:inline-block;background:#1B6B65;color:white;padding:12px 24px;border-radius:5px;text-decoration:none;font-weight:600;font-size:14px;">Review Application</a>
    </div>
  `;

  await resend.emails.send({
    from:    process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>',
    to:      [adminTo],
    subject: 'New HiddenAtlas designer application',
    html,
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
