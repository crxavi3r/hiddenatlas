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
    `SELECT designer_user_id FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`,
    [planId]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });
  if (rows[0].designer_user_id !== ctx.userId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatPlan(row) {
  return {
    id:              row.id,
    designerUserId:  row.designer_user_id,
    name:            row.name,
    description:     row.description,
    planType:        row.plan_type,
    audienceLabel:   row.audience_label,
    travelerMin:     row.traveler_min,
    travelerMax:     row.traveler_max,
    priceCents:      row.price_cents,
    currency:        row.currency,
    stripeProductId: row.stripe_product_id,
    stripePriceId:   row.stripe_price_id,
    isActive:        row.is_active,
    isCustomQuote:   row.is_custom_quote,
    sortOrder:       row.sort_order,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    // Computed display helpers
    displayPrice:    row.is_custom_quote
      ? 'Custom quote'
      : row.price_cents != null
        ? `€${(row.price_cents / 100).toFixed(row.price_cents % 100 === 0 ? 0 : 2)}`
        : null,
  };
}

// ── GET list (auth required) ─────────────────────────────────────────────────
async function handleList(pool, designerUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM "DesignerPricingPlan"
     WHERE designer_user_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
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
     WHERE designer_user_id = $1 AND is_active = true
     ORDER BY sort_order ASC, created_at ASC`,
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
       (id, designer_user_id, name, description, plan_type, audience_label,
        traveler_min, traveler_max, price_cents, currency,
        stripe_product_id, stripe_price_id,
        is_active, is_custom_quote, sort_order, created_at, updated_at)
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
    planType      = plan.plan_type,
    audienceLabel = plan.audience_label,
    travelerMin   = plan.traveler_min,
    travelerMax   = plan.traveler_max,
    priceCents,
    currency      = plan.currency,
    isActive      = plan.is_active,
    isCustomQuote = plan.is_custom_quote,
    sortOrder     = plan.sort_order,
  } = body;

  const newPriceCents = priceCents !== undefined ? priceCents : plan.price_cents;

  let newStripePriceId = plan.stripe_price_id;

  // Price changed AND not a custom quote → create a new Stripe Price (never update existing)
  const priceChanged = newPriceCents !== plan.price_cents;
  if (priceChanged && !isCustomQuote && newPriceCents && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      // Archive old price if it exists
      if (plan.stripe_price_id) {
        await stripe.prices.update(plan.stripe_price_id, { active: false }).catch(() => {});
      }

      // Create new price (reuse existing product if available)
      let productId = plan.stripe_product_id;
      if (!productId) {
        const product = await stripe.products.create({
          name:     name.trim(),
          metadata: { designer_user_id: plan.designer_user_id, plan_type: planType },
        });
        productId = product.id;
        // Update product id in DB below
      }

      const price = await stripe.prices.create({
        product:     productId,
        unit_amount: newPriceCents,
        currency:    currency.toLowerCase(),
        metadata:    { designer_user_id: plan.designer_user_id },
      });
      newStripePriceId = price.id;

      // Update stripeProductId too if it changed
      if (productId !== plan.stripe_product_id) {
        await pool.query(
          `UPDATE "DesignerPricingPlan" SET stripe_product_id = $1 WHERE id = $2`,
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
       plan_type       = $4,
       audience_label  = $5,
       traveler_min    = $6,
       traveler_max    = $7,
       price_cents     = $8,
       currency        = $9,
       stripe_price_id = $10,
       is_active       = $11,
       is_custom_quote = $12,
       sort_order      = $13,
       updated_at      = NOW()
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
     SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  if (!rows.length) throw Object.assign(new Error('Plan not found'), { status: 404 });

  console.log('[pricing-plans/toggle] plan toggled — id:', id, '| isActive:', rows[0].is_active);
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
       WHERE id = ANY($1) AND designer_user_id != $2`,
      [ids, ctx.userId]
    );
    if (rows.length > 0) {
      throw Object.assign(new Error('Forbidden: some plans do not belong to you'), { status: 403 });
    }
  }

  // Update sort orders in a single transaction
  for (const { id, sortOrder } of orders) {
    await pool.query(
      `UPDATE "DesignerPricingPlan" SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
      [sortOrder, id]
    );
  }

  return { ok: true };
}
