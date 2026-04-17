// ── Itinerary CMS API ─────────────────────────────────────────────────────────
// Admin-only. All actions require a valid admin JWT.
//
// GET  /api/itinerary-cms?action=list
// GET  /api/itinerary-cms?action=pricing-options    — returns tiers from STRIPE_PRICE_PREMIUM_* env vars
// GET  /api/itinerary-cms?action=get&id=:id
// GET  /api/itinerary-cms?action=assets&id=:id
// GET  /api/itinerary-cms?action=scan-assets&slug=:slug
// GET  /api/itinerary-cms?action=ai-history&id=:id
// POST /api/itinerary-cms?action=create
// POST /api/itinerary-cms?action=update&id=:id
// POST /api/itinerary-cms?action=duplicate&id=:id
// POST /api/itinerary-cms?action=delete&id=:id
// POST /api/itinerary-cms?action=publish&id=:id
// POST /api/itinerary-cms?action=unpublish&id=:id
// POST /api/itinerary-cms?action=seed          — bulk-import from static data
// POST /api/itinerary-cms?action=save-asset
// POST /api/itinerary-cms?action=delete-asset&id=:assetId
// POST /api/itinerary-cms?action=toggle-asset&id=:assetId
// POST /api/itinerary-cms?action=upload-pdf&id=:id    — upload PDF blob → store pdfUrl
// POST /api/itinerary-cms?action=ai-generate

import pg                         from 'pg';
import { resolveUserCtx }         from './_lib/resolveUserCtx.js';
import { existsSync }             from 'fs';
import { readFile }               from 'fs/promises';
import path                       from 'path';
import { put as blobPut }         from '@vercel/blob';

const { Pool } = pg;

