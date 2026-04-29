// ── Designer Pricing Plans API ─────────────────────────────────────────────────
//
// GET  /api/pricing-plans?action=list                          — list plans (designer: own, admin: any)
//      Optional for admin: &designerUserId=:id
// GET  /api/pricing-plans?action=list-public                   — active plans only (no auth)
//      Requires: &designerSlug=:slug  OR  &designerUserId=:id
// POST /api/pricing-plans?action=create                        — create plan (Stripe if !isCustomQuote)
// POST /api/pricing-plans?action=update&id=:id                 — update plan
// POST /api/pricing-plans?action=toggle&id=:id                 — toggle isActive (soft disable)
// POST /api/pricing-plans?action=reorder                       — update sortOrder for multiple plans

import pg      from 'pg';
import Stripe  from 'stripe';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

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
    // ── Public GET actions (no auth) ────────────────────────────────────────
    if (req.method === 'GET' && action === 'list-public') {
      const designerSlug   = req.query.designerSlug || null;
      const designerUserId = req.query.designerUserId || null;
      return res.json(await handleListPublic(pool, designerSlug, designerUserId));
    }

    // ── Auth-required actions ────────────────────────────────────────────────
    const ctx = await resolveUserCtx(req.headers.authorization, pool);
    if (!ctx) return res.status(401).json({ error: 'Unauthorized' });
    if (!ctx.isAdmin && !ctx.isDesigner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      if (action === 'list') {
        const targetUserId = ctx.isAdmin ? (req.query.designerUserId || ctx.userId) : ctx.userId;
        return res.json(await handleList(pool, targetUserId));
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
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
      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[pricing-plans]', err);
    return res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

// ── Ownership check — throws 403 if caller is not admin and plan doesn't belong to them ──
async function assertPlanOwner(pool, planId, ctx) {
  if (ctx.isAdmin) return;
  const { rows } = await pool.query(
    `SELECT "designerUserId" FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`,
    [planId]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });
  if (rows[0].designerUserId !== ctx.userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    // Computed display helpers
    displayPrice:    row.isCustomQuote
      ? 'Custom quote'
      : row.priceCents != null
        ? `€${(row.priceCents / 100).toFixed(row.priceCents % 100 === 0 ? 0 : 2)}`
        : null,
  };
}

// ── GET list (auth required) ─────────────────────────────────────────────────
async function handleList(pool, designerUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM "DesignerPricingPlan"
     WHERE "designerUserId" = $1
     ORDER BY "sortOrder" ASC, "createdAt" ASC`,
    [designerUserId]
  );
  return { plans: rows.map(formatPlan) };
}

// ── GET list-public (no auth) ─────────────────────────────────────────────────
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

// ── POST create ───────────────────────────────────────────────────────────────
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

  // Admin can create plans for any designer; designer creates for themselves
  const designerUserId = ctx.isAdmin ? (bodyDesignerUserId || ctx.userId) : ctx.userId;

  let stripeProductId = null;
  let stripePriceId   = null;

  if (!isCustomQuote && priceCents && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      const product = await stripe.products.create({
        name:     name.trim(),
        metadata: { designer_user_id: designerUserId, plan_type: planType },
      });
      stripeProductId = product.id;

      const price = await stripe.prices.create({
        product:    product.id,
        unit_amount: priceCents,
        currency:   currency.toLowerCase(),
        metadata:   { designer_user_id: designerUserId },
      });
      stripePriceId = price.id;

      console.log('[pricing-plans/create] Stripe product + price created —', product.id, price.id);
    } catch (err) {
      console.error('[pricing-plans/create] Stripe error:', err.message);
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO "DesignerPricingPlan"
       (id, "designerUserId", name, description, "planType", "audienceLabel",
        "travelerMin", "travelerMax", "priceCents", currency,
        "stripeProductId", "stripePriceId",
        "isActive", "isCustomQuote", "sortOrder", "createdAt", "updatedAt")
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14, NOW(), NOW())
     RETURNING *`,
    [
      designerUserId, name.trim(), description || null, planType, audienceLabel || null,
      travelerMin ?? null, travelerMax ?? null, priceCents ?? null, currency,
      stripeProductId, stripePriceId,
      isActive, isCustomQuote, sortOrder,
    ]
  );

  console.log('[pricing-plans/create] plan created — id:', rows[0].id, '| designer:', designerUserId);
  return { plan: formatPlan(rows[0]) };
}

// ── POST update ───────────────────────────────────────────────────────────────
async function handleUpdate(pool, id, body, ctx) {
  await assertPlanOwner(pool, id, ctx);

  // Load current plan to detect price changes
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

  // Price changed AND not a custom quote → create a new Stripe Price (never update existing)
  const priceChanged = newPriceCents !== plan.priceCents;
  if (priceChanged && !isCustomQuote && newPriceCents && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      // Archive old price if it exists
      if (plan.stripePriceId) {
        await stripe.prices.update(plan.stripePriceId, { active: false }).catch(() => {});
      }

      // Create new price (reuse existing product if available)
      let productId = plan.stripeProductId;
      if (!productId) {
        const product = await stripe.products.create({
          name:     name.trim(),
          metadata: { designer_user_id: plan.designerUserId, plan_type: planType },
        });
        productId = product.id;
        // Update product id in DB below
      }

      const price = await stripe.prices.create({
        product:     productId,
        unit_amount: newPriceCents,
        currency:    currency.toLowerCase(),
        metadata:    { designer_user_id: plan.designerUserId },
      });
      newStripePriceId = price.id;

      // Update stripeProductId too if it changed
      if (productId !== plan.stripeProductId) {
        await pool.query(
          `UPDATE "DesignerPricingPlan" SET "stripeProductId" = $1 WHERE id = $2`,
          [productId, id]
        );
      }

      console.log('[pricing-plans/update] new Stripe price created —', price.id, '| plan:', id);
    } catch (err) {
      console.error('[pricing-plans/update] Stripe error:', err.message);
    }
  }

  // Clear Stripe IDs when switching to custom quote
  if (isCustomQuote) {
    newStripePriceId = null;
  }

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

  console.log('[pricing-plans/update] plan updated — id:', id);
  return { plan: formatPlan(rows[0]) };
}

// ── POST toggle ───────────────────────────────────────────────────────────────
async function handleToggle(pool, id, ctx) {
  await assertPlanOwner(pool, id, ctx);

  const { rows } = await pool.query(
    `UPDATE "DesignerPricingPlan"
     SET "isActive" = NOT "isActive", "updatedAt" = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });

  console.log('[pricing-plans/toggle] plan toggled — id:', id, '| isActive:', rows[0].isActive);
  return { plan: formatPlan(rows[0]) };
}

// ── POST reorder ──────────────────────────────────────────────────────────────
// body.orders = [{ id: string, sortOrder: number }, ...]
async function handleReorder(pool, body, ctx) {
  const orders = body.orders;
  if (!Array.isArray(orders) || orders.length === 0) {
    return { ok: true };
  }

  // For non-admins, verify all plans belong to this user
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

  // Update sort orders in a single transaction
  for (const { id, sortOrder } of orders) {
    await pool.query(
      `UPDATE "DesignerPricingPlan" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2`,
      [sortOrder, id]
    );
  }

  return { ok: true };
}