// ── Auth guard — admin OR active designer ─────────────────────────────────────
// Returns { email, isAdmin, creatorId } where creatorId is the Creator.id linked
// to this user, or null if the user has no creator profile.
// Throws 401/403 if the caller is neither admin nor an active designer.
async function verifyUser(authHeader, pool) {
  const ctx = await resolveUserCtx(authHeader, pool);
  if (!ctx) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  // Must be admin, OR a designer with an active creator profile
  if (!ctx.isAdmin && !ctx.creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return { email: ctx.email, isAdmin: ctx.isAdmin, creatorId: ctx.creatorId };
}

// ── Ownership guard for itinerary-scoped operations ───────────────────────────
// If the caller is not admin, verifies the itinerary belongs to their creator.
async function assertOwnership(pool, itineraryId, ctx) {
  if (ctx.isAdmin) return; // admins bypass ownership
  const { rows } = await pool.query(
    `SELECT creator_id AS "creatorId" FROM "Itinerary" WHERE id = $1 LIMIT 1`, [itineraryId]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  if (rows[0].creatorId !== ctx.creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
    ctx = await verifyUser(req.headers.authorization, pool);
  } catch (err) {
    await pool.end();
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const action = req.query.action;
  const id     = req.query.id;

  // Admin-only shorthand
  const adminOnly = () => {
    if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });
  };

  try {
    if (req.method === 'GET') {
      if (action === 'list')             return res.json(await handleList(pool, ctx));
      if (action === 'get')              return res.json(await handleGet(pool, id, ctx));
      if (action === 'assets')           { await assertOwnership(pool, id, ctx); return res.json(await handleListAssets(pool, id)); }
      if (action === 'scan-assets')      { adminOnly(); return res.json(await handleScanAssets(req.query.slug)); }
      if (action === 'ai-history')       { await assertOwnership(pool, id, ctx); return res.json(await handleAIHistory(pool, id)); }
      if (action === 'linked-request')   { adminOnly(); return res.json(await handleLinkedRequest(pool, id)); }
      if (action === 'pricing-options')  return res.json(handlePricingOptions());
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      if (action === 'create')       return res.json(await handleCreate(pool, body, ctx));
      if (action === 'update')       { await assertOwnership(pool, id, ctx); return res.json(await handleUpdate(pool, id, body, ctx)); }
      if (action === 'duplicate')    { await assertOwnership(pool, id, ctx); return res.json(await handleDuplicate(pool, id)); }
      if (action === 'delete')       { adminOnly(); return res.json(await handleDelete(pool, id)); }
      if (action === 'publish')      { await assertOwnership(pool, id, ctx); return res.json(await handleSetStatus(pool, id, 'published')); }
      if (action === 'unpublish')    { await assertOwnership(pool, id, ctx); return res.json(await handleSetStatus(pool, id, 'draft')); }
      if (action === 'seed')         { adminOnly(); return res.json(await handleSeed(pool, body)); }
      if (action === 'bulk-publish') { adminOnly(); return res.json(await handleBulkPublish(pool)); }
      if (action === 'save-asset')   return res.json(await handleSaveAsset(pool, body, ctx));
      if (action === 'upload-asset') return res.json(await handleUploadAsset(pool, body, ctx));
      if (action === 'delete-asset') return res.json(await handleDeleteAsset(pool, id, ctx));
      if (action === 'toggle-asset') return res.json(await handleToggleAsset(pool, id, ctx));
      if (action === 'upload-pdf')        { await assertOwnership(pool, id, ctx); return res.json(await handleUploadPDF(pool, id, body)); }
      if (action === 'update-pdf-status') { await assertOwnership(pool, id, ctx); return res.json(await handleUpdatePDFStatus(pool, id, body)); }
      if (action === 'ai-generate')       { adminOnly(); return res.json(await handleAIGenerate(pool, body, ctx.email)); }
      if (action === 'backfill-pricing')  { adminOnly(); return res.json(await handleBackfillPricing(pool)); }
      if (action === 'resolve-images')    return res.json(await handleResolveImages(body));
      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[itinerary-cms]', err);
    const msg = err.message?.includes('does not exist')
      ? 'Database schema is not up to date. Run: npm run migrate'
      : err.message;
    return res.status(err.status ?? 500).json({ error: msg });
  } finally {
    await pool.end();
  }
}

// ── Pricing options (from env) ────────────────────────────────────────────────
// The 'complete' (€29) tier uses the same fallback chain as getVariantPriceId so
// existing STRIPE_PRICE_PREMIUM / STRIPE_PRICE_ID values also surface it correctly.
// Returns only tiers whose price ID resolves to a non-empty string.
// Each option: { key, label, displayPrice, price, currency, stripePriceId }
function handlePricingOptions() {
  const completeId  = process.env.STRIPE_PRICE_PREMIUM_COMPLETE || process.env.STRIPE_PRICE_PREMIUM || process.env.STRIPE_PRICE_ID || '';
  const essentialId = process.env.STRIPE_PRICE_PREMIUM_ESSENTIAL || '';
  const shortId     = process.env.STRIPE_PRICE_PREMIUM_SHORT     || '';

  const tiers = [
    { key: 'premium_short',     label: 'Premium Itinerary Short',     displayPrice: '€14', price: 14, currency: 'EUR', stripePriceId: shortId     },
    { key: 'premium_essential', label: 'Premium Itinerary Essential', displayPrice: '€19', price: 19, currency: 'EUR', stripePriceId: essentialId },
    { key: 'premium_complete',  label: 'Premium Itinerary',           displayPrice: '€29', price: 29, currency: 'EUR', stripePriceId: completeId  },
  ];

  const options = tiers.filter(t => t.stripePriceId);
  return { options };
}

// ── List all itineraries (CMS view) ──────────────────────────────────────────
// Admin: all itineraries.  Creator: only itineraries assigned to them.
// Returns creator name/slug alongside each row for display in the CMS table.
async function handleList(pool, ctx) {
  const creatorFilter = ctx.isAdmin ? '' : `WHERE i.creator_id = $1`;
  const params        = ctx.isAdmin ? [] : [ctx.creatorId];

  const { rows } = await pool.query(`
    SELECT i.*,
           COUNT(p.id)::int AS purchase_count,
           c.name  AS creator_name,
           c.slug  AS creator_slug
    FROM "Itinerary" i
    LEFT JOIN "Purchase" p ON p."itineraryId" = i.id
    LEFT JOIN "Creator"  c ON c.id = i.creator_id
    ${creatorFilter}
    GROUP BY i.id, c.name, c.slug
    ORDER BY i."createdAt" DESC
  `, params);
  const itineraries = rows.filter(r => !r.isCollection);
  const collections = rows.filter(r => r.isCollection);
  return { itineraries, collections };
}

// ── Get single itinerary with full content ────────────────────────────────────
async function handleGet(pool, id, ctx = null) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(
    `SELECT i.*, c.name AS creator_name, c.slug AS creator_slug, c.avatar_url AS creator_avatar
     FROM "Itinerary" i
     LEFT JOIN "Creator" c ON c.id = i.creator_id
     WHERE i.id = $1 LIMIT 1`,
    [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const row = rows[0];
  // Non-admin creators can only view their own itineraries
  if (ctx && !ctx.isAdmin && ctx.creatorId && row.creator_id !== ctx.creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return { itinerary: row };
}

// ── Create new itinerary ──────────────────────────────────────────────────────
async function handleCreate(pool, body, ctx) {
  const {
    title = 'Untitled Itinerary',
    subtitle = '',
    slug,
    destination = '',
    country = '',
    region = '',
    durationDays = null,
    type = 'free',
    isPrivate = false,
    stripePriceId = null,
    pricingKey = null,
    coverImage = '',
    content = {},
    status = 'draft',
  } = body;

  if (!slug) throw Object.assign(new Error('slug is required'), { status: 400 });

  // Creator assignment: non-admin creators are forced to their own creatorId
  let creatorId = body.creatorId || null;
  if (!ctx.isAdmin) {
    creatorId = ctx.creatorId; // override regardless of what was sent
  }

  const rawContent   = typeof content === 'string'
    ? (() => { try { return JSON.parse(content); } catch { return {}; } })()
    : (content ?? {});
  const finalContent = mergeEmptyContent(rawContent);
  const finalType       = ['free', 'premium', 'custom'].includes(type) ? type : 'free';
  const finalAccessType = finalType === 'free' ? 'free' : 'paid';
  const finalPrivate    = finalType === 'custom' ? true : Boolean(isPrivate);
  const derivedCoverImage = finalContent.hero?.coverImage || coverImage || '';

  const { rows } = await pool.query(
    `INSERT INTO "Itinerary"
       (title, subtitle, slug, destination, country, region, "durationDays",
        "accessType", price, "stripePriceId", "pricingKey", "coverImage", description,
        type, "isPrivate", "isCollection", status, "isPublished", content, "schemaVersion", "updatedAt",
        creator_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,$16,$17,$18,1,NOW(),$19)
     RETURNING *`,
    [
      title, subtitle, slug, destination, country, region, durationDays,
      finalAccessType, 0, stripePriceId || null, pricingKey || null,
      derivedCoverImage,
      finalContent.summary?.shortDescription || '',
      finalType, finalPrivate,
      status, status === 'published',
      JSON.stringify(finalContent),
      creatorId,
    ]
  );
  return { itinerary: rows[0] };
}

// ── Update itinerary ──────────────────────────────────────────────────────────
async function handleUpdate(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const {
    title, subtitle, slug, destination, country, region, durationDays,
    accessType, stripePriceId, pricingKey, coverImage, content, status,
    type, isPrivate, isCollection,
  } = body;

  // creatorId is IMMUTABLE after creation — never update it here.
  // If the payload contains a creatorId, log a warning and discard it.
  if (body.creatorId !== undefined) {
    console.warn(
      `[itinerary-cms/update] BLOCKED: payload contained creatorId="${body.creatorId}" for id=${id} — discarded. creatorId is immutable after creation.`
    );
  }

  // Defensive parse: body parsers sometimes deliver JSONB fields as strings
  const rawContent = typeof content === 'string'
    ? (() => { try { return JSON.parse(content); } catch { return {}; } })()
    : (content ?? {});
  const finalContent = mergeEmptyContent(rawContent);

  console.log(`[itinerary-cms/update] id=${id} days=${finalContent.days?.length ?? 0}`);

  // Derive mirrored columns
  const derivedCoverImage  = finalContent.hero?.coverImage || coverImage || '';
  const derivedDescription = finalContent.summary?.shortDescription || '';
  const derivedIsPublished = status === 'published';

  // type/accessType/isPrivate — null means "leave unchanged"
  const typeParam       = typeof type === 'string' ? type : null;
  const isPrivateParam  = typeof isPrivate === 'boolean' ? isPrivate : null;
  const accessTypeParam = typeParam != null
    ? (typeParam === 'free' ? 'free' : 'paid')
    : (accessType ?? null);

  const { rows } = await pool.query(
    `UPDATE "Itinerary" SET
       title           = COALESCE($2, title),
       subtitle        = COALESCE($3, subtitle),
       slug            = COALESCE($4, slug),
       destination     = COALESCE(NULLIF($5,''), destination),
       country         = COALESCE(NULLIF($6,''), country),
       region          = COALESCE(NULLIF($7,''), region),
       "durationDays"  = COALESCE($8, "durationDays"),
       "accessType"    = COALESCE($9, "accessType"),
       "stripePriceId" = $10,
       "pricingKey"    = $11,
       "coverImage"    = COALESCE(NULLIF($12,''), "coverImage"),
       description     = COALESCE(NULLIF($13,''), description),
       status          = COALESCE($14, status),
       "isPublished"   = $15,
       content         = $16::jsonb,
       type            = COALESCE($17, type),
       "isPrivate"     = COALESCE($18::boolean, "isPrivate"),
       "isCollection"  = COALESCE($19::boolean, "isCollection"),
       "pdfStatus"     = 'stale',
       "updatedAt"     = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      title ?? null,
      subtitle ?? null,
      slug ?? null,
      destination ?? null,
      country ?? null,
      region ?? null,
      durationDays ?? null,
      accessTypeParam,
      stripePriceId ?? null,
      pricingKey ?? null,
      derivedCoverImage,
      derivedDescription,
      status ?? null,
      derivedIsPublished,
      JSON.stringify(finalContent),
      typeParam,
      isPrivateParam,
      typeof isCollection === 'boolean' ? isCollection : null,
    ]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  // Auto-sync linked CustomRequest status with itinerary status.
  // Draft save  → advance open → in_progress ("Building your itinerary")
  // Publish     → advance any non-done → done ("Ready")
  // Never go backwards.
  if (derivedIsPublished) {
    await pool.query(
      `UPDATE "CustomRequest" SET status = 'done'
       WHERE "itineraryId" = $1 AND status != 'done'`,
      [id]
    ).catch(err => console.warn('[itinerary-cms/update] CustomRequest sync failed:', err.message));
  } else {
    await pool.query(
      `UPDATE "CustomRequest" SET status = 'in_progress'
       WHERE "itineraryId" = $1 AND status = 'open'`,
      [id]
    ).catch(err => console.warn('[itinerary-cms/update] CustomRequest draft sync failed:', err.message));
  }

  return { itinerary: rows[0] };
}

// ── Duplicate itinerary ───────────────────────────────────────────────────────
async function handleDuplicate(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const src = await handleGet(pool, id);
  const base = src.itinerary;

  // Generate a unique slug
  let newSlug = `${base.slug}-copy`;
  const { rows: existing } = await pool.query(
    `SELECT slug FROM "Itinerary" WHERE slug LIKE $1 ORDER BY slug`, [`${newSlug}%`]
  );
  if (existing.length > 0) {
    newSlug = `${base.slug}-copy-${existing.length + 1}`;
  }

  const { rows } = await pool.query(
    `INSERT INTO "Itinerary"
       (title, subtitle, slug, destination, country, region, "durationDays",
        "accessType", price, "stripePriceId", "coverImage", description, "pdfUrl",
        type, "isPrivate", status, "isPublished", content, "schemaVersion", "updatedAt",
        creator_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',false,$16,$17,NOW(),$18)
     RETURNING *`,
    [
      `${base.title} (Copy)`,
      base.subtitle,
      newSlug,
      base.destination,
      base.country,
      base.region,
      base.durationDays,
      base.accessType,
      base.price,
      base.stripePriceId,
      base.coverImage,
      base.description,
      null,
      base.type ?? 'free',
      base.isPrivate ?? false,
      JSON.stringify(base.content ?? {}),
      base.schemaVersion ?? 1,
      base.creator_id ?? null,
    ]
  );
  return { itinerary: rows[0] };
}

// ── Delete itinerary ──────────────────────────────────────────────────────────
async function handleDelete(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows: purchases } = await pool.query(
    `SELECT id FROM "Purchase" WHERE "itineraryId" = $1 LIMIT 1`, [id]
  );
  if (purchases.length > 0) {
    throw Object.assign(
      new Error('Cannot delete — this itinerary has purchases. Unpublish it instead.'),
      { status: 409 }
    );
  }

  await pool.query(`DELETE FROM "ItineraryAsset" WHERE "itineraryId" = $1`, [id]);
  await pool.query(`DELETE FROM "Itinerary" WHERE id = $1`, [id]);
  return { ok: true };
}

// ── Publish / Unpublish ───────────────────────────────────────────────────────
async function handleSetStatus(pool, id, status) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  // Validate premium itineraries have a Stripe Price ID before publishing
  if (status === 'published') {
    const { rows: check } = await pool.query(
      `SELECT type, "stripePriceId" FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
    );
    if (!check.length) throw Object.assign(new Error('Not found'), { status: 404 });
    if (check[0].type === 'premium' && !check[0].stripePriceId) {
      throw Object.assign(
        new Error('Cannot publish: premium itinerary has no Stripe Price ID. Select a pricing plan first.'),
        { status: 422 }
      );
    }
  }

  const { rows } = await pool.query(
    `UPDATE "Itinerary"
     SET status = $2, "isPublished" = $3, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, slug, status, "isPublished"`,
    [id, status, status === 'published']
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  // Auto-sync linked CustomRequest status with itinerary status.
  if (status === 'published') {
    await pool.query(
      `UPDATE "CustomRequest" SET status = 'done'
       WHERE "itineraryId" = $1 AND status != 'done'`,
      [id]
    ).catch(err => console.warn('[itinerary-cms/set-status] CustomRequest sync failed:', err.message));
  } else if (status === 'draft') {
    await pool.query(
      `UPDATE "CustomRequest" SET status = 'in_progress'
       WHERE "itineraryId" = $1 AND status = 'open'`,
      [id]
    ).catch(err => console.warn('[itinerary-cms/set-status] CustomRequest draft sync failed:', err.message));
  }

  return { itinerary: rows[0] };
}

// ── Backfill pricing on existing premium itineraries ─────────────────────────
// Sets stripePriceId + pricingKey for all premium itineraries in the DB:
//   - USA variants (california-american-west-*) are mapped by their variant tier
//   - All other premium itineraries get the 'premium_complete' (€29) plan
// Idempotent: safe to run multiple times.
async function handleBackfillPricing(pool) {
  const { options } = handlePricingOptions();
  const completeOpt  = options.find(o => o.key === 'premium_complete');
  const essentialOpt = options.find(o => o.key === 'premium_essential');
  const shortOpt     = options.find(o => o.key === 'premium_short');

  if (!completeOpt) {
    throw Object.assign(
      new Error('Cannot backfill: STRIPE_PRICE_PREMIUM_COMPLETE (or STRIPE_PRICE_ID) is not set'),
      { status: 422 }
    );
  }

  const results = [];

  // ── 1. All non-USA premium itineraries → premium_complete ─────────────────
  const { rowCount: defaultCount } = await pool.query(
    `UPDATE "Itinerary"
     SET "stripePriceId" = $1, "pricingKey" = 'premium_complete', "updatedAt" = NOW()
     WHERE type = 'premium'
       AND slug NOT LIKE 'california-american-west-%'`,
    [completeOpt.stripePriceId]
  );
  results.push({ rule: 'non-USA premium → complete', updated: defaultCount });

  // ── 2. USA complete (16-day) → premium_complete ───────────────────────────
  const { rowCount: c16 } = await pool.query(
    `UPDATE "Itinerary"
     SET "stripePriceId" = $1, "pricingKey" = 'premium_complete', "updatedAt" = NOW()
     WHERE slug = 'california-american-west-16-days' AND type = 'premium'`,
    [completeOpt.stripePriceId]
  );
  results.push({ rule: 'california-american-west-16-days → complete', updated: c16 });

  // ── 3. USA essential (12-day) → premium_essential ────────────────────────
  if (essentialOpt) {
    const { rowCount: c12 } = await pool.query(
      `UPDATE "Itinerary"
       SET "stripePriceId" = $1, "pricingKey" = 'premium_essential', "updatedAt" = NOW()
       WHERE slug = 'california-american-west-12-days' AND type = 'premium'`,
      [essentialOpt.stripePriceId]
    );
    results.push({ rule: 'california-american-west-12-days → essential', updated: c12 });
  } else {
    results.push({ rule: 'california-american-west-12-days → essential', updated: 0, skipped: 'STRIPE_PRICE_PREMIUM_ESSENTIAL not set' });
  }

  // ── 4. USA short (8-day) → premium_short ────────────────────────────────
  if (shortOpt) {
    const { rowCount: c8 } = await pool.query(
      `UPDATE "Itinerary"
       SET "stripePriceId" = $1, "pricingKey" = 'premium_short', "updatedAt" = NOW()
       WHERE slug = 'california-american-west-8-days' AND type = 'premium'`,
      [shortOpt.stripePriceId]
    );
    results.push({ rule: 'california-american-west-8-days → short', updated: c8 });
  } else {
    results.push({ rule: 'california-american-west-8-days → short', updated: 0, skipped: 'STRIPE_PRICE_PREMIUM_SHORT not set' });
  }

  console.log('[itinerary-cms/backfill-pricing] results:', JSON.stringify(results));
  return { ok: true, results };
}

// ── Seed from static data ─────────────────────────────────────────────────────
// Accepts { itineraries: [...] } — mapped from the static itineraries.js shape.
// Uses INSERT ... ON CONFLICT(slug) DO UPDATE to upsert all records.
// Existing records with purchases are never deleted.
async function handleSeed(pool, body) {
  const items = body.itineraries;
  if (!Array.isArray(items) || !items.length) {
    throw Object.assign(new Error('itineraries array is required'), { status: 400 });
  }

  let inserted = 0;
  let updated  = 0;

  for (const item of items) {
    const slug = item.id || item.slug;
    if (!slug) continue;

    const type         = item.isPremium ? 'premium' : 'free';
    const accessType   = type === 'free' ? 'free' : 'paid';
    const durationDays = parseDurationDays(item.duration);
    const destination  = item.region || item.country || '';
    const isCollection = Boolean(item.isParent);

    const content = buildContentFromStatic(item);

    const { rowCount, rows } = await pool.query(
      `INSERT INTO "Itinerary"
         (id, title, subtitle, slug, destination, country, region, "durationDays",
          "accessType", price, "stripePriceId", "coverImage", description,
          type, "isPrivate", "isCollection", status, "isPublished", content, "schemaVersion", "updatedAt")
       VALUES (
         gen_random_uuid()::text, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         $13, false, $15, 'published', true, $14::jsonb, 1, NOW()
       )
       ON CONFLICT (slug) DO UPDATE SET
         title           = EXCLUDED.title,
         subtitle        = EXCLUDED.subtitle,
         destination     = EXCLUDED.destination,
         country         = EXCLUDED.country,
         region          = EXCLUDED.region,
         "durationDays"  = EXCLUDED."durationDays",
         "accessType"    = EXCLUDED."accessType",
         price           = EXCLUDED.price,
         "coverImage"    = EXCLUDED."coverImage",
         description     = EXCLUDED.description,
         type            = EXCLUDED.type,
         "isPrivate"     = EXCLUDED."isPrivate",
         "isCollection"  = EXCLUDED."isCollection",
         status          = EXCLUDED.status,
         "isPublished"   = EXCLUDED."isPublished",
         content         = EXCLUDED.content,
         "updatedAt"     = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        item.title, item.subtitle || '', slug, destination, item.country || '', item.region || '',
        durationDays, accessType, item.price || 0, null,
        item.coverImage || '', item.shortDescription || item.description || '',
        type,
        JSON.stringify(content),
        isCollection,
      ]
    );
    if (rows[0]?.inserted) inserted++;
    else updated++;
  }

  return { ok: true, inserted, updated, total: items.length };
}

// ── Bulk publish — mark all public (non-custom, non-private) itineraries as published ──
async function handleBulkPublish(pool) {
  const { rows } = await pool.query(`
    UPDATE "Itinerary"
    SET status = 'published', "isPublished" = true, "updatedAt" = NOW()
    WHERE (type IS NULL OR type != 'custom')
      AND "isPrivate" = false
      AND "isCollection" = false
      AND "isPublished" = false
    RETURNING id, slug, type, "accessType", price
  `);
  return { ok: true, published: rows.length, items: rows };
}

// ── PDF version helper ────────────────────────────────────────────────────────
// Increments the decimal part of a version string (v1.0 → v1.1, v1.9 → v1.10).
// If current is null/missing, treats it as v1.0 and returns v1.1.
function nextPdfVersion(current) {
  const base  = current || 'v1.0';
  const match = base.match(/^v(\d+)\.(\d+)$/);
  if (!match) return 'v1.1';
  return `v${match[1]}.${parseInt(match[2], 10) + 1}`;
}

// ── Upload PDF → Vercel Blob → store pdfUrl ───────────────────────────────────
async function handleUploadPDF(pool, id, body) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { data: base64Data } = body;
  if (!base64Data) throw Object.assign(new Error('data (base64) is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT slug, "pdfUrl", pdf_version FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const { slug, pdfUrl: previousPdfUrl, pdf_version: currentVersion } = rows[0];

  // Use a timestamp in the filename so each generation gets a unique path.
  // This avoids the Vercel Blob "already exists" error and ensures each new
  // version has its own URL — no CDN cache collision possible.
  const timestamp  = Date.now();
  const filename   = `${slug}-hiddenatlas-${timestamp}.pdf`;
  const blobPath   = `itineraries/${slug}/pdf/${filename}`;
  const buffer     = Buffer.from(base64Data, 'base64');
  const newVersion = nextPdfVersion(currentVersion);

  console.log('[upload-pdf] start — slug:', slug, '| path:', blobPath, '| size:', buffer.length, 'bytes');

  const result = await blobPut(blobPath, buffer, {
    access: 'private',
    contentType: 'application/pdf',
  });

  console.log('[upload-pdf] blob upload success — url:', result.url);
  console.log('Generated blob url', result.url);

  const { rows: updated } = await pool.query(
    `UPDATE "Itinerary"
     SET "pdfUrl" = $2, pdf_url = $2, "pdfStatus" = 'ready', "pdfGeneratedAt" = NOW(),
         "pdfError" = NULL, pdf_version = $3, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, slug, "pdfUrl", pdf_url, "pdfStatus", "pdfGeneratedAt", pdf_version`,
    [id, result.url, newVersion]
  );

  console.log('[upload-pdf] DB updated — pdfUrl + pdf_url saved, version:', currentVersion, '->', newVersion,
    '| previous url was:', previousPdfUrl || '(none)');
  console.log('Saved pdfUrl in DB', result.url);

  return { ok: true, pdfUrl: result.url, pdfVersion: newVersion, itinerary: updated[0] };
}

// ── Update PDF status (called by client on failure to record stale/failed state) ──
async function handleUpdatePDFStatus(pool, id, body) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { status: pdfStatus, error: pdfError } = body;
  const allowed = ['generating', 'failed', 'stale', 'ready'];
  if (!allowed.includes(pdfStatus)) {
    throw Object.assign(new Error(`pdfStatus must be one of: ${allowed.join(', ')}`), { status: 400 });
  }

  const { rows } = await pool.query(
    `UPDATE "Itinerary"
     SET "pdfStatus" = $2,
         "pdfError"  = $3,
         "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, "pdfStatus", "pdfError"`,
    [id, pdfStatus, pdfError ?? null]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { ok: true, itinerary: rows[0] };
}

// ── Assets: list ──────────────────────────────────────────────────────────────
async function handleListAssets(pool, itineraryId) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "ItineraryAsset"
       WHERE "itineraryId" = $1
       ORDER BY "assetType", "dayNumber" NULLS LAST, "sortOrder", "createdAt"`,
      [itineraryId]
    );
    return { assets: rows };
  } catch (err) {
    if (err.message?.includes('does not exist')) {
      console.error('[itinerary-cms] ItineraryAsset table missing — run: npm run migrate');
      return { assets: [], _warning: 'DB schema not yet migrated. Run: npm run migrate' };
    }
    throw err;
  }
}

// ── Assets: scan filesystem via pre-built manifest ────────────────────────────
// Reads public/itineraries/<slug>/manifest.json (committed, tiny — filenames only).
// Returns static CDN URLs (/itineraries/<slug>/...) — no binary content in bundle.
// Images are served as static assets by Vercel CDN, not through this function.
async function handleScanAssets(slug) {
  if (!slug) throw Object.assign(new Error('slug is required'), { status: 400 });

  const manifestPath = path.join(process.cwd(), 'public', 'itineraries', slug, 'manifest.json');
  if (!existsSync(manifestPath)) return { assets: [] };

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch { return { assets: [] }; }

  const base = `/itineraries/${slug}`;
  const assets = [];

  function altFromFilename(f) { return f.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '); }

  // Hero
  if (manifest.heroFile) {
    assets.push({
      id: null, assetType: 'hero',
      url:     `${base}/${manifest.heroFile}`,
      alt:     manifest.title ? `${manifest.title} cover` : `${slug} cover`,
      caption: '', source: 'filesystem', active: true, sortOrder: 0,
    });
  }

  // Gallery
  (manifest.gallery ?? []).forEach((file, i) => assets.push({
    id: null, assetType: 'gallery',
    url:     `${base}/gallery/${file}`,
    alt:     altFromFilename(file),
    caption: '', source: 'filesystem', active: true, sortOrder: i,
  }));

  // Research
  (manifest.research ?? []).forEach((file, i) => assets.push({
    id: null, assetType: 'research',
    url:     `${base}/research/${file}`,
    alt:     altFromFilename(file),
    caption: '', source: 'filesystem', active: true, sortOrder: i,
  }));

  // Day images — manifest.dayImages is { "1": [...], "2": [...], ... }
  for (const [dayKey, files] of Object.entries(manifest.dayImages ?? {})) {
    const dayNumber = parseInt(dayKey, 10);
    (files ?? []).forEach((file, i) => assets.push({
      id: null, assetType: 'day',
      dayNumber,
      url:     `${base}/day-images/day${dayNumber}/${file}`,
      alt:     `Day ${dayNumber}`,
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  return { assets };
}

// ── Assets: save (create or update) ──────────────────────────────────────────
async function handleSaveAsset(pool, body, ctx) {
  const { itineraryId, id, assetType = 'gallery', url, alt = '', caption = '', sortOrder = 0, source = 'manual', dayNumber } = body;
  if (!itineraryId) throw Object.assign(new Error('itineraryId is required'), { status: 400 });
  await assertOwnership(pool, itineraryId, ctx);
  if (!url)         throw Object.assign(new Error('url is required'), { status: 400 });

  const safeDay = (assetType === 'day' && dayNumber != null) ? parseInt(dayNumber, 10) : null;

  if (id) {
    // Update existing
    const { rows } = await pool.query(
      `UPDATE "ItineraryAsset"
       SET "assetType"=$2, url=$3, alt=$4, caption=$5, "sortOrder"=$6, "dayNumber"=$8
       WHERE id=$1 AND "itineraryId"=$7
       RETURNING *`,
      [id, assetType, url, alt, caption, sortOrder, itineraryId, safeDay]
    );
    return { asset: rows[0] };
  }

  const { rows } = await pool.query(
    `INSERT INTO "ItineraryAsset" ("itineraryId","assetType",url,alt,caption,"sortOrder",source,"dayNumber")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [itineraryId, assetType, url, alt, caption, sortOrder, source, safeDay]
  );
  return { asset: rows[0] };
}

// ── Assets: upload file → Vercel Blob ────────────────────────────────────────
// The serverless runtime filesystem (/var/task) is read-only on Vercel.
// All uploads go to Vercel Blob; the returned public URL is stored in the DB.
async function handleUploadAsset(pool, body, ctx) {
  const {
    itineraryId, slug, assetType = 'gallery', dayNumber,
    filename, data: base64Data, alt = '', caption = '', sortOrder = 0,
  } = body;

  if (!itineraryId) throw Object.assign(new Error('itineraryId is required'), { status: 400 });
  await assertOwnership(pool, itineraryId, ctx);
  if (!slug)        throw Object.assign(new Error('slug is required'), { status: 400 });
  if (!filename)    throw Object.assign(new Error('filename is required'), { status: 400 });
  if (!base64Data)  throw Object.assign(new Error('data is required'), { status: 400 });
  if (assetType === 'day' && !dayNumber) {
    throw Object.assign(new Error('dayNumber is required for day images'), { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(new Error('Image uploads are not configured (missing BLOB_READ_WRITE_TOKEN)'), { status: 503 });
  }

  const VALID_TYPES = ['hero', 'gallery', 'research', 'day', 'manual'];
  if (!VALID_TYPES.includes(assetType)) {
    throw Object.assign(new Error(`Invalid asset type: ${assetType}`), { status: 400 });
  }

  // Sanitize: lowercase, hyphens only, unique timestamp suffix
  const rawBase = path.basename(filename);
  const ext     = rawBase.split('.').pop().toLowerCase();
  const base    = rawBase
    .replace(/\.[^.]+$/, '')           // strip extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // non-alphanumeric → hyphen
    .replace(/^-+|-+$/g, '')           // trim leading/trailing hyphens
    || 'image';
  const ts      = Date.now().toString(36).slice(-5); // 5-char base-36 suffix
  const safeName = `${base}-${ts}.${ext}`;

  // Logical storage path mirrors the itinerary folder structure
  let subfolder;
  if (assetType === 'gallery')  subfolder = 'gallery';
  else if (assetType === 'research') subfolder = 'research';
  else if (assetType === 'day') subfolder = `day-images/day${parseInt(dayNumber, 10)}`;
  else if (assetType === 'hero') subfolder = 'hero';
  else subfolder = assetType;

  const blobPath = `itineraries/${slug}/${subfolder}/${safeName}`;

  // Detect MIME type from extension
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' };
  const contentType = MIME[ext] ?? 'application/octet-stream';

  const fileBuffer = Buffer.from(base64Data, 'base64');

  let blobUrl;
  try {
    const result = await blobPut(blobPath, fileBuffer, { access: 'public', contentType, addRandomSuffix: false });
    blobUrl = result.url;
  } catch (err) {
    console.error('[upload-asset] Vercel Blob put failed:', err);
    throw Object.assign(new Error('Upload failed. Please try again.'), { status: 502 });
  }

  const safeDay = (assetType === 'day' && dayNumber != null) ? parseInt(dayNumber, 10) : null;

  const { rows } = await pool.query(
    `INSERT INTO "ItineraryAsset" ("itineraryId","assetType",url,alt,caption,"sortOrder",source,"dayNumber")
     VALUES ($1,$2,$3,$4,$5,$6,'blob',$7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [itineraryId, assetType, blobUrl, alt, caption, sortOrder, safeDay]
  );

  if (!rows.length) {
    const { rows: existing } = await pool.query(
      `SELECT * FROM "ItineraryAsset" WHERE "itineraryId"=$1 AND url=$2 LIMIT 1`,
      [itineraryId, blobUrl]
    );
    return { asset: existing[0], url: blobUrl };
  }
  return { asset: rows[0], url: blobUrl };
}

// ── Assets: delete ────────────────────────────────────────────────────────────
async function handleDeleteAsset(pool, id, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  if (!ctx.isAdmin) {
    // Verify the asset's itinerary belongs to this creator
    const { rows } = await pool.query(
      `SELECT i.creator_id AS "creatorId" FROM "ItineraryAsset" a
       JOIN "Itinerary" i ON i.id = a."itineraryId"
       WHERE a.id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
    if (rows[0].creatorId !== ctx.creatorId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  await pool.query(`DELETE FROM "ItineraryAsset" WHERE id = $1`, [id]);
  return { ok: true };
}

// ── Assets: toggle active ─────────────────────────────────────────────────────
async function handleToggleAsset(pool, id, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  if (!ctx.isAdmin) {
    const { rows } = await pool.query(
      `SELECT i.creator_id AS "creatorId" FROM "ItineraryAsset" a
       JOIN "Itinerary" i ON i.id = a."itineraryId"
       WHERE a.id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
    if (rows[0].creatorId !== ctx.creatorId) throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  const { rows } = await pool.query(
    `UPDATE "ItineraryAsset" SET active = NOT active WHERE id = $1 RETURNING *`,
    [id]
  );
  return { asset: rows[0] };
}

// ── Linked CustomRequest ──────────────────────────────────────────────────────
async function handleLinkedRequest(pool, itineraryId) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM "CustomRequest" WHERE "itineraryId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [itineraryId]
  );
  return { request: rows[0] ?? null };
}

// ── AI generation log: list ───────────────────────────────────────────────────
async function handleAIHistory(pool, itineraryId) {
  try {
    const { rows } = await pool.query(
      `SELECT id, prompt, "parsedOutput", "createdBy", "createdAt"
       FROM "ItineraryAIGeneration"
       WHERE "itineraryId" = $1 OR ($1 IS NULL AND "itineraryId" IS NULL)
       ORDER BY "createdAt" DESC
       LIMIT 20`,
      [itineraryId || null]
    );
    return { generations: rows };
  } catch (err) {
    // Table may not exist yet — return empty history rather than crashing
    if (err.message?.includes('does not exist')) return { generations: [] };
    throw err;
  }
}

// ── AI generate draft ─────────────────────────────────────────────────────────
// Accepts a prompt and optionally an itineraryId.
// AI output is saved as a draft record — NEVER auto-applied to the itinerary.
// Wire up ANTHROPIC_API_KEY (or your preferred AI service) to enable live generation.
async function handleAIGenerate(pool, body, adminEmail) {
  const { itineraryId, prompt, requestContext } = body;
  if (!prompt?.trim()) throw Object.assign(new Error('prompt is required'), { status: 400 });

  let rawOutput = '';
  let parsedOutput = {};

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      // Build optional context block for custom itineraries
      let contextBlock = '';
      if (requestContext && typeof requestContext === 'object') {
        const styleStr = Array.isArray(requestContext.style)
          ? requestContext.style.join(', ')
          : (typeof requestContext.style === 'string'
              ? (() => { try { return JSON.parse(requestContext.style).join(', '); } catch { return requestContext.style; } })()
              : '');
        contextBlock = `

CUSTOM REQUEST CONTEXT — use this as primary grounding for the itinerary:
- Client: ${requestContext.fullName || 'Not specified'}
- Destination: ${requestContext.destination || 'Not specified'}
- Travel dates: ${requestContext.dates || 'Not specified'}
- Duration: ${requestContext.duration || 'Not specified'}
- Group size: ${requestContext.groupSize || 'Not specified'}
- Group type: ${requestContext.groupType || 'Not specified'}
- Budget: ${requestContext.budget || 'Not specified'}
- Travel style: ${styleStr || 'Not specified'}
- Special notes: ${requestContext.notes || 'None'}
Tailor every section to match this client's specific needs.`;
      }

      const systemPrompt = `You are a professional travel content editor for HiddenAtlas, a premium travel planning service.
Generate a structured itinerary in valid JSON matching this exact schema:
{
  "hero": { "title": "", "subtitle": "", "tagline": "", "coverImage": "" },
  "summary": { "shortDescription": "", "whySpecial": "", "routeOverview": "", "highlights": [], "included": [] },
  "tripFacts": { "groupSize": "", "difficulty": "Moderate", "bestFor": [], "category": "" },
  "days": [{ "day": 1, "title": "", "desc": "", "bullets": [], "img": "", "tip": "" }],
  "sections": { "hotels": [{ "name": "", "type": "", "note": "" }], "practicalNotes": "", "faq": [{ "q": "", "a": "" }] },
  "pdfConfig": { "showRouteMap": true, "showHotels": true },
  "seo": { "metaTitle": "", "metaDescription": "" }
}
Return ONLY valid JSON. No markdown fences. No commentary.${contextBlock}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();
      rawOutput = data.content?.[0]?.text ?? '';

      try {
        parsedOutput = JSON.parse(rawOutput);
      } catch {
        // Response may have prose — try to extract JSON block
        const match = rawOutput.match(/\{[\s\S]*\}/);
        if (match) parsedOutput = JSON.parse(match[0]);
      }
    } catch (err) {
      console.error('[itinerary-cms/ai-generate]', err.message);
      rawOutput = `Error: ${err.message}`;
    }
  } else {
    rawOutput = 'ANTHROPIC_API_KEY not configured. Set it in your environment variables to enable AI generation.';
  }

  // Persist to history log — optional, degrades gracefully if table doesn't exist yet
  let savedGeneration = null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO "ItineraryAIGeneration" ("itineraryId", prompt, "rawOutput", "parsedOutput", "createdBy")
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [itineraryId || null, prompt, rawOutput, JSON.stringify(parsedOutput), adminEmail]
    );
    savedGeneration = rows[0];
  } catch (err) {
    if (err.message?.includes('does not exist')) {
      console.warn('[itinerary-cms/ai-generate] ItineraryAIGeneration table missing — history not saved');
    } else {
      console.error('[itinerary-cms/ai-generate] failed to save generation log:', err.message);
    }
  }

  // Return the result regardless of whether it was persisted
  const generation = savedGeneration ?? {
    id: null,
    itineraryId: itineraryId || null,
    prompt,
    rawOutput,
    parsedOutput,
    createdBy: adminEmail,
    createdAt: new Date().toISOString(),
  };

  return { generation };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_CONTENT = {
  hero:      { title: '', subtitle: '', tagline: '', coverImage: '' },
  summary:   { shortDescription: '', whySpecial: '', routeOverview: '', highlights: [], included: [] },
  tripFacts: { groupSize: '', difficulty: 'Moderate', bestFor: [], category: '' },
  days:      [],
  sections:  { hotels: [], practicalNotes: '', faq: [] },
  pdfConfig: { showRouteMap: true, showHotels: true },
  seo:       { metaTitle: '', metaDescription: '' },
};

// ── PDF image resolution ──────────────────────────────────────────────────────
// Fetches a list of remote image URLs server-side (Node.js, no CORS restrictions)
// and returns each as a base64 data URI ready for @react-pdf/renderer.
// Called by the admin PDF generator before rendering so the renderer receives
// embedded data URIs, not remote URLs it cannot reliably fetch in the browser.
async function handleResolveImages({ urls = [] }) {
  const resolved = {};
  await Promise.all(urls.map(async url => {
    if (!url || typeof url !== 'string') return;
    // Strip query params — Vercel Blob ignores them
    const cleanUrl = url.replace(/\?.*/, '');
    try {
      const r = await fetch(cleanUrl);
      if (!r.ok) {
        console.error('[resolve-images] fetch failed:', r.status, cleanUrl.slice(0, 80));
        resolved[url] = null;
        return;
      }
      const buf         = await r.arrayBuffer();
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      resolved[url]     = `data:${contentType};base64,${Buffer.from(buf).toString('base64')}`;
      console.log('[resolve-images] ok —', contentType, Math.round(buf.byteLength / 1024) + 'kb —', cleanUrl.slice(0, 60));
    } catch (err) {
      console.error('[resolve-images] exception:', err.message, cleanUrl.slice(0, 80));
      resolved[url] = null;
    }
  }));
  return { resolved };
}

function mergeEmptyContent(content) {
  return {
    ...EMPTY_CONTENT,
    ...content,
    hero:      { ...EMPTY_CONTENT.hero,      ...(content.hero      ?? {}) },
    summary:   { ...EMPTY_CONTENT.summary,   ...(content.summary   ?? {}) },
    tripFacts: { ...EMPTY_CONTENT.tripFacts, ...(content.tripFacts ?? {}) },
    sections:  { ...EMPTY_CONTENT.sections,  ...(content.sections  ?? {}) },
    pdfConfig: { ...EMPTY_CONTENT.pdfConfig, ...(content.pdfConfig ?? {}) },
    seo:       { ...EMPTY_CONTENT.seo,       ...(content.seo       ?? {}) },
    days:      Array.isArray(content.days) ? content.days : [],
  };
}

function parseDurationDays(duration) {
  if (!duration) return null;
  const match = String(duration).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function buildContentFromStatic(item) {
  return {
    hero: {
      title:      item.title        || '',
      subtitle:   item.subtitle     || '',
      tagline:    item.tagline      || '',
      coverImage: item.coverImage   || item.image || '',
    },
    summary: {
      shortDescription: item.shortDescription || item.description || '',
      whySpecial:       item.whySpecial        || '',
      routeOverview:    item.routeOverview     || '',
      highlights:       Array.isArray(item.highlights) ? item.highlights : [],
      included:         Array.isArray(item.included)   ? item.included   : [],
    },
    tripFacts: {
      groupSize:  item.groupSize  || '',
      difficulty: item.difficulty || 'Moderate',
      bestFor:    Array.isArray(item.bestFor) ? item.bestFor : [],
      category:   item.category   || '',
    },
    days: Array.isArray(item.days) ? item.days : [],
    sections: {
      hotels:          Array.isArray(item.hotels) ? item.hotels : [],
      practicalNotes:  '',
      faq:             [],
    },
    pdfConfig: { showRouteMap: true, showHotels: true },
    seo:       { metaTitle: '', metaDescription: '' },
  };
}
