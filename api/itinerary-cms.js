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
// GET  /api/itinerary-cms?action=upload-pdf-token&id=:id  — returns scoped client token for direct blob upload
// POST /api/itinerary-cms?action=save-pdf-url&id=:id      — saves blob URL + increments version after client upload
// POST /api/itinerary-cms?action=ai-generate
// POST /api/itinerary-cms?action=generate-route-map&id=:id — AI-extracts route stops with coordinates from itinerary content
// GET  /api/itinerary-cms?action=import-csv-template        — returns sample CSV template for import
// POST /api/itinerary-cms?action=import-url-preview         — fetch URL (multi-strategy), AI-extract preview JSON; returns { blocked:true } on 403
// POST /api/itinerary-cms?action=import-csv-preview         — parse CSV, return preview JSON (no DB write)
// POST /api/itinerary-cms?action=import-text-preview        — normalise user-pasted article text via AI (no fetch, no DB write)
// POST /api/itinerary-cms?action=import-confirm             — create draft itinerary from preview JSON
// GET  /api/itinerary-cms?action=day-stops&id=:id                      — list all ItineraryDayStop rows for an itinerary
// POST /api/itinerary-cms?action=upsert-day-stop&id=:id                — create or update a day stop (stopId in body = update)
// POST /api/itinerary-cms?action=delete-day-stop&id=:id&stopId=:stopId — delete a day stop
// POST /api/itinerary-cms?action=reorder-day-stops&id=:id              — bulk-update sortOrder { order: [{id, sortOrder}] }
// POST /api/itinerary-cms?action=generate-stops-from-bullets&id=:id    — AI-parse day bullets into structured stops
// POST /api/itinerary-cms?action=regenerate-route-from-stops&id=:id    — rebuild content.routeMap.stops from DB day stops

import pg                         from 'pg';
import { resolveUserCtx }         from './_lib/resolveUserCtx.js';
import { handleSubmit as reviewSubmit } from './itinerary-review.js';
import { existsSync }             from 'fs';
import { readFile, stat }         from 'fs/promises';
import path                       from 'path';
import { put as blobPut }         from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { imageSize }              from 'image-size';

const { Pool } = pg;

// ── Variant normalisation (mirrors src/lib/itineraryImages.js) ────────────────
function normalizeVariant(v) {
  if (v === 'essential') return 'essential';
  if (v === 'short')     return 'short';
  return 'complete'; // 'premium', 'complete', null, undefined, or unrecognised
}

// ── Shared variant bucket resolver (mirrors resolveVariantBucket in itineraryImages.js) ──
// Returns { files: string[], sub: string|null }
//   files — the resolved file list for this variant (may be empty)
//   sub   — subfolder name ('essential' | 'short' | null for root)
//
// Three-state semantics for variant sub-arrays (null = absent, [] = empty, [...] = files):
//   null  → variant folder does not exist → fall back to root
//   []    → variant folder exists but is empty → explicit suppression: no image, no fallback
//   [...] → variant folder has files → use them
//
// v must already be normalised via normalizeVariant().
function resolveVariantBucket(bucket, v) {
  if (Array.isArray(bucket)) return { files: bucket, sub: null };
  if (!bucket)               return { files: [],     sub: null };

  if (v === 'essential') {
    const ess = bucket.essential;
    if (ess == null)    return { files: bucket.root ?? [], sub: null };
    if (ess.length > 0) return { files: ess,               sub: 'essential' };
    return              { files: [],            sub: 'essential' };
  }

  if (v === 'short') {
    const sh = bucket.short;
    if (sh == null)    return { files: bucket.root ?? [], sub: null };
    if (sh.length > 0) return { files: sh,                sub: 'short' };
    return             { files: [],             sub: 'short' };
  }

  return { files: bucket.root ?? [], sub: null };
}

// ── Auth guard — admin OR active designer ─────────────────────────────────────
// Returns { email, isAdmin, creatorId } where creatorId is the Creator.id linked
// to this user, or null if the user has no creator profile.
// Throws 401/403 if the caller is neither admin nor an active designer.
async function verifyUser(authHeader, pool) {
  const ctx = await resolveUserCtx(authHeader, pool);
  if (!ctx) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  // Must be admin OR designer (creator profile is optional — designers without one see an empty list)
  if (!ctx.isAdmin && !ctx.isDesigner) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return { email: ctx.email, isAdmin: ctx.isAdmin, creatorId: ctx.creatorId, userId: ctx.userId, isDesigner: ctx.isDesigner };
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
      if (action === 'scan-assets')      { return res.json(await handleScanAssets(req.query.assetSlug || req.query.slug, req.query.variant, req.query.durationDays ? parseInt(req.query.durationDays, 10) : null)); }
      if (action === 'ai-history')       { await assertOwnership(pool, id, ctx); return res.json(await handleAIHistory(pool, id)); }
      if (action === 'linked-request')   { adminOnly(); return res.json(await handleLinkedRequest(pool, id)); }
      if (action === 'pricing-options')    return res.json(await handlePricingOptions(pool, req.query.creatorId || null, ctx));
      if (action === 'search-parents')         return res.json(await handleSearchParents(pool, req.query.q || '', req.query.id || null));
      if (action === 'check-version-duplicate') return res.json(await handleCheckVersionDuplicate(pool, req.query.parentSlug || '', req.query.variant || '', req.query.id || null));
      if (action === 'migration-status')  { adminOnly(); return res.json(await handleMigrationStatus(pool)); }
      if (action === 'upload-pdf-token')  { await assertOwnership(pool, id, ctx); return res.json(await handleUploadPDFToken(pool, id)); }
      if (action === 'import-csv-template') return res.json(handleImportCsvTemplate());
      if (action === 'day-stops')         { await assertOwnership(pool, id, ctx); return res.json(await handleListDayStops(pool, id)); }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      // PDF upload uses raw binary body (Content-Type: application/pdf) — dispatch
      // before reading req.body so the stream is still available to readRawBody().
      if (action === 'upload-pdf') {
        await assertOwnership(pool, id, ctx);
        return res.json(await handleUploadPDF(pool, id, req));
      }

      const body = req.body ?? {};
      if (action === 'create')       return res.json(await handleCreate(pool, body, ctx));
      if (action === 'update')       { await assertOwnership(pool, id, ctx); return res.json(await handleUpdate(pool, id, body, ctx)); }
      if (action === 'duplicate')    { await assertOwnership(pool, id, ctx); return res.json(await handleDuplicate(pool, id)); }
      if (action === 'delete')       return res.json(await handleDelete(pool, id, ctx));
      // Designers cannot publish directly — route to review submission instead.
      if (action === 'publish') {
        await assertOwnership(pool, id, ctx);
        if (!ctx.isAdmin) return res.json(await reviewSubmit(pool, id, ctx));
        return res.json(await handleSetStatus(pool, id, 'published', ctx));
      }
      if (action === 'unpublish')    { await assertOwnership(pool, id, ctx); return res.json(await handleSetStatus(pool, id, 'draft', ctx)); }
      // Explicit submit-for-review action (mirrors the publish route for designers)
      if (action === 'submit-for-review') { await assertOwnership(pool, id, ctx); return res.json(await reviewSubmit(pool, id, ctx)); }
      if (action === 'seed')         { adminOnly(); return res.json(await handleSeed(pool, body)); }
      if (action === 'bulk-publish') { adminOnly(); return res.json(await handleBulkPublish(pool)); }
      if (action === 'save-asset')   return res.json(await handleSaveAsset(pool, body, ctx));
      if (action === 'upload-asset')     return res.json(await handleUploadAsset(pool, body, ctx));
      if (action === 'upload-route-map') { await assertOwnership(pool, id, ctx); return res.json(await handleUploadRouteMap(pool, id, body)); }
      if (action === 'delete-asset') return res.json(await handleDeleteAsset(pool, id, ctx));
      if (action === 'toggle-asset') return res.json(await handleToggleAsset(pool, id, ctx));
      if (action === 'save-pdf-url')      { await assertOwnership(pool, id, ctx); return res.json(await handleSavePdfUrl(pool, id, body)); }
      if (action === 'update-pdf-status') { await assertOwnership(pool, id, ctx); return res.json(await handleUpdatePDFStatus(pool, id, body)); }
      if (action === 'ai-generate')          { adminOnly(); return res.json(await handleAIGenerate(pool, body, ctx.email)); }
      if (action === 'generate-route-map')   { await assertOwnership(pool, id, ctx); return res.json(await handleGenerateRouteMap(pool, id)); }
      if (action === 'backfill-pricing')  { adminOnly(); return res.json(await handleBackfillPricing(pool)); }
      if (action === 'resolve-images')    return res.json(await handleResolveImages(body));
      if (action === 'import-url-preview')  return res.json(await handleImportUrlPreview(body));
      if (action === 'import-csv-preview')  return res.json(await handleImportCsvPreview(body));
      if (action === 'import-text-preview') return res.json(await handleImportTextPreview(body));
      if (action === 'import-confirm')      return res.json(await handleImportConfirm(pool, body, ctx));
      if (action === 'upsert-day-stop')          { await assertOwnership(pool, id, ctx); return res.json(await handleUpsertDayStop(pool, id, body)); }
      if (action === 'delete-day-stop')          { await assertOwnership(pool, id, ctx); return res.json(await handleDeleteDayStop(pool, id, req.query.stopId)); }
      if (action === 'reorder-day-stops')        { await assertOwnership(pool, id, ctx); return res.json(await handleReorderDayStops(pool, id, body)); }
      if (action === 'generate-stops-from-bullets') { await assertOwnership(pool, id, ctx); return res.json(await handleGenerateStopsFromBullets(pool, id, body)); }
      if (action === 'regenerate-route-from-stops') { await assertOwnership(pool, id, ctx); return res.json(await handleRegenerateRouteFromStops(pool, id)); }
      if (action === 'geocode-stop')             { await assertOwnership(pool, id, ctx); return res.json(await handleGeocodeStop(pool, id, body)); }
      if (action === 'apply-geocode-candidate')  { await assertOwnership(pool, id, ctx); return res.json(await handleApplyGeocodeCandidate(pool, id, body)); }
      if (action === 'geocode-missing-stops')    { await assertOwnership(pool, id, ctx); return res.json(await handleGeocodeMissingStops(pool, id)); }
      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[itinerary-cms]', err);
    const msg = err.message?.includes('does not exist')
      ? `Database schema is not up to date — ${err.message}`
      : err.message;
    return res.status(err.status ?? 500).json({ error: msg });
  } finally {
    await pool.end();
  }
}

// ── Pricing options ───────────────────────────────────────────────────────────
// If the itinerary's creator (via creatorId) has designer pricing plans in the DB,
// those are returned instead of the default env-var tiers.
// Fallback: env-var tiers (STRIPE_PRICE_PREMIUM_*).
// Each option: { key, label, displayPrice, price, currency, stripePriceId,
//               pricingPlanId?, isPlanBased? }
async function handlePricingOptions(pool, creatorId = null, ctx = null) {
  // Try to load designer plans when a creatorId is provided
  if (creatorId) {
    try {
      // Resolve the designer's User.id from their Creator record
      const { rows: creatorRows } = await pool.query(
        `SELECT user_id FROM "Creator" WHERE id = $1 LIMIT 1`, [creatorId]
      );
      const designerUserId = creatorRows[0]?.user_id ?? null;

      if (designerUserId) {
        const { rows: planRows } = await pool.query(
          `SELECT * FROM "DesignerPricingPlan"
           WHERE "designerUserId" = $1 AND "isActive" = true AND "planType" = 'digital'
           ORDER BY "sortOrder" ASC, "createdAt" ASC`,
          [designerUserId]
        );

        if (planRows.length > 0) {
          const options = planRows
            .filter(p => !p.isCustomQuote && p.stripePriceId)
            .map(p => {
              const priceEuros = p.priceCents != null ? p.priceCents / 100 : null;
              return {
                key:          p.id,
                label:        p.name,
                displayPrice: priceEuros != null
                  ? `€${priceEuros % 1 === 0 ? priceEuros.toFixed(0) : priceEuros.toFixed(2)}`
                  : null,
                price:        priceEuros,
                currency:     p.currency,
                stripePriceId: p.stripePriceId,
                pricingPlanId: p.id,
                isPlanBased:   true,
              };
            })
            .filter(o => o.stripePriceId);

          if (options.length > 0) {
            return { options, source: 'designer_plans' };
          }
        }
      }
    } catch (err) {
      console.warn('[pricing-options] designer plans lookup failed:', err.message);
    }
  }

  // Default: env-var tiers
  const completeId  = process.env.STRIPE_PRICE_PREMIUM_COMPLETE || process.env.STRIPE_PRICE_PREMIUM || process.env.STRIPE_PRICE_ID || '';
  const essentialId = process.env.STRIPE_PRICE_PREMIUM_ESSENTIAL || '';
  const shortId     = process.env.STRIPE_PRICE_PREMIUM_SHORT     || '';

  const tiers = [
    { key: 'premium_short',     label: 'Premium Itinerary Short',     displayPrice: '€14', price: 14, currency: 'EUR', stripePriceId: shortId,     isPlanBased: false },
    { key: 'premium_essential', label: 'Premium Itinerary Essential', displayPrice: '€19', price: 19, currency: 'EUR', stripePriceId: essentialId, isPlanBased: false },
    { key: 'premium_complete',  label: 'Premium Itinerary',           displayPrice: '€29', price: 29, currency: 'EUR', stripePriceId: completeId,  isPlanBased: false },
  ];

  const options = tiers.filter(t => t.stripePriceId);
  return { options, source: 'default' };
}

// ── Migration status (admin diagnostic) ──────────────────────────────────────
// Returns which migrations are recorded in the _migrations tracking table so
// admins can compare against the migration folder list to find what's missing.
async function handleMigrationStatus(pool) {
  const { rows: tableCheck } = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_migrations'
  `);
  if (!tableCheck.length) {
    return { migrationTableExists: false, applied: [] };
  }
  const { rows } = await pool.query(
    `SELECT name, "appliedAt" FROM "_migrations" ORDER BY name ASC`
  );
  return { migrationTableExists: true, applied: rows, count: rows.length };
}

// ── Search itineraries for parent picker ─────────────────────────────────────
// Accessible to all authenticated CMS users (admin + designer).
// Returns minimal fields — title, slug, destination — for the relationship picker.
async function handleSearchParents(pool, q = '', excludeId = null) {
  const search = q.trim() ? `%${q.trim()}%` : '%';
  const params = excludeId ? [search, excludeId] : [search];
  const { rows } = await pool.query(
    `SELECT id, slug, title, destination, country, "isCollection"
     FROM "Itinerary"
     WHERE (title ILIKE $1 OR destination ILIKE $1 OR slug ILIKE $1)
       ${excludeId ? 'AND id != $2' : ''}
     ORDER BY title ASC
     LIMIT 25`,
    params
  );
  return { itineraries: rows };
}

// ── Check if a version duplicate exists for a given parent+variant ─────────────
async function handleCheckVersionDuplicate(pool, parentSlug, variant, excludeId = null) {
  if (!parentSlug || !variant) return { isDuplicate: false, existing: null };
  const params = excludeId ? [parentSlug, variant, excludeId] : [parentSlug, variant];
  const { rows } = await pool.query(
    `SELECT id, title, slug FROM "Itinerary"
     WHERE "parentId" = $1 AND variant = $2
       ${excludeId ? 'AND id != $3' : ''}
     LIMIT 1`,
    params
  );
  return { isDuplicate: rows.length > 0, existing: rows[0] ?? null };
}

// ── List all itineraries (CMS view) ──────────────────────────────────────────
// Admin: all itineraries.  Creator: only itineraries assigned to them.
// Returns creator name/slug alongside each row for display in the CMS table.
async function handleList(pool, ctx) {
  // Designer with no creator profile yet has no itineraries
  if (!ctx.isAdmin && !ctx.creatorId) {
    return { itineraries: [], collections: [] };
  }

  const creatorFilter = ctx.isAdmin ? '' : `WHERE i.creator_id = $1`;
  const params        = ctx.isAdmin ? [] : [ctx.creatorId];

  const { rows } = await pool.query(`
    SELECT i.*,
           -- Explicit aliases guarantee camelCase names even if the table has lowercase
           -- duplicate columns (e.g. instagrampostid created without quotes).
           -- The Itinerary table is the sole source of truth for Instagram publish state.
           i."instagramPostId"      AS "instagramPostId",
           i."instagramPermalink"   AS "instagramPermalink",
           i."instagramPublishedAt" AS "instagramPublishedAt",
           COUNT(p.id)::int AS purchase_count,
           c.name                   AS creator_name,
           c.slug                   AS creator_slug,
           c.instagram_account_id   AS creator_instagram_account_id
    FROM "Itinerary" i
    LEFT JOIN "Purchase" p ON p."itineraryId" = i.id
    LEFT JOIN "Creator"  c ON c.id = i.creator_id
    ${creatorFilter}
    GROUP BY i.id, c.name, c.slug, c.instagram_account_id
    ORDER BY i."createdAt" DESC
  `, params);

  // Normalize Instagram fields: if the DB returned lowercase variants alongside
  // the camelCase ones, the explicit aliases above win, but also apply a JS-level
  // remap as a belt-and-suspenders guard. Source of truth: Itinerary table only.
  const normalized = rows.map(r => {
    const instagramPostId      = r.instagramPostId      ?? r.instagrampostid      ?? null;
    const instagramPermalink   = r.instagramPermalink   ?? r.instagrampermalink   ?? null;
    const instagramPublishedAt = r.instagramPublishedAt ?? r.instagrampublishedat ?? null;

    if (r.creator_instagram_account_id) {
      console.log('[itinerary-cms:list] instagram state:', {
        id:                    r.id,
        slug:                  r.slug,
        instagramPostId,
        instagramPermalink,
        instagramPublishedAt,
        rawInstagramKeys:      Object.keys(r).filter(k => k.toLowerCase().startsWith('instagram')),
      });
    }

    return { ...r, instagramPostId, instagramPermalink, instagramPublishedAt };
  });

  const itineraries = normalized.filter(r => !r.isCollection);
  const collections = normalized.filter(r => r.isCollection);
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
    pricingPlanId = null,
    coverImage = '',
    content = {},
    status = 'draft',
    variant = null,
    parentId = null,
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
  const finalVariant  = ['complete', 'essential', 'short', 'premium'].includes(variant) ? variant : null;
  const finalParentId = parentId || null;

  const { rows } = await pool.query(
    `INSERT INTO "Itinerary"
       (id, title, subtitle, slug, destination, country, region, "durationDays",
        "accessType", price, "stripePriceId", "pricingKey", "pricingPlanId", "coverImage", description,
        type, "isPrivate", "isCollection", status, "isPublished", content, "schemaVersion", "updatedAt",
        creator_id, variant, "parentId")
     VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,false,$17,$18,$19,1,NOW(),$20,$21,$22)
     RETURNING *`,
    [
      title, subtitle, slug, destination, country, region, durationDays,
      finalAccessType, 0, stripePriceId || null, pricingKey || null,
      pricingPlanId || null,
      derivedCoverImage,
      finalContent.summary?.shortDescription || '',
      finalType, finalPrivate,
      status, status === 'published',
      JSON.stringify(finalContent),
      creatorId,
      finalVariant,
      finalParentId,
    ]
  );
  return { itinerary: rows[0] };
}

// ── Update itinerary ──────────────────────────────────────────────────────────
async function handleUpdate(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const {
    title, subtitle, slug, destination, country, region, durationDays,
    accessType, stripePriceId, pricingKey, pricingPlanId, coverImage, content, status,
    type, isPrivate, isCollection, variant, parentId,
  } = body;

  // creatorId is IMMUTABLE after creation — never update it here.
  // If the payload contains a creatorId, log a warning and discard it.
  if (body.creatorId !== undefined) {
    console.warn(
      `[itinerary-cms/update] BLOCKED: payload contained creatorId="${body.creatorId}" for id=${id} — discarded. creatorId is immutable after creation.`
    );
  }

  // Designers cannot set status = published via the save (update) action.
  // They must use the "Submit for review" flow. If a designer sends status: 'published'
  // (e.g. because the itinerary was already published and they saved), we treat it as
  // null so COALESCE keeps the existing status value unchanged.
  const effectiveStatus = (!ctx.isAdmin && status === 'published') ? null : (status ?? null);

  // Defensive parse: body parsers sometimes deliver JSONB fields as strings
  const rawContent = typeof content === 'string'
    ? (() => { try { return JSON.parse(content); } catch { return {}; } })()
    : (content ?? {});
  const finalContent = mergeEmptyContent(rawContent);

  console.log(`[itinerary-cms/update] id=${id} days=${finalContent.days?.length ?? 0}`);

  // Derive mirrored columns (use effectiveStatus for derivedIsPublished so designers
  // saving a published itinerary don't accidentally set isPublished to true)
  const derivedCoverImage  = finalContent.hero?.coverImage || coverImage || '';
  const derivedDescription = finalContent.summary?.shortDescription || '';
  const derivedIsPublished = effectiveStatus === 'published';

  // type/accessType/isPrivate — null means "leave unchanged"
  const typeParam       = typeof type === 'string' ? type : null;
  const isPrivateParam  = typeof isPrivate === 'boolean' ? isPrivate : null;
  const accessTypeParam = typeParam != null
    ? (typeParam === 'free' ? 'free' : 'paid')
    : (accessType ?? null);

  const finalVariant  = ['complete', 'essential', 'short', 'premium'].includes(variant) ? variant : null;

  const { rows } = await pool.query(
    `UPDATE "Itinerary" SET
       title             = COALESCE($2, title),
       subtitle          = COALESCE($3, subtitle),
       slug              = COALESCE($4, slug),
       destination       = COALESCE(NULLIF($5,''), destination),
       country           = COALESCE(NULLIF($6,''), country),
       region            = COALESCE(NULLIF($7,''), region),
       "durationDays"    = COALESCE($8, "durationDays"),
       "accessType"      = COALESCE($9, "accessType"),
       "stripePriceId"   = $10,
       "pricingKey"      = $11,
       "pricingPlanId"   = $22,
       "coverImage"      = COALESCE(NULLIF($12,''), "coverImage"),
       description       = COALESCE(NULLIF($13,''), description),
       status            = COALESCE($14, status),
       "isPublished"     = $15,
       content           = $16::jsonb,
       type              = COALESCE($17, type),
       "isPrivate"       = COALESCE($18::boolean, "isPrivate"),
       "isCollection"    = COALESCE($19::boolean, "isCollection"),
       variant           = $20,
       "parentId"        = $21,
       "pdfStatus"       = 'stale',
       "updatedAt"       = NOW()
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
      effectiveStatus,
      derivedIsPublished,
      JSON.stringify(finalContent),
      typeParam,
      isPrivateParam,
      typeof isCollection === 'boolean' ? isCollection : null,
      finalVariant,
      parentId || null,
      pricingPlanId ?? null,
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
async function handleDelete(pool, id, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  // Permission check for non-admins: must own it and it must be a draft
  if (!ctx.isAdmin) {
    const { rows: itRows } = await pool.query(
      `SELECT status, creator_id AS "creatorId" FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
    );
    if (!itRows.length) throw Object.assign(new Error('Not found'), { status: 404 });
    const it = itRows[0];
    if (it.creatorId !== ctx.creatorId) {
      throw Object.assign(new Error('You can only delete your own itineraries.'), { status: 403 });
    }
    if (it.status !== 'draft') {
      throw Object.assign(new Error('Only draft itineraries can be deleted. Unpublish it first.'), { status: 403 });
    }
  }

  // Block if the itinerary has purchases
  const { rows: purchases } = await pool.query(
    `SELECT id FROM "Purchase" WHERE "itineraryId" = $1 LIMIT 1`, [id]
  );
  if (purchases.length > 0) {
    throw Object.assign(
      new Error('This itinerary cannot be deleted because it already has purchases.'),
      { status: 409 }
    );
  }

  // Block if other itineraries use this one as a parent
  const { rows: children } = await pool.query(
    `SELECT id FROM "Itinerary" WHERE "parentId" = $1 LIMIT 1`, [id]
  );
  if (children.length > 0) {
    throw Object.assign(
      new Error('This itinerary cannot be deleted because it is already in use as a parent collection.'),
      { status: 409 }
    );
  }

  await pool.query(`DELETE FROM "ItineraryAsset" WHERE "itineraryId" = $1`, [id]);
  await pool.query(`DELETE FROM "Itinerary" WHERE id = $1`, [id]);
  return { ok: true };
}

// ── Publish / Unpublish ───────────────────────────────────────────────────────
async function handleSetStatus(pool, id, status, ctx) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  // Server-side guard: only admins can directly publish
  if (status === 'published' && ctx && !ctx.isAdmin) {
    throw Object.assign(
      new Error('Designers cannot publish directly. Use "Submit for review".'),
      { status: 403 }
    );
  }

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

  // When publishing a free itinerary, ensure isPrivate is cleared so the
  // public listing query (which filters isPrivate = false) returns it.
  const { rows } = await pool.query(
    `UPDATE "Itinerary"
     SET status      = $2,
         "isPublished" = $3,
         "isPrivate" = CASE
           WHEN $3 = true AND type != 'custom' THEN false
           ELSE "isPrivate"
         END,
         "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, slug, status, "isPublished", "isPrivate"`,
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
  const { options } = await handlePricingOptions(pool, null, null);
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

// ── Collect the raw request body into a Buffer ─────────────────────────────────
// Used for non-JSON POST bodies (e.g. application/pdf).
// Vercel does NOT auto-parse these content types, so req is still readable.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end',  ()    => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── Server-side PDF upload ─────────────────────────────────────────────────────
// The browser generates the PDF blob and POSTs it here as application/pdf.
// We upload directly to Vercel Blob using BLOB_READ_WRITE_TOKEN (server-side only)
// and persist the resulting URL + an incremented version to the DB.
async function handleUploadPDF(pool, id, req) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  console.log('PDF BLOB UPLOAD DEBUG', {
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    environment:  process.env.VERCEL_ENV,
  });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN is not configured'), { status: 503 });
  }

  const { rows } = await pool.query(
    `SELECT slug, pdf_version FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const { slug, pdf_version: currentVersion } = rows[0];

  const timestamp = Date.now();
  const filename  = `${slug}-hiddenatlas-${timestamp}.pdf`;
  const pathname  = `itineraries/${slug}/pdf/${filename}`;

  console.log('PDF BLOB UPLOAD DEBUG', {
    slug,
    pathname,
    hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    environment:  process.env.VERCEL_ENV,
  });

  // Read the raw PDF binary from the request stream.
  // Content-Type: application/pdf is not auto-parsed by Vercel, so req is unread.
  const pdfBuffer = await readRawBody(req);
  if (!pdfBuffer.length) {
    throw Object.assign(new Error('PDF body is empty'), { status: 400 });
  }
  console.log('[upload-pdf] received', pdfBuffer.length, 'bytes — slug:', slug);

  // Upload to Vercel Blob server-side. No client token involved.
  const blob = await blobPut(pathname, pdfBuffer, {
    access:         'public',
    contentType:    'application/pdf',
    addRandomSuffix: false,
    allowOverwrite:  true,
    token:           process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Persist URL and increment version in one shot.
  const newVersion = nextPdfVersion(currentVersion);
  await pool.query(
    `UPDATE "Itinerary"
     SET "pdfUrl" = $2, pdf_url = $2, "pdfStatus" = 'ready', "pdfGeneratedAt" = NOW(),
         "pdfError" = NULL, pdf_version = $3, "updatedAt" = NOW()
     WHERE id = $1`,
    [id, blob.url, newVersion]
  );

  console.log('[upload-pdf] done — slug:', slug,
    '| version:', currentVersion, '->', newVersion, '| url:', blob.url);
  return { ok: true, url: blob.url, pdfVersion: newVersion };
}

// ── Sanitize a slug for use in Vercel Blob pathnames ─────────────────────────
// Keeps only a-z, 0-9, hyphens and dots (for the .pdf extension).
// Normalizes to ASCII, strips leading/trailing slashes, collapses double-slashes.
function sanitizeSlug(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('slug is required for pathname generation');
  let s = raw
    .toLowerCase()
    // Replace accented/unicode chars with ASCII equivalents where possible
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Keep only safe characters
    .replace(/[^a-z0-9\-]/g, '-')
    // Collapse multiple hyphens
    .replace(/-+/g, '-')
    // Strip leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
  if (!s) throw new Error(`slug "${raw}" produced an empty safe slug`);
  return s;
}

// Builds a safe, deterministic PDF pathname — no leading slash, no double-slash,
// no special characters, always ends in .pdf.
function buildPdfPathname(slug) {
  const safeSlug = sanitizeSlug(slug);
  const timestamp = Date.now();
  const pathname = `itineraries/${safeSlug}/pdf/${safeSlug}-hiddenatlas-${timestamp}.pdf`;
  if (pathname.includes('//')) throw new Error(`Generated pathname contains double-slash: ${pathname}`);
  if (pathname.startsWith('/'))  throw new Error(`Generated pathname must not start with slash: ${pathname}`);
  if (pathname.length > 900) throw new Error(`Generated pathname is too long (${pathname.length} chars)`);
  return pathname;
}

// ── Vercel Blob upload URL (matches what @vercel/blob client.js uses internally) ──
// The actual API endpoint is https://vercel.com/api/blob/?pathname=...
// The pathname is sent as a query parameter, NOT in the URL path.
const VERCEL_BLOB_API_URL = 'https://vercel.com/api/blob';

// ── Issue a scoped client token for direct browser → Vercel Blob PDF upload ──
// Returns { token, pathname, uploadUrl } — the frontend must PUT to uploadUrl
// using the token (no URL reconstruction on the client side).
async function handleUploadPDFToken(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT slug FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const { slug } = rows[0];

  const safeSlug = sanitizeSlug(slug);
  const pathname = buildPdfPathname(slug);

  // The upload URL is the Vercel Blob API endpoint with pathname as a query param.
  // This matches what @vercel/blob/client put() does internally.
  const uploadUrl = `${VERCEL_BLOB_API_URL}/?${new URLSearchParams({ pathname }).toString()}`;

  console.log('[upload-pdf-token] slug:', slug, '| safeSlug:', safeSlug,
    '| pathname:', pathname, '| pathLength:', pathname.length,
    '| hasBlobToken:', Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    '| env:', process.env.VERCEL_ENV || 'local');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(new Error('BLOB_READ_WRITE_TOKEN is not configured'), { status: 503 });
  }

  const clientToken = await generateClientTokenFromReadWriteToken({
    token: process.env.BLOB_READ_WRITE_TOKEN,
    pathname,
    allowedContentTypes: ['application/pdf'],
    maximumSizeInBytes: 50 * 1024 * 1024,
    validUntil: Date.now() + 5 * 60 * 1000,
    allowOverwrite: true,
  });

  console.log('[upload-pdf-token] token issued — pathname:', pathname);
  return { token: clientToken, pathname, uploadUrl, contentType: 'application/pdf' };
}

// ── Persist blob URL + increment version after a successful client upload ─────
// Body: { url } — just the blob URL returned by the client-side put().
// This is the only call that touches the database; the binary never passes
// through a Vercel Function.
async function handleSavePdfUrl(pool, id, body) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { url } = body;
  if (!url) throw Object.assign(new Error('url is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT slug, "pdfUrl" AS previous_url, pdf_version FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const { slug, previous_url, pdf_version: currentVersion } = rows[0];

  const newVersion = nextPdfVersion(currentVersion);

  const { rows: updated } = await pool.query(
    `UPDATE "Itinerary"
     SET "pdfUrl" = $2, pdf_url = $2, "pdfStatus" = 'ready', "pdfGeneratedAt" = NOW(),
         "pdfError" = NULL, pdf_version = $3, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, slug, "pdfUrl", pdf_url, "pdfStatus", "pdfGeneratedAt", pdf_version`,
    [id, url, newVersion]
  );

  console.log('[save-pdf-url] DB updated — slug:', slug,
    '| version:', currentVersion, '->', newVersion,
    '| url:', url,
    '| previous:', previous_url || '(none)');

  return { ok: true, pdfUrl: url, pdfVersion: newVersion, itinerary: updated[0] };
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
// Enriches blob-sourced rows with sizeBytes via a HEAD request (best-effort, 3s timeout).
async function handleListAssets(pool, itineraryId) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM "ItineraryAsset"
       WHERE "itineraryId" = $1
       ORDER BY "assetType", "dayNumber" NULLS LAST, "sortOrder", "createdAt"`,
      [itineraryId]
    );

    // Enrich blob rows with sizeBytes via HEAD (fire all in parallel, ignore failures)
    const enriched = await Promise.all(rows.map(async row => {
      if (!row.url || !row.url.startsWith('https://')) return row;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const head = await fetch(row.url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(timer);
        const cl = head.headers.get('content-length');
        const ct = head.headers.get('content-type');
        return {
          ...row,
          sizeBytes: cl ? parseInt(cl, 10) : null,
          mimeType:  ct ? ct.split(';')[0].trim() : null,
        };
      } catch {
        return row;
      }
    }));

    return { assets: enriched };
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
// slug:         the asset folder slug (parentId ?? itinerary.slug)
// variant:      'complete' | 'essential' | 'short' | undefined
// durationDays: actual day count of the itinerary variant — days beyond this are skipped
async function handleScanAssets(slug, variant, durationDays = null) {
  if (!slug) throw Object.assign(new Error('slug is required'), { status: 400 });

  const manifestPath = path.join(process.cwd(), 'public', 'itineraries', slug, 'manifest.json');
  const manifestExists = existsSync(manifestPath);
  console.log(`[scan-assets] slug="${slug}" variant="${variant || 'none'}" durationDays=${durationDays ?? 'all'}`);
  console.log(`[scan-assets] manifestPath="${manifestPath}" exists=${manifestExists} cwd="${process.cwd()}"`);
  if (!manifestExists) {
    console.warn(`[scan-assets] manifest NOT FOUND — returning empty assets`);
    return { assets: [] };
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`[scan-assets] failed to parse manifest: ${e.message}`);
    return { assets: [] };
  }

  const base = `/itineraries/${slug}`;
  const assets = [];
  const v = normalizeVariant(variant);

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

  // Gallery — resolveVariantBucket handles both { root, essential, short } and legacy flat array
  {
    const g = manifest.gallery;
    console.log(`[scan-assets] GALLERY RAW FS READ: slug="${slug}" variant="${v}"`);
    console.log(`[scan-assets]   manifest.gallery.root      = [${(Array.isArray(g) ? g : g?.root ?? []).join(', ')}]`);
    console.log(`[scan-assets]   manifest.gallery.essential = ${JSON.stringify(g?.essential ?? null)}`);
    console.log(`[scan-assets]   manifest.gallery.short     = ${JSON.stringify(g?.short ?? null)}`);
    const { files, sub } = resolveVariantBucket(g, v);
    const urlBase = `${base}/gallery${sub ? `/${sub}` : ''}`;
    console.log(`[scan-assets]   FILTERED FILES RESULT (gallery): bucket="${sub || 'root'}" files=${files.length} → [${files.join(', ')}]`);
    files.forEach((file, i) => assets.push({
      id: null, assetType: 'gallery',
      url:     `${urlBase}/${file}`,
      alt:     altFromFilename(file),
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  // Research — uses resolveVariantBucket (three-state: null→fallback, []→suppress, files→use)
  {
    const r = manifest.research;
    console.log(`[scan-assets] RESEARCH RAW FS READ: slug="${slug}" variant="${v}"`);
    console.log(`[scan-assets]   manifest.research.root      = [${(Array.isArray(r) ? r : r?.root ?? []).join(', ')}]`);
    console.log(`[scan-assets]   manifest.research.essential = ${JSON.stringify(r?.essential ?? null)}`);
    console.log(`[scan-assets]   manifest.research.short     = ${JSON.stringify(r?.short ?? null)}`);
    const { files, sub } = resolveVariantBucket(r ?? [], v);
    const urlBase = `${base}/research${sub ? `/${sub}` : ''}`;
    console.log(`[scan-assets]   FILTERED FILES RESULT (research): bucket="${sub || 'root'}" files=${files.length} → [${files.join(', ')}]`);
    files.forEach((file, i) => assets.push({
      id: null, assetType: 'research',
      url:     `${urlBase}/${file}`,
      alt:     altFromFilename(file),
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  // Day images — resolveVariantBucket with three-state null/[]/[files] semantics.
  // Days beyond durationDays are skipped entirely (they belong to longer variants).
  for (const [dayKey, dayData] of Object.entries(manifest.dayImages ?? {})) {
    const dayNumber = parseInt(dayKey, 10);

    // Hard limit: never return images for days beyond the variant's actual day count
    if (durationDays != null && dayNumber > durationDays) {
      console.log(`[scan-assets]   day ${dayNumber}: SKIPPED — beyond durationDays=${durationDays}`);
      continue;
    }

    const isVerboseDay = (dayNumber === 1 || dayNumber === 8);
    if (isVerboseDay) {
      console.log(`[scan-assets] DAY ${dayNumber} RAW FS READ: slug="${slug}" variant="${v}"`);
      console.log(`[scan-assets]   manifest.dayImages[${dayNumber}].root      = ${JSON.stringify(dayData?.root ?? [])}`);
      console.log(`[scan-assets]   manifest.dayImages[${dayNumber}].essential = ${JSON.stringify(dayData?.essential ?? null)}`);
      console.log(`[scan-assets]   manifest.dayImages[${dayNumber}].short     = ${JSON.stringify(dayData?.short ?? null)}`);
    }

    const { files, sub } = resolveVariantBucket(dayData, v);

    // Build a human-readable folder state for the debug log
    let folderState;
    if (!dayData || Array.isArray(dayData) || v === 'complete') {
      folderState = 'root';
    } else {
      const vArr = v === 'essential' ? dayData.essential : dayData.short;
      if (vArr == null)         folderState = `${v}=absent→fallback`;
      else if (vArr.length > 0) folderState = `${v}=exists(${vArr.length}files)`;
      else                      folderState = `${v}=empty→suppress`;
    }

    const resolvedImg = files.length
      ? `${base}/day-images/day${dayNumber}${sub ? `/${sub}` : ''}/${files[0]}`
      : null;

    if (isVerboseDay) {
      console.log(`[scan-assets]   FILTERED FILES RESULT (day ${dayNumber}): folder=${folderState} files=${files.length} → [${files.join(', ')}]`);
      console.log(`[scan-assets]   FINAL CHOSEN PATH / URL FOR DAY ${dayNumber}: ${resolvedImg ?? 'null (excluded)'}`);
    } else {
      console.log(`[scan-assets]   day ${dayNumber}: folder=${folderState} files=${files.length} resolved=${resolvedImg ?? 'null'}`);
    }

    const urlBase = `${base}/day-images/day${dayNumber}${sub ? `/${sub}` : ''}`;
    files.forEach((file, i) => assets.push({
      id: null, assetType: 'day', dayNumber,
      url:     `${urlBase}/${file}`,
      alt:     `Day ${dayNumber}`,
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  // ── Enrich filesystem assets with sizeBytes + dimensions (best-effort, parallel) ──
  const cwd = process.cwd();
  const enriched = await Promise.all(assets.map(async a => {
    if (!a.url || !a.url.startsWith('/itineraries/')) return a;
    const fullPath = path.join(cwd, 'public', a.url);
    try {
      const [fileStat, buf] = await Promise.all([
        stat(fullPath),
        readFile(fullPath),
      ]);
      const dims = imageSize(buf);
      const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml' };
      return {
        ...a,
        sizeBytes: fileStat.size,
        width:     dims.width  ?? null,
        height:    dims.height ?? null,
        mimeType:  mimeMap[dims.type] ?? `image/${dims.type}`,
      };
    } catch {
      return a;
    }
  }));

  return { assets: enriched };
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

// ── Route map image upload ─────────────────────────────────────────────────────
// Uploads a route map image to Vercel Blob and returns { url }.
// Does NOT create an ItineraryAsset record — the URL is stored in content.routeMap.imageUrl
// by the frontend after a successful upload.
async function handleUploadRouteMap(pool, id, body) {
  const { slug, filename, data: base64Data } = body;
  if (!id)        throw Object.assign(new Error('id is required'), { status: 400 });
  if (!slug)      throw Object.assign(new Error('slug is required'), { status: 400 });
  if (!filename)  throw Object.assign(new Error('filename is required'), { status: 400 });
  if (!base64Data) throw Object.assign(new Error('data is required'), { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(new Error('Image uploads are not configured (missing BLOB_READ_WRITE_TOKEN)'), { status: 503 });
  }

  const rawBase = path.basename(filename);
  const ext     = rawBase.split('.').pop().toLowerCase();
  const VALID_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];
  if (!VALID_EXTS.includes(ext)) {
    throw Object.assign(new Error(`Unsupported format. Use: ${VALID_EXTS.join(', ')}`), { status: 400 });
  }

  const base    = rawBase.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'route-map';
  const ts      = Date.now().toString(36).slice(-5);
  const safeName = `${base}-${ts}.${ext}`;
  const blobPath = `itineraries/${slug}/route-map/${safeName}`;

  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
  const contentType = MIME[ext] ?? 'application/octet-stream';

  let blobUrl;
  try {
    const result = await blobPut(blobPath, Buffer.from(base64Data, 'base64'), {
      access: 'public', contentType, addRandomSuffix: false,
    });
    blobUrl = result.url;
  } catch (err) {
    console.error('[upload-route-map] Vercel Blob put failed:', err);
    throw Object.assign(new Error('Upload failed. Please try again.'), { status: 502 });
  }

  console.log('[upload-route-map] uploaded — slug:', slug, '| path:', blobPath);
  return { url: blobUrl };
}

// ── Generate route map stops from itinerary content via AI ────────────────────
//
// Calls the Anthropic API to extract distinct geographic locations (with
// lat/lng) from the itinerary's days, highlights, and route overview.
// Returns { stops: [...] } — the caller saves these into content.routeMap.stops.
async function handleGenerateRouteMap(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT slug, title, country, content FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  const { slug, title, country } = rows[0];
  const rawContent = rows[0].content;
  const content = typeof rawContent === 'string'
    ? (() => { try { return JSON.parse(rawContent); } catch { return {}; } })()
    : (rawContent ?? {});

  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('AI service not configured — add ANTHROPIC_API_KEY to environment'), { status: 503 });
  }

  const days           = content.days || [];
  const highlights     = (content.summary?.highlights || []).join(', ');
  const routeOverview  = content.summary?.routeOverview || '';
  const destination    = country || '';

  const daysText = days.slice(0, 20)
    .map(d => `Day ${d.day || d.dayNumber || '?'}: ${d.title || ''} — ${(d.desc || d.description || '').slice(0, 300)}`)
    .join('\n');

  const systemPrompt = `You are a travel cartographer for HiddenAtlas. Extract distinct geographic route stops from a travel itinerary and return accurate coordinates. Use your knowledge of real locations to provide precise latitude/longitude values.`;

  const userPrompt = `Extract the route stops for this travel itinerary and return JSON.

Itinerary: ${title}${destination ? ` (${destination})` : ''}
${routeOverview ? `Route: ${routeOverview}` : ''}
${highlights ? `Highlights: ${highlights}` : ''}

Days:
${daysText}

Rules:
- Extract distinct geographic locations in travel order (cities, towns, islands, specific areas)
- Deduplicate: if a place appears on multiple days, include it once using the first day number
- Skip generic words ("beach", "market", "restaurant", "city center", "old town" alone, etc.)
- Include accurate real-world latitude and longitude for each location
- Return at most 12 stops
- Return ONLY valid JSON, no markdown, no commentary

{
  "stops": [
    { "id": "stop-1", "order": 1, "name": "string", "latitude": number, "longitude": number, "dayNumber": number_or_null, "source": "generated", "visible": true }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          process.env.ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'content-type':       'application/json',
    },
    body: JSON.stringify({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw Object.assign(new Error(`AI API error: ${response.status} — ${errText.slice(0, 200)}`), { status: 502 });
  }

  const aiJson  = await response.json();
  const rawText = (aiJson.content?.[0]?.text || '').trim();

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Extract JSON object if model added surrounding text despite instructions
    const match = rawText.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
  }

  if (!parsed?.stops) {
    throw Object.assign(new Error('AI returned invalid route map data — try again'), { status: 502 });
  }

  const rawStops = (parsed.stops).map((s, i) => ({
    id:        s.id        || `stop-${i + 1}`,
    order:     typeof s.order === 'number' ? s.order : i + 1,
    name:      String(s.name || '').trim(),
    latitude:  typeof s.latitude  === 'number' ? Math.round(s.latitude  * 100000) / 100000 : null,
    longitude: typeof s.longitude === 'number' ? Math.round(s.longitude * 100000) / 100000 : null,
    dayNumber: typeof s.dayNumber === 'number'  ? s.dayNumber : null,
    source:    'generated',
    visible:   s.visible !== false,
  })).filter(s => s.name);

  // Assign stop type: first and last are major landmarks; all others are route stops.
  const stops = rawStops.map((s, i, arr) => ({
    ...s,
    type: (i === 0 || i === arr.length - 1) ? 'major' : 'stop',
  }));

  console.log(`[generate-route-map] slug: ${slug} | generated ${stops.length} stops |`,
    stops.filter(s => s.latitude != null).length, 'with coordinates');
  return { stops };
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
  routeMap:  { stops: [], imageUrl: '', alt: '', caption: '' },
};

// ── PDF image resolution ──────────────────────────────────────────────────────
// Fetches a list of remote image URLs server-side (Node.js, no CORS restrictions)
// and returns each as a base64 data URI ready for @react-pdf/renderer.
// Called by the admin PDF generator before rendering so the renderer receives
// embedded data URIs, not remote URLs it cannot reliably fetch in the browser.
// Detect image format from magic bytes — do NOT trust the HTTP Content-Type header.
// Uploaders (iOS, Android, browsers) frequently store WebP or HEIC bytes under a
// .jpg filename, causing Vercel Blob to serve Content-Type: image/jpeg for a WebP
// file. If the data URI carries the wrong MIME, step 3d on the client skips the
// Canvas conversion → @react-pdf/renderer receives WebP bytes labelled as JPEG →
// blank space in the PDF.
function detectMimeFromBytes(buf) {
  const b = new Uint8Array(buf.slice ? buf.slice(0, 16) : buf.buffer.slice(0, 16));
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)                              return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)             return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)           return 'image/webp';
  // HEIF/HEIC: ftyp box starts at byte 4 ('ftyp' = 0x66 0x74 0x79 0x70)
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)            return 'image/heic';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)                             return 'image/gif';
  return null; // unknown — fall back to HTTP header
}

const RESOLVE_IMAGES_MAX_BYTES  = 8 * 1024 * 1024; // 8 MB per image — anything larger will bloat the PDF
const RESOLVE_IMAGES_TIMEOUT_MS = 10_000;           // 10 s per image

async function handleResolveImages({ urls = [] }) {
  const resolved = {};
  await Promise.all(urls.map(async url => {
    if (!url || typeof url !== 'string') return;
    // Strip query params — Vercel Blob ignores them
    const cleanUrl = url.replace(/\?.*/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESOLVE_IMAGES_TIMEOUT_MS);
    try {
      const r = await fetch(cleanUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) {
        console.error('[resolve-images] fetch failed:', r.status, cleanUrl.slice(0, 80));
        resolved[url] = null;
        return;
      }
      const buf = await r.arrayBuffer();
      if (buf.byteLength > RESOLVE_IMAGES_MAX_BYTES) {
        console.error(
          `[resolve-images] SKIPPED — image too large (${Math.round(buf.byteLength / 1024 / 1024 * 10) / 10} MB > 8 MB cap).`,
          'Canvas resize on the client will not fire because this URL was not resolved.',
          'URL:', cleanUrl.slice(0, 80)
        );
        resolved[url] = null;
        return;
      }
      const headerMime  = (r.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
      const detectedMime = detectMimeFromBytes(new Uint8Array(buf.slice(0, 16)));
      const effectiveMime = detectedMime || headerMime;

      if (detectedMime && detectedMime !== headerMime) {
        // Log clearly — this is the most common silent failure cause
        console.error(
          `[resolve-images] MIME MISMATCH — header says "${headerMime}" but magic bytes say "${detectedMime}".`,
          'Data URI will use detected MIME so client Canvas conversion fires correctly.',
          'URL:', cleanUrl.slice(0, 80)
        );
      }

      resolved[url] = `data:${effectiveMime};base64,${Buffer.from(buf).toString('base64')}`;
      console.log(`[resolve-images] ok — ${effectiveMime} (header: ${headerMime}) ${Math.round(buf.byteLength / 1024)}kb — ${cleanUrl.slice(0, 60)}`);
    } catch (err) {
      clearTimeout(timer);
      const label = err.name === 'AbortError' ? 'TIMEOUT (10 s)' : err.message;
      console.error('[resolve-images] exception:', label, cleanUrl.slice(0, 80));
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
    routeMap:  { ...EMPTY_CONTENT.routeMap,  ...(content.routeMap  ?? {}) },
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

// ── Itinerary Import ──────────────────────────────────────────────────────────
// POST /api/itinerary-cms?action=import-url-preview
// POST /api/itinerary-cms?action=import-csv-preview
// POST /api/itinerary-cms?action=import-confirm
// GET  /api/itinerary-cms?action=import-csv-template

function slugify(text) {
  return String(text)
    .replace(/[‐‑‒–—―−]/g, '-')  // unicode dashes → ASCII hyphen
    .toLowerCase()
    .replace(/[àáâãäåā]/g, 'a').replace(/[èéêëē]/g, 'e')
    .replace(/[ìíîïī]/g, 'i').replace(/[òóôõöō]/g, 'o')
    .replace(/[ùúûüū]/g, 'u').replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-{2,}/g, '-').slice(0, 80);
}

// Simple RFC-4180 CSV parser — no external deps.
function parseSimpleCSV(csvString) {
  const lines = csvString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) return [];

  const parseRow = (line) => {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields.map(f => f.trim());
  };

  const headers = parseRow(nonEmpty[0]);
  return nonEmpty.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseRow(line);
      const row = {};
      headers.forEach((h, i) => { if (h) row[h] = values[i] ?? ''; });
      return row;
    });
}

// Strips HTML to structured text for Claude extraction.
// Preserves heading markers, extracts lazy-load src attrs, and smart-truncates
// to prefer itinerary-relevant sections.
function extractHtmlContent(html, sourceUrl) {
  // Remove noise before any processing
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract og: / twitter: / description meta from raw html (before noise removal)
  const getMeta = (prop) => {
    const m = html.match(new RegExp(`<meta\\s[^>]*(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
           || html.match(new RegExp(`<meta\\s[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
    return m ? m[1].trim() : '';
  };

  const ogTitle       = getMeta('og:title')       || getMeta('twitter:title');
  const ogDescription = getMeta('og:description') || getMeta('twitter:description') || getMeta('description');
  const ogImage       = getMeta('og:image')        || getMeta('twitter:image');
  const pageTitle     = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || '';

  // Extract images — also check data-src (lazy load) and data-lazy-src
  const images = [];
  const imgRegex = /<img\b[^>]+>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(cleaned)) !== null) {
    const tag = imgMatch[0];
    const src = (tag.match(/\bdata-lazy-src=["']([^"']+)["']/) || [])[1]
             || (tag.match(/\bdata-src=["']([^"']+)["']/)      || [])[1]
             || (tag.match(/\bsrc=["']([^"']+)["']/)           || [])[1]
             || '';
    const alt = (tag.match(/\balt=["']([^"']*)["']/) || [])[1] || '';
    // Skip tracker pixels, icons, avatars, logos
    if (src && !src.startsWith('data:') && !/\b(pixel|tracking|avatar|logo|icon|1x1)\b/i.test(src)) {
      try {
        const absUrl = new URL(src, sourceUrl).href;
        if (absUrl.startsWith('http')) images.push({ url: absUrl, alt });
      } catch { /* skip invalid URLs */ }
    }
  }

  // Convert HTML to plain text preserving heading markers for structure
  let text = cleaned
    .replace(/<h1[^>]*>/gi, '\n\n# ').replace(/<\/h1>/gi, '\n')
    .replace(/<h2[^>]*>/gi, '\n\n## ').replace(/<\/h2>/gi, '\n')
    .replace(/<h3[^>]*>/gi, '\n\n### ').replace(/<\/h3>/gi, '\n')
    .replace(/<h4[^>]*>/gi, '\n\n#### ').replace(/<\/h4>/gi, '\n')
    .replace(/<h5[^>]*>/gi, '\n\n##### ').replace(/<\/h5>/gi, '\n')
    .replace(/<h6[^>]*>/gi, '\n\n###### ').replace(/<\/h6>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ').replace(/<\/li>/gi, '')
    .replace(/<\/ul>/gi, '\n').replace(/<\/ol>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{4,}/g, '\n\n\n').trim();

  // Smart truncation: score paragraphs and prefer itinerary-relevant sections.
  // IMPORTANT: always preserve document order — re-ordering breaks day sequences.
  const ITINERARY_RE = /\b(dia\s+\d|day\s+\d|roteiro|itinerar|visitar|onde\s+ficar|alojamento|miradour|praias?|dicas?|transporte|mapa|percurso|restaurante|hotel|hostel|highlights?|practical|tips?|budget|como\s+chegar|getting\s+there|accommodation|suggested|recommend|atracao|attraction|stop|ponto)\b/i;

  if (text.length > 13000) {
    const paragraphs = text.split(/\n\n+/);
    const scored = paragraphs.map((p, i) => ({
      p,
      score: (ITINERARY_RE.test(p) ? 3 : 0)
           + (/^#{1,4} /.test(p.trimStart()) ? 2 : 0)
           + (i < 6 ? 1 : 0),
    }));

    // Try progressively aggressive filtering while preserving document order
    let truncated = false;
    for (const minScore of [0, 1]) {
      const filtered = scored.filter(x => x.score > minScore);
      const joined = filtered.map(x => x.p).join('\n\n');
      if (joined.length <= 13000) {
        text = joined + (filtered.length < scored.length ? '\n... [low-value sections removed]' : '');
        truncated = true;
        break;
      }
    }
    if (!truncated) {
      // Still too long — take paragraphs in document order until cap
      let result = '';
      for (const { p, score } of scored) {
        if (score === 0) continue; // always drop zero-value
        if (result.length + p.length + 2 > 13000) break;
        result += (result ? '\n\n' : '') + p;
      }
      text = (result || text.slice(0, 13000)) + '\n... [content truncated]';
    }
  }

  console.log(`[extract-html] pageTitle="${pageTitle.slice(0,60)}" text=${text.length}chars images=${images.length}`);
  return { pageTitle, ogTitle, ogDescription, ogImage, images: images.slice(0, 20), text };
}

// ── Defensive JSON extraction ─────────────────────────────────────────────────
// Strips markdown fences and extracts the first complete {...} block.
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Strip markdown code fences (single-line and multi-line variants)
  let s = text
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim();

  // 2. Direct parse of cleaned string
  try { return JSON.parse(s); } catch { /* fall through */ }

  // 3. String-aware depth-matching to find the outermost {} object
  const start = s.indexOf('{');
  if (start === -1) return null;

  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc)             { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')      { inStr = !inStr; continue; }
    if (inStr)           { continue; }
    if (ch === '{')      { depth++; }
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }

  if (end === -1) return null;
  const candidate = s.slice(start, end + 1);

  // 4. Try direct parse of extracted block
  try { return JSON.parse(candidate); } catch { /* fall through */ }

  // 5. Apply common JSON repair heuristics and retry
  const fixed = candidate
    .replace(/,(\s*[}\]])/g, '$1')            // trailing commas before } or ]
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":')  // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"');     // single-quoted string values

  try { return JSON.parse(fixed); } catch { /* fall through */ }

  return null;
}

// ── Schema normalization ──────────────────────────────────────────────────────
// Accepts any object (possibly incomplete AI output) and returns a fully-shaped
// preview object with safe defaults for every optional field.
function normalizePreviewData(raw, sourceUrl) {
  if (!raw || typeof raw !== 'object') raw = {};

  const str  = (v)      => (typeof v === 'string' ? v.trim() : '');
  const num  = (v)      => (typeof v === 'number' && isFinite(v) ? Math.round(v) : null);
  const arr  = (v)      => (Array.isArray(v) ? v : []);

  const basics   = (raw.basics   && typeof raw.basics   === 'object') ? raw.basics   : {};
  const overview = (raw.overview && typeof raw.overview === 'object') ? raw.overview : {};
  const sections = (raw.sections && typeof raw.sections === 'object') ? raw.sections : {};
  const images   = (raw.images   && typeof raw.images   === 'object') ? raw.images   : {};
  const seo      = (raw.seo      && typeof raw.seo      === 'object') ? raw.seo      : {};
  const routeMap = (raw.routeMap && typeof raw.routeMap === 'object') ? raw.routeMap : {};

  const title       = str(basics.title) || str(raw.title) || '';
  const destination = str(basics.destination) || str(raw.destination) || '';

  // Try to infer duration from day array length or text
  let durationDays = num(basics.durationDays) || num(raw.durationDays);
  const rawDays    = arr(raw.days);
  if (!durationDays && rawDays.length > 0) durationDays = rawDays.length;
  if (!durationDays) {
    const m = (str(basics.subtitle) + ' ' + str(overview.tagline)).match(/(\d+)\s*(?:days?|noites?|dias?)/i);
    if (m) durationDays = parseInt(m[1], 10);
  }

  // Always run through slugify — normalises unicode dashes even when AI provides a slug
  const slug = slugify(str(basics.slug) || title || destination || 'imported-itinerary');

  // Normalize days — filter invalid entries, guarantee required keys
  const normalizedDays = rawDays
    .filter(d => d && typeof d === 'object')
    .map((d, i) => ({
      dayNumber:   typeof d.dayNumber === 'number' ? d.dayNumber : (parseInt(d.day, 10) || i + 1),
      title:       str(d.title) || `Day ${i + 1}`,
      description: str(d.description) || str(d.desc) || '',
      highlights:  arr(d.highlights).filter(h => typeof h === 'string' && h.trim()),
      insiderTip:  str(d.insiderTip) || str(d.tip) || '',
      imageUrl:    str(d.imageUrl) || str(d.img) || null,
    }));

  // Hotels — accept array of objects
  const hotels = arr(sections.hotels)
    .filter(h => h && str(h.name))
    .map(h => ({ name: str(h.name), type: str(h.type) || 'Hotel', note: str(h.note) }));

  // FAQ
  const faq = arr(sections.faq)
    .filter(f => f && str(f.q))
    .map(f => ({ q: str(f.q), a: str(f.a) }));

  // bestFor — validate against known set
  const VALID_BEST_FOR = new Set(['Couples', 'Families', 'Friend Groups', 'Adventurers', 'Solo']);
  const bestFor = arr(overview.bestFor).filter(b => VALID_BEST_FOR.has(b));

  // highlights — max 6
  const highlights = arr(overview.highlights)
    .filter(h => typeof h === 'string' && h.trim())
    .slice(0, 6);

  // tagline — max 80 chars
  const tagline = str(overview.tagline).slice(0, 80);

  // gallery — only valid http URLs, max 8
  const gallery = arr(images.gallery)
    .filter(u => typeof u === 'string' && u.startsWith('http'))
    .slice(0, 8);

  const cover = str(images.cover) || str(raw.coverImage) || null;

  const seoTitle = (str(seo.seoTitle) || (title ? `${title} | HiddenAtlas` : '')).slice(0, 60);
  const seoDesc  = (str(seo.seoDescription) || str(overview.description)).slice(0, 155);

  return {
    basics: {
      title,
      subtitle:     str(basics.subtitle),
      destination,
      durationDays: durationDays || null,
      slug,
      country:      str(basics.country),
      region:       str(basics.region),
    },
    overview: { tagline, description: str(overview.description), category: str(overview.category), pace: str(overview.pace), bestFor, groupSize: str(overview.groupSize), highlights },
    days: normalizedDays,
    sections: { hotels, practicalNotes: str(sections.practicalNotes), faq, routeOverview: str(sections.routeOverview), whySpecial: str(sections.whySpecial) },
    images: { cover, gallery, dayImages: arr(images.dayImages).filter(d => d && str(d.url)) },
    seo: { seoTitle, seoDescription: seoDesc, canonicalSourceUrl: str(seo.canonicalSourceUrl) || sourceUrl || '' },
    routeMap: {
      stops: arr(routeMap.stops).filter(s => s && str(s.name)).map((s, i) => ({
        order:     typeof s.order     === 'number' ? s.order     : i + 1,
        name:      str(s.name),
        latitude:  typeof s.latitude  === 'number' ? s.latitude  : null,
        longitude: typeof s.longitude === 'number' ? s.longitude : null,
        dayNumber: typeof s.dayNumber === 'number' ? s.dayNumber : null,
      })),
    },
    warnings:      arr(raw.warnings).filter(w => typeof w === 'string'),
    inferredFields: arr(raw.inferredFields).filter(f => typeof f === 'string'),
  };
}

// ── Schema validation ─────────────────────────────────────────────────────────
function validatePreview(preview) {
  const errors = [];
  if (!preview?.basics?.title)           errors.push('basics.title is required');
  if (!preview?.basics?.destination)     errors.push('basics.destination is required');
  if (!Array.isArray(preview?.days))     errors.push('days must be an array');
  if (!Array.isArray(preview?.warnings)) errors.push('warnings must be an array');
  return { valid: errors.length === 0, errors };
}

// ── Destination / duration inference helpers ──────────────────────────────────
// Used by buildPartialPreview to fill obvious fields from title text.

const DEST_COUNTRY_MAP = {
  'Madeira': 'Portugal', 'Açores': 'Portugal', 'Azores': 'Portugal',
  'Lisboa': 'Portugal', 'Lisbon': 'Portugal', 'Porto': 'Portugal',
  'Algarve': 'Portugal', 'Sintra': 'Portugal', 'Alentejo': 'Portugal',
  'Barcelona': 'Spain', 'Madrid': 'Spain', 'Seville': 'Spain', 'Sevilha': 'Spain',
  'Valencia': 'Spain', 'Málaga': 'Spain', 'Malaga': 'Spain',
  'Mallorca': 'Spain', 'Maiorca': 'Spain', 'Ibiza': 'Spain',
  'Paris': 'France', 'Lyon': 'France', 'Nice': 'France', 'Provence': 'France',
  'Rome': 'Italy', 'Roma': 'Italy', 'Florence': 'Italy', 'Florença': 'Italy',
  'Venice': 'Italy', 'Veneza': 'Italy', 'Milan': 'Italy', 'Milão': 'Italy',
  'Amalfi': 'Italy', 'Sicily': 'Italy', 'Sicília': 'Italy',
  'Amsterdam': 'Netherlands', 'Berlin': 'Germany', 'Berlim': 'Germany',
  'Vienna': 'Austria', 'Viena': 'Austria', 'Prague': 'Czech Republic', 'Praga': 'Czech Republic',
  'Budapest': 'Hungary', 'Budapeste': 'Hungary',
  'London': 'United Kingdom', 'Londres': 'United Kingdom', 'Edinburgh': 'United Kingdom',
  'Dublin': 'Ireland',
  'Tokyo': 'Japan', 'Tóquio': 'Japan', 'Kyoto': 'Japan', 'Osaka': 'Japan',
  'Bangkok': 'Thailand', 'Bali': 'Indonesia', 'Singapore': 'Singapore',
  'New York': 'United States', 'Los Angeles': 'United States', 'Miami': 'United States',
};

function inferDestinationFromText(text) {
  if (!text) return '';
  for (const dest of Object.keys(DEST_COUNTRY_MAP)) {
    if (new RegExp(`\\b${dest}\\b`, 'i').test(text)) return dest;
  }
  return '';
}

function inferCountryFromDestination(dest) {
  if (!dest) return '';
  for (const [d, c] of Object.entries(DEST_COUNTRY_MAP)) {
    if (d.toLowerCase() === dest.toLowerCase()) return c;
  }
  return '';
}

function inferDurationFromText(text) {
  if (!text) return null;
  // Match patterns like "7 dias", "5 e 7 dias", "3, 5 e 7 dias", "7 days"
  const matches = [...text.matchAll(/(\d+)\s*(?:dias?|nights?|noites?|days?)/gi)];
  if (!matches.length) return null;
  const nums = matches.map(m => parseInt(m[1], 10)).filter(n => n > 0 && n <= 90);
  if (!nums.length) return null;
  return Math.max(...nums);  // default to the longest option
}

// ── Partial preview fallback ──────────────────────────────────────────────────
// Last resort when AI output is completely unrecoverable. Infers what it can
// from og-metadata and title text so the user gets a useful starting point.
function buildPartialPreview(extracted, sourceUrl, validationErrors) {
  const rawTitle  = extracted.ogTitle || extracted.pageTitle || 'Imported Itinerary';
  const textHint  = rawTitle + ' ' + str_safe(extracted.ogDescription);
  const dest      = inferDestinationFromText(textHint);
  const country   = inferCountryFromDestination(dest);
  const duration  = inferDurationFromText(textHint);

  const warnings = [
    'Partial import: AI could not produce a complete structure. Review all fields before publishing.',
    ...(validationErrors || []).slice(0, 2),
  ];
  if (duration && textHint.match(/(\d+)\s*(?:,\s*\d+\s*)*e\s*\d+\s*(?:dias?|days?)/i)) {
    warnings.push(`Multiple durations detected in the title. Defaulted to ${duration} days — edit if needed.`);
  }

  return {
    basics: {
      title:        rawTitle,
      subtitle:     '',
      destination:  dest,
      durationDays: duration,
      slug:         slugify(rawTitle),
      country,
      region:       '',
    },
    overview: {
      tagline:     str_safe(extracted.ogDescription).slice(0, 80),
      description: str_safe(extracted.ogDescription),
      category:    '',
      pace:        '',
      bestFor:     [],
      groupSize:   '',
      highlights:  [],
    },
    days:     [],
    sections: { hotels: [], practicalNotes: '', faq: [], routeOverview: '', whySpecial: '' },
    images:   { cover: extracted.ogImage || null, gallery: [], dayImages: [] },
    seo:      {
      seoTitle:          rawTitle.slice(0, 60),
      seoDescription:    str_safe(extracted.ogDescription).slice(0, 155),
      canonicalSourceUrl: sourceUrl || '',
    },
    routeMap: { stops: [] },
    warnings,
    inferredFields: ['title', 'destination', 'country', 'durationDays', 'description', 'days', 'highlights'],
  };
}
function str_safe(v) { return typeof v === 'string' ? v.trim() : ''; }

// ── Shared Claude API caller ──────────────────────────────────────────────────
async function callClaudeRaw(systemPrompt, messages, maxTokens = 4096) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: maxTokens, system: systemPrompt, messages }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw Object.assign(new Error(`AI API error (${response.status}): ${errText.slice(0, 200)}`), { status: 502 });
  }
  const json = await response.json();
  return (json.content?.[0]?.text || '').trim();
}

// ── Main AI normalizer ────────────────────────────────────────────────────────
// Converts extracted content into a HiddenAtlas preview. Tries:
//   1. Direct extraction → normalize → validate
//   2. Repair retry if validation fails
//   3. Partial preview built from og-metadata as final fallback
// ── Source type detection ─────────────────────────────────────────────────────
// Classifies the source so the AI prompt can adjust its extraction strategy.
// Returns 'structured-itinerary' | 'travel-blog'
function detectSourceType(sourceUrl, extractedText) {
  const url = (sourceUrl || '').toLowerCase();

  // Known structured itinerary platforms
  if (/visitacity\.com/i.test(url))  return 'structured-itinerary';
  if (/getyourguide\.com|musement\.com|tourscanner\.com|viator\.com/i.test(url)) return 'structured-itinerary';
  // URL patterns strongly suggesting a structured route
  if (/\/\d+-days?-in-|\/\d+-day-itinerary|itinerary-\d+-days?|top-attractions-in-.*-in-\d+/i.test(url)) return 'structured-itinerary';

  // Detect from content: multiple explicit day headings = structured
  const dayHeadings = (extractedText.match(/^#{1,4}\s*(day\s*\d|dia\s*\d)/gmi) || []).length;
  if (dayHeadings >= 2) return 'structured-itinerary';

  return 'travel-blog';
}

// ── AI repair helper ──────────────────────────────────────────────────────────
// Sends an invalid/unparseable AI response back to Claude asking it to fix the
// JSON. Used when extractJson() returns null on the primary response.
async function repairJsonWithClaude(invalidResponse, sourceUrl, language) {
  const SCHEMA = '{"basics":{"title":"","subtitle":"","destination":"","durationDays":null,"slug":"","country":"","region":""},"overview":{"tagline":"","description":"","category":"","pace":"","bestFor":[],"groupSize":"","highlights":[]},"days":[{"dayNumber":1,"title":"","description":"","highlights":[],"insiderTip":"","imageUrl":null}],"sections":{"hotels":[],"practicalNotes":"","faq":[],"routeOverview":"","whySpecial":""},"images":{"cover":null,"gallery":[],"dayImages":[]},"seo":{"seoTitle":"","seoDescription":"","canonicalSourceUrl":""},"routeMap":{"stops":[]},"warnings":[],"inferredFields":[]}';

  const langNote = language === 'portuguese'
    ? 'Use European Portuguese for all descriptive text fields.'
    : 'Use English for all text fields.';

  const REPAIR_SYS = 'You are a JSON repair specialist. The input below is a malformed AI response that should have been a valid JSON object. Extract the structured data and return ONLY valid JSON. No markdown fences. No prose. No explanations.';
  const REPAIR_USR = `The following response was supposed to match this exact schema:
${SCHEMA}

Rules:
- basics.title must not be empty (use source URL or page title as fallback)
- basics.destination must not be empty
- days must be an array (empty [] if unknown)
- warnings must be an array
- ${langNote}
- Return ONLY the corrected JSON object

Source URL: ${sourceUrl || '(unknown)'}

Malformed response to repair (extract and fix all data from it):
${invalidResponse.slice(0, 8000)}`;

  try {
    const repairText = await callClaudeRaw(REPAIR_SYS, [{ role: 'user', content: REPAIR_USR }], 6144);
    console.log(`[repair] response length=${repairText.length}`);
    const repaired = extractJson(repairText);
    console.log(`[repair] parse: ${repaired ? 'SUCCESS' : 'FAILED'}`);
    return repaired;
  } catch (e) {
    console.log(`[repair] call error: ${e.message}`);
    return null;
  }
}

// ── Patch required fields from metadata when AI leaves them blank ─────────────
function patchRequiredFields(normalized, extracted, sourceUrl) {
  if (!normalized.basics.title) {
    normalized.basics.title = extracted.ogTitle || extracted.pageTitle || 'Imported Itinerary';
  }
  if (!normalized.basics.destination) {
    const hint = normalized.basics.title + ' ' + str_safe(extracted.ogDescription);
    normalized.basics.destination = inferDestinationFromText(hint) || '';
  }
  if (!normalized.basics.country && normalized.basics.destination) {
    normalized.basics.country = inferCountryFromDestination(normalized.basics.destination);
  }
  if (!normalized.basics.durationDays) {
    const hint = normalized.basics.title + ' ' + str_safe(extracted.ogDescription);
    normalized.basics.durationDays = inferDurationFromText(hint);
  }
  if (!normalized.basics.slug) {
    normalized.basics.slug = slugify(normalized.basics.title || normalized.basics.destination || 'imported-itinerary');
  }
  if (!normalized.seo?.canonicalSourceUrl && sourceUrl) {
    if (!normalized.seo) normalized.seo = {};
    normalized.seo.canonicalSourceUrl = sourceUrl;
  }
}

async function normalizeWithClaude(extracted, sourceUrl, language = 'english') {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('AI service not configured — add ANTHROPIC_API_KEY to environment'), { status: 503 });
  }

  const headingsCount = (extracted.text.match(/^#+\s/gm) || []).length;
  const sourceType = detectSourceType(sourceUrl, extracted.text);
  console.log(`[normalize] start — text=${extracted.text.length}chars headings=${headingsCount} images=${extracted.images.length} sourceType=${sourceType} source="${(sourceUrl||'').slice(0,60)}"`);

  const imgList = extracted.images.slice(0, 10)
    .map((img, i) => `${i + 1}. ${img.url}${img.alt ? ` [alt: "${img.alt}"]` : ''}`)
    .join('\n');

  const langInstruction = language === 'portuguese'
    ? 'Write all descriptive text fields in European Portuguese (not Brazilian). Slugs, category, pace, and bestFor values must remain in English.'
    : 'Write all text fields in English.';

  const sourceTypeBlock = sourceType === 'structured-itinerary'
    ? `SOURCE TYPE: STRUCTURED ITINERARY
This source already organises content day by day. Extraction strategy:
- Preserve the exact day count, day order, and attraction sequence from the source.
- Each day in the output must list the actual attractions from that source day, in order.
- Day titles and descriptions must name the real attractions — do not invent a new narrative.
- Do not merge, drop, or reorder days.
- Extract contact details, opening times, and addresses into sections.practicalNotes if present.
- The route map stops should reflect the actual place sequence from the source.`
    : `SOURCE TYPE: TRAVEL BLOG / NARRATIVE
This is a narrative article. Structure it into a logical day-by-day format:
- Identify day groupings from explicit markers ("Day 1", dates, or natural flow).
- Preserve all specific place names, recommendations, and practical advice.
- Maintain the travel logic from the source when grouping stops into days.
- Where the blog covers multiple days loosely, infer a sensible day structure.`;

  const SYSTEM = `You are a travel data extractor converting article content into the HiddenAtlas itinerary schema. Return ONLY valid JSON — no markdown, no prose, no code fences.

CORE RULE — in strict priority order:
1. EXTRACT: Copy factual data directly from the source. Attraction names, day sequence, durations, addresses, descriptions, images, opening hours — preserve all of it.
2. INFER: Only fill HiddenAtlas-required fields that are absent from the source: category, pace, bestFor, tagline, insider tips, SEO fields.
3. REWRITE: Edit text minimally for conciseness. Keep all specific facts. Never replace concrete content with generic copy.

Do not invent attractions. Do not change the route sequence. Do not discard factual details.
If the source lists 10 attraction names, they must all appear in days, highlights, or routeMap.stops.

${sourceTypeBlock}

BANNED PHRASES — never use any of these in any text field:
"hidden gems", "unforgettable", "vibrant streets", "sun-drenched", "authentic culture", "charming corners",
"immerse yourself", "picture-perfect", "magical", "timeless", "breathtaking", "bustling", "nestled",
"off the beaten path", "discover the soul of", "rich tapestry", "local gems", "wander freely",
"let the city reveal", "iconic" (unless site is globally famous), "must-see gems"

PUNCTUATION RULES:
- No em dashes (—) or en dashes (–) anywhere in any text field.
- Use commas, colons, or separate sentences instead.
- Short, clear sentences. No excessive semicolons.

WRITING TONE: Direct, practical, factual. Travel editor voice. No marketing copy. No hype.

${langInstruction}

FIELD RULES:
- basics.title: from the source title; concise, destination-focused
- basics.destination: city or region from the source, e.g. "Seville, Spain"
- basics.durationDays: integer from source or inferred from day count
- basics.slug: lowercase, ASCII hyphens only — convert all unicode dashes to hyphens
- overview.tagline: max 80 chars; factual one-line summary; no clichés
- overview.description: summarise the actual route naming key attractions; 2-3 sentences; no clichés
- overview.highlights: 4-8 items; specific named attractions or neighbourhoods from the source
- overview.category: exactly one of [Road Trip, City Break, Island Journey, Cultural Route, Nature Escape, Luxury Escape]
- overview.pace: exactly one of [Relaxed, Balanced, Fast]
- overview.bestFor: subset of [Couples, Families, Friend Groups, Adventurers, Solo]
- days[].title: name the main location or theme for that day
- days[].description: 2-3 sentences grounded in the source attractions for that day
- days[].highlights: specific stops from that day's source content
- days[].insiderTip: practical tip only; e.g. "Book Cathedral tickets online in advance." No metaphors.
- sections.routeOverview: factual narrative of the route sequence, naming key stops in order
- sections.practicalNotes: addresses, opening hours, contact details from the source if available
- routeMap.stops: place names in route sequence; extract from source if listed
- warnings: note inferred fields and any data that needs verification (timings, prices)
- inferredFields: list all field names that had no direct source evidence`;

  const SCHEMA_EXAMPLE = `{"basics":{"title":"","subtitle":"","destination":"","durationDays":null,"slug":"","country":"","region":""},"overview":{"tagline":"","description":"","category":"","pace":"","bestFor":[],"groupSize":"","highlights":[]},"days":[{"dayNumber":1,"title":"","description":"","highlights":[],"insiderTip":"","imageUrl":null}],"sections":{"hotels":[{"name":"","type":"","note":""}],"practicalNotes":"","faq":[{"q":"","a":""}],"routeOverview":"","whySpecial":""},"images":{"cover":null,"gallery":[],"dayImages":[]},"seo":{"seoTitle":"","seoDescription":"","canonicalSourceUrl":"${sourceUrl || ''}"},"routeMap":{"stops":[]},"warnings":[],"inferredFields":[]}`;

  const USER = `Extract this ${sourceType === 'structured-itinerary' ? 'structured itinerary' : 'travel article'} into the HiddenAtlas import schema.

SOURCE URL: ${sourceUrl || '(pasted content)'}
PAGE TITLE: ${extracted.pageTitle || extracted.ogTitle || '(none)'}
DESCRIPTION: ${extracted.ogDescription || '(none)'}
COVER IMAGE: ${extracted.ogImage || '(none)'}

ARTICLE CONTENT:
${extracted.text}

IMAGES (${extracted.images.length} total, first 10 listed):
${imgList || '(none)'}

EXTRACTION CHECKLIST:
1. Preserve all attraction names, day titles, and route sequence from the content above.
2. Each day entry must reflect the actual attractions in the source for that day.
3. Highlights must be specific named places from the source, not generic descriptors.
4. Only infer: category, pace, bestFor, tagline, insider tips, SEO fields.
5. No em dashes, no en dashes, no banned travel phrases.
6. Warnings should flag any fields that were inferred or that need editorial verification.

Return ONLY valid JSON matching this exact structure:
${SCHEMA_EXAMPLE}`;

  // ── Attempt 1: primary extraction ─────────────────────────────────────────
  // Use 8192 tokens — a 7-day itinerary with full day descriptions can exceed 4096
  const rawText = await callClaudeRaw(SYSTEM, [{ role: 'user', content: USER }], 8192);
  console.log(`[normalize] primary response length=${rawText.length}`);

  let parsed = extractJson(rawText);
  console.log(`[normalize] primary parse: ${parsed ? 'SUCCESS' : 'FAILED'}`);

  // ── Attempt 2: repair when primary parse fails entirely ────────────────────
  if (!parsed) {
    console.log('[normalize] primary JSON unparseable — attempting AI repair...');
    parsed = await repairJsonWithClaude(rawText, sourceUrl, language);
    if (parsed) {
      console.log('[normalize] repair produced parseable JSON');
    } else {
      console.log('[normalize] repair also failed — will fall through to partial preview');
    }
  }

  // ── If we have any parsed object, normalize and validate ──────────────────
  if (parsed) {
    const normalized = normalizePreviewData(parsed, sourceUrl);
    const { valid, errors } = validatePreview(normalized);
    console.log(`[normalize] schema validation: ${valid ? 'VALID' : 'INVALID — ' + errors.join('; ')}`);

    if (valid) {
      console.log('[normalize] SUCCESS — returning full preview');
      return normalized;
    }

    // Validation failed but we have useful data — patch required fields from metadata
    console.log('[normalize] patching missing required fields from page metadata...');
    patchRequiredFields(normalized, extracted, sourceUrl);

    const { valid: v2, errors: e2 } = validatePreview(normalized);
    console.log(`[normalize] post-patch validation: ${v2 ? 'VALID' : 'STILL INVALID — ' + e2.join('; ')}`);

    if (v2) {
      console.log('[normalize] SUCCESS after field patching');
      normalized.warnings = [...(normalized.warnings || []),
        'Some fields were filled automatically from page metadata — review before publishing.',
      ];
      normalized.inferredFields = [...new Set([...(normalized.inferredFields || []), ...errors.map(e => e.split('.').slice(0, 2).join('.'))])];
      return normalized;
    }

    // Still has issues but has partial content — return with warnings rather than discarding
    console.log(`[normalize] returning partial preview with validation warnings`);
    normalized.warnings = [...(normalized.warnings || []),
      'Partial import: some content was recovered but the itinerary needs review before publishing.',
    ];
    normalized.inferredFields = [...new Set([...(normalized.inferredFields || []), ...e2.map(e => e.split('.').slice(0, 2).join('.'))])];
    return normalized;
  }

  // ── Last resort: build from page metadata only ─────────────────────────────
  console.log('[normalize] FALLBACK — building partial preview from page metadata only');
  return buildPartialPreview(extracted, sourceUrl, ['AI could not produce a valid structure after repair attempts']);
}

// Tries progressively more browser-like header sets to fetch a public page.
// Returns { html, strategy, finalUrl } on success, { blocked, status } on 403/401.
async function fetchWithStrategies(url, parsedUrl) {
  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

  const strategies = [
    {
      name: 'chrome-mac',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en-GB;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
    },
    {
      name: 'chrome-mac-referer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.9,en-GB;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': `${origin}/`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1',
      },
    },
    {
      name: 'firefox-linux',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-PT,pt;q=0.8,en-US;q=0.5,en;q=0.3',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
      },
    },
  ];

  let lastStatus = null;
  let lastError  = null;

  for (const strategy of strategies) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      console.log(`[import-url] trying strategy="${strategy.name}" url="${url}"`);
      const r = await fetch(url, {
        signal:   controller.signal,
        headers:  strategy.headers,
        redirect: 'follow',
      });
      clearTimeout(timer);

      const finalUrl    = r.url || url;
      const contentType = r.headers.get('content-type') || '';
      console.log(`[import-url] strategy="${strategy.name}" status=${r.status} finalUrl="${finalUrl}" ct="${contentType}"`);

      // Blocked by server — try next strategy
      if (r.status === 403 || r.status === 401) {
        lastStatus = r.status;
        continue;
      }
      // Rate limited — surface to user
      if (r.status === 429) {
        throw Object.assign(
          new Error('This website is rate-limiting requests. Try again in a few minutes.'),
          { status: 429 }
        );
      }
      if (!r.ok) {
        throw Object.assign(
          new Error(`Page returned HTTP ${r.status}`),
          { status: 422 }
        );
      }
      if (!contentType.includes('html') && !contentType.includes('text/plain')) {
        throw Object.assign(
          new Error('URL does not point to a web page — check the address and try again'),
          { status: 422 }
        );
      }

      const html = await r.text();
      console.log(`[import-url] strategy="${strategy.name}" SUCCESS — ${html.length} bytes`);
      return { html, strategy: strategy.name, finalUrl };

    } catch (err) {
      clearTimeout(timer);
      if (err.status) throw err; // propagate our own errors
      if (err.name === 'AbortError') {
        console.log(`[import-url] strategy="${strategy.name}" TIMEOUT`);
        lastError = 'timeout';
        continue;
      }
      console.log(`[import-url] strategy="${strategy.name}" ERROR: ${err.message}`);
      lastError = err.message;
      continue;
    }
  }

  // All strategies exhausted
  if (lastError === 'timeout') {
    throw Object.assign(
      new Error('The page timed out. The website may be slow or unavailable.'),
      { status: 408 }
    );
  }
  console.log(`[import-url] BLOCKED (all strategies) status=${lastStatus} url="${url}"`);
  return { blocked: true, status: lastStatus };
}

async function handleImportUrlPreview(body) {
  const { url, language = 'english' } = body;
  if (!url || typeof url !== 'string') {
    throw Object.assign(new Error('url is required'), { status: 400 });
  }

  let parsedUrl;
  try { parsedUrl = new URL(url); } catch {
    throw Object.assign(new Error('Invalid URL — must be a full https:// address'), { status: 400 });
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw Object.assign(new Error('Only http/https URLs are supported'), { status: 400 });
  }

  const result = await fetchWithStrategies(url, parsedUrl);

  // Blocked — return a structured response (not an error) so the frontend can show fallback UI
  if (result.blocked) {
    return { blocked: true, url };
  }

  const extracted = extractHtmlContent(result.html, result.finalUrl || url);
  console.log(`[import-url] extracted — ${extracted.text.length} chars, ${extracted.images.length} images`);

  const preview = await normalizeWithClaude(extracted, url, language);
  return { preview };
}

// Normalizes user-pasted article text (or lightly HTML-pasted content) using Claude.
// Skips the HTTP fetch step — content is provided directly by the user.
async function handleImportTextPreview(body) {
  const { text, sourceUrl = '', title = '', destination = '', language = 'english' } = body;
  if (!text || typeof text !== 'string' || text.trim().length < 50) {
    throw Object.assign(
      new Error('Please paste at least 50 characters of article content'),
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(
      new Error('AI service not configured — add ANTHROPIC_API_KEY to environment'),
      { status: 503 }
    );
  }

  // If the pasted text looks like HTML, run it through the HTML cleaner
  let cleanText;
  let images = [];
  if (/<[a-zA-Z][^>]*>/.test(text)) {
    const fromHtml = extractHtmlContent(text, sourceUrl || 'https://unknown');
    cleanText = fromHtml.text;
    images    = fromHtml.images;
    console.log(`[import-text] detected HTML in pasted content — cleaned to ${cleanText.length} chars, ${images.length} images`);
  } else {
    cleanText = text.length > 14000 ? text.slice(0, 14000) + '\n... [truncated]' : text;
    console.log(`[import-text] plain text — ${cleanText.length} chars`);
  }

  const extracted = {
    pageTitle:     title,
    ogTitle:       title,
    ogDescription: '',
    ogImage:       '',
    images,
    text: cleanText,
  };

  const preview = await normalizeWithClaude(extracted, sourceUrl, language);

  // Preserve the source URL even if Claude didn't pick it up
  if (sourceUrl) {
    if (!preview.seo) preview.seo = {};
    preview.seo.canonicalSourceUrl = sourceUrl;
  }

  // Patch destination/title hints if user provided them and Claude left them blank
  if (destination && !preview.basics?.destination) {
    if (!preview.basics) preview.basics = {};
    preview.basics.destination = destination;
  }
  if (title && (!preview.basics?.title || preview.basics.title === 'Untitled')) {
    if (!preview.basics) preview.basics = {};
    preview.basics.title = title;
  }

  // Surface that images were not auto-imported
  if (!preview.warnings) preview.warnings = [];
  if (!images.length) {
    preview.warnings.push('Images could not be imported automatically from pasted text — add cover, day and gallery images manually after saving the draft.');
  }
  preview.warnings.push('Content was imported from pasted text. Review all fields before publishing.');

  return { preview };
}

async function handleImportCsvPreview(body) {
  const { csv } = body;
  if (!csv || typeof csv !== 'string') {
    throw Object.assign(new Error('csv content is required'), { status: 400 });
  }

  const rows = parseSimpleCSV(csv);
  if (!rows.length) {
    throw Object.assign(new Error('CSV is empty or could not be parsed — check the file format'), { status: 400 });
  }

  const errors = [];
  const first  = rows[0];

  if (!first.title)                    errors.push('Missing required column: title');
  if (!first.slug && !first.destination) errors.push('Missing required column: slug or destination');
  if (errors.length) throw Object.assign(new Error(errors.join('; ')), { status: 400 });

  const slug = first.slug || slugify((first.destination || first.title || 'imported-itinerary'));

  const inferredFields = [];
  if (!first.category) inferredFields.push('category');
  if (!first.pace)     inferredFields.push('pace');
  if (!first.tagline)  inferredFields.push('tagline');

  const bestFor = first.bestFor
    ? first.bestFor.split(/[,|]/).map(s => s.trim()).filter(Boolean)
    : [];

  const highlights = first.highlights
    ? first.highlights.split('|').map(s => s.trim()).filter(Boolean)
    : [];

  // Aggregate per-day rows (dayNumber populated)
  const dayMap = {};
  for (const row of rows) {
    const dn = parseInt(row.dayNumber, 10);
    if (!isNaN(dn) && dn > 0) {
      if (!dayMap[dn]) {
        dayMap[dn] = {
          dayNumber:   dn,
          title:       row.dayTitle       || `Day ${dn}`,
          description: row.dayDescription || '',
          highlights:  row.dayHighlights
            ? row.dayHighlights.split('|').map(s => s.trim()).filter(Boolean)
            : [],
          insiderTip: row.insiderTip || '',
          imageUrl:   row.imageUrl   || null,
        };
      }
    }
  }
  const days = Object.values(dayMap).sort((a, b) => a.dayNumber - b.dayNumber);

  const hotels = rows
    .filter(r => r.hotelName)
    .map(r => ({ name: r.hotelName, type: r.hotelType || 'Hotel', note: r.hotelNote || '' }));

  const faq = rows
    .filter(r => r.faqQuestion && r.faqAnswer)
    .map(r => ({ q: r.faqQuestion, a: r.faqAnswer }));

  const durationDays = first.durationDays
    ? parseInt(first.durationDays, 10)
    : (days.length || null);

  const preview = {
    basics: {
      title:        first.title        || '',
      subtitle:     first.subtitle     || '',
      destination:  first.destination  || '',
      durationDays: isNaN(durationDays) ? null : durationDays,
      slug,
      country:      first.country      || '',
      region:       first.region       || '',
    },
    overview: {
      tagline:     first.tagline     || '',
      description: first.description || '',
      category:    first.category    || '',
      pace:        first.pace        || '',
      bestFor,
      groupSize:   first.groupSize   || '',
      highlights,
    },
    days,
    sections: {
      hotels,
      practicalNotes: first.practicalNotes || '',
      faq,
      routeOverview:  first.routeOverview  || '',
      whySpecial:     first.whySpecial     || '',
    },
    images:   { cover: first.coverImage || null, gallery: [], dayImages: [] },
    seo: {
      seoTitle:           first.seoTitle       || '',
      seoDescription:     first.seoDescription || '',
      canonicalSourceUrl: '',
    },
    routeMap:      { stops: [] },
    warnings:      [],
    inferredFields,
  };

  return { preview };
}

async function handleImportConfirm(pool, body, ctx) {
  const { preview, ownerDesignerId } = body;
  if (!preview?.basics) {
    throw Object.assign(new Error('Invalid preview data'), { status: 400 });
  }

  const { basics, overview, days, sections, images, seo, routeMap } = preview;

  // Build a unique slug
  let slug = slugify(basics.slug || basics.title || 'imported-itinerary');
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
    const { rows: found } = await pool.query(
      `SELECT id FROM "Itinerary" WHERE slug = $1 LIMIT 1`, [candidate]
    );
    if (!found.length) { slug = candidate; break; }
    if (attempt === 49) slug = `${slug}-${Date.now()}`;
  }

  // Map preview to content JSONB
  const content = {
    hero: {
      title:       basics.title    || '',
      subtitle:    basics.subtitle || '',
      tagline:     overview?.tagline   || '',
      coverImage:  images?.cover   || '',
    },
    summary: {
      shortDescription: overview?.description   || '',
      whySpecial:       sections?.whySpecial    || '',
      routeOverview:    sections?.routeOverview || '',
      highlights:       overview?.highlights    || [],
      included:         [],
    },
    tripFacts: {
      groupSize:  overview?.groupSize || '',
      difficulty: overview?.pace      || 'Moderate',
      bestFor:    overview?.bestFor   || [],
      category:   overview?.category  || '',
    },
    days: (days || []).map((d, i) => ({
      day:     d.dayNumber || i + 1,
      title:   d.title       || '',
      desc:    d.description || '',
      bullets: d.highlights  || [],
      tip:     d.insiderTip  || '',
      img:     d.imageUrl    || '',
    })),
    sections: {
      hotels: (sections?.hotels || []).map(h => ({
        name: h.name || '', type: h.type || 'Hotel', note: h.note || '',
      })),
      practicalNotes: sections?.practicalNotes || '',
      faq: (sections?.faq || []).map(f => ({ q: f.q || '', a: f.a || '' })),
    },
    pdfConfig: { showRouteMap: true, showHotels: true },
    seo:       { metaTitle: seo?.seoTitle || '', metaDescription: seo?.seoDescription || '' },
    routeMap:  {
      showOnSite: false,
      imageUrl:   '', alt: '', caption: '',
      stops: (routeMap?.stops || []).map((s, i) => ({
        id:        `stop-${i + 1}`,
        order:     s.order     || i + 1,
        name:      s.name      || '',
        latitude:  typeof s.latitude  === 'number' ? s.latitude  : null,
        longitude: typeof s.longitude === 'number' ? s.longitude : null,
        dayNumber: s.dayNumber || null,
        source:    'imported',
        visible:   true,
      })),
    },
  };

  // Creator assignment — admins may pass ownerDesignerId; non-admins are forced to their own
  let creatorId = null;
  if (ctx.isAdmin && ownerDesignerId) {
    // Verify the creator exists
    const { rows: cr } = await pool.query(`SELECT id FROM "Creator" WHERE id = $1 LIMIT 1`, [ownerDesignerId]);
    if (cr.length) creatorId = ownerDesignerId;
  }
  // handleCreate will override creatorId for non-admins automatically

  const createBody = {
    title:        basics.title       || 'Imported Itinerary',
    subtitle:     basics.subtitle    || '',
    slug,
    destination:  basics.destination || '',
    country:      basics.country     || '',
    region:       basics.region      || '',
    durationDays: basics.durationDays || null,
    type:         'free',
    isPrivate:    false,
    coverImage:   images?.cover || '',
    content,
    status:       'draft',
    creatorId,
  };

  console.log(`[import-confirm] creating draft: "${createBody.title}" slug="${slug}"`);
  const result = await handleCreate(pool, createBody, ctx);

  // Create structured day stops from imported data.
  // Priority: preview.days[].dayStops (if AI output includes them) → parse highlights as stops.
  const itineraryId = result?.itinerary?.id;
  if (itineraryId) {
    try {
      let stopsToCreate = [];

      for (const d of (days || [])) {
        const dayNum = d.dayNumber || 0;
        if (!dayNum) continue;

        // If the preview already has structured dayStops (future AI schema), use them
        if (Array.isArray(d.dayStops) && d.dayStops.length) {
          d.dayStops.forEach((s, si) => {
            if (!s.title?.trim()) return;
            stopsToCreate.push({ dayNum, sortOrder: si, ...s });
          });
        } else if (Array.isArray(d.highlights) && d.highlights.length) {
          // Fall back: convert bullet highlights to basic stops (showOnMap=false until coords added)
          d.highlights.forEach((h, hi) => {
            if (!h?.trim()) return;
            const colonIdx = h.indexOf(':');
            const title = colonIdx > 0 ? h.slice(0, colonIdx).trim() : h.trim();
            const desc  = colonIdx > 0 ? h.slice(colonIdx + 1).trim() : null;
            stopsToCreate.push({ dayNum, sortOrder: hi, title, description: desc, type: 'attraction', showOnMap: false });
          });
        }
      }

      if (stopsToCreate.length) {
        for (const s of stopsToCreate) {
          const stopType = DAY_STOP_TYPES.includes(s.type) ? s.type : 'attraction';
          await pool.query(
            `INSERT INTO "ItineraryDayStop"
               ("itineraryId", "dayNumber", title, description, type,
                "locationName", address, latitude, longitude,
                "suggestedTime", "durationMinutes", "sortOrder",
                "isOptional", "isMajorStop", "showOnMap", "bookingRecommended", "bookingUrl", notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              itineraryId, s.dayNum,
              s.title.trim(), s.description || null, stopType,
              s.locationName || null, s.address || null,
              s.latitude != null ? Number(s.latitude) : null,
              s.longitude != null ? Number(s.longitude) : null,
              s.suggestedTime || null,
              s.durationMinutes != null ? Number(s.durationMinutes) : null,
              Number(s.sortOrder ?? 0),
              Boolean(s.isOptional), Boolean(s.isMajorStop),
              s.showOnMap !== false,
              Boolean(s.bookingRecommended), s.bookingUrl || null, s.notes || null,
            ]
          );
        }
        console.log(`[import-confirm] created ${stopsToCreate.length} day stops for itinerary ${itineraryId}`);
      }
    } catch (e) {
      // Non-fatal — log and continue. Table may not be migrated yet.
      console.warn(`[import-confirm] day stop creation failed:`, e.message);
    }
  }

  return result;
}

// ── Day Stop CRUD ─────────────────────────────────────────────────────────────

const DAY_STOP_TYPES = [
  'attraction', 'restaurant', 'hotel', 'winery', 'viewpoint', 'beach',
  'museum', 'transfer', 'experience', 'walk', 'free_time', 'other',
];

async function handleListDayStops(pool, itineraryId) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(
    `SELECT id, "itineraryId", "dayNumber", title, description, type,
            "locationName", address, latitude, longitude,
            "suggestedTime", "durationMinutes", "sortOrder",
            "isOptional", "isMajorStop", "showOnMap",
            "bookingRecommended", "bookingUrl", notes, metadata,
            "createdAt", "updatedAt"
     FROM "ItineraryDayStop"
     WHERE "itineraryId" = $1
     ORDER BY "dayNumber" ASC, "sortOrder" ASC, "createdAt" ASC`,
    [itineraryId]
  );
  return { stops: rows };
}

async function handleUpsertDayStop(pool, itineraryId, body) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  const {
    stopId,
    dayNumber, title, description, type = 'attraction',
    locationName, address, latitude, longitude,
    suggestedTime, durationMinutes, sortOrder = 0,
    isOptional = false, isMajorStop = false, showOnMap = true,
    bookingRecommended = false, bookingUrl, notes, metadata = {},
  } = body;

  if (!title?.trim()) throw Object.assign(new Error('title is required'), { status: 400 });
  if (!dayNumber)     throw Object.assign(new Error('dayNumber is required'), { status: 400 });
  const stopType = DAY_STOP_TYPES.includes(type) ? type : 'attraction';

  if (stopId) {
    // Update existing stop
    const { rows } = await pool.query(
      `UPDATE "ItineraryDayStop"
       SET title = $1, description = $2, type = $3,
           "locationName" = $4, address = $5, latitude = $6, longitude = $7,
           "suggestedTime" = $8, "durationMinutes" = $9, "sortOrder" = $10,
           "isOptional" = $11, "isMajorStop" = $12, "showOnMap" = $13,
           "bookingRecommended" = $14, "bookingUrl" = $15, notes = $16,
           metadata = $17, "updatedAt" = NOW()
       WHERE id = $18 AND "itineraryId" = $19
       RETURNING *`,
      [
        title.trim(), description || null, stopType,
        locationName || null, address || null,
        latitude != null ? Number(latitude) : null,
        longitude != null ? Number(longitude) : null,
        suggestedTime || null,
        durationMinutes != null ? Number(durationMinutes) : null,
        Number(sortOrder),
        Boolean(isOptional), Boolean(isMajorStop), Boolean(showOnMap),
        Boolean(bookingRecommended), bookingUrl || null, notes || null,
        metadata,
        stopId, itineraryId,
      ]
    );
    if (!rows.length) throw Object.assign(new Error('Stop not found'), { status: 404 });
    return { stop: rows[0] };
  }

  // Create new stop
  const { rows } = await pool.query(
    `INSERT INTO "ItineraryDayStop"
       ("itineraryId", "dayNumber", title, description, type,
        "locationName", address, latitude, longitude,
        "suggestedTime", "durationMinutes", "sortOrder",
        "isOptional", "isMajorStop", "showOnMap",
        "bookingRecommended", "bookingUrl", notes, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      itineraryId, Number(dayNumber),
      title.trim(), description || null, stopType,
      locationName || null, address || null,
      latitude != null ? Number(latitude) : null,
      longitude != null ? Number(longitude) : null,
      suggestedTime || null,
      durationMinutes != null ? Number(durationMinutes) : null,
      Number(sortOrder),
      Boolean(isOptional), Boolean(isMajorStop), Boolean(showOnMap),
      Boolean(bookingRecommended), bookingUrl || null, notes || null,
      metadata,
    ]
  );
  return { stop: rows[0] };
}

// ── Geocoding helpers ─────────────────────────────────────────────────────────
const geocodeDelay = ms => new Promise(r => setTimeout(r, ms));

function buildGeocodeQuery(stop, itin) {
  const parts = [];
  if (stop.address && stop.address.trim()) {
    parts.push(stop.address.trim());
    if (itin.country) parts.push(itin.country);
  } else {
    const name = (stop.locationName || stop.title || '').trim();
    if (name) parts.push(name);
    if (itin.destination) parts.push(itin.destination);
    else if (itin.region) parts.push(itin.region);
    if (itin.country) parts.push(itin.country);
  }
  return parts.filter(Boolean).join(', ');
}

function isClearResult(results) {
  if (results.length === 1) return true;
  if (results.length > 1 && parseFloat(results[0].importance) >= 0.6) return true;
  return false;
}

function countryMismatch(itinCountry, resultAddress) {
  if (!itinCountry || !resultAddress) return false;
  const rc = (resultAddress.country || '').toLowerCase();
  const ic = itinCountry.toLowerCase();
  return rc && ic && !rc.includes(ic) && !ic.includes(rc);
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'HiddenAtlas/1.0 (hiddenatlas.travel)',
      'Accept-Language': 'en',
    },
  });
  if (!resp.ok) throw Object.assign(new Error('Geocoding service unavailable'), { status: 503 });
  return resp.json();
}

// Geocode a single stop. If stopId provided, auto-saves to DB when result is clear.
// If no stopId (new stop in form), returns coordinates without saving.
async function handleGeocodeStop(pool, itineraryId, body) {
  const { stopId, title, locationName, address } = body;

  let stop;
  if (stopId) {
    const { rows } = await pool.query(
      `SELECT * FROM "ItineraryDayStop" WHERE id = $1 AND "itineraryId" = $2`,
      [stopId, itineraryId]
    );
    if (!rows.length) throw Object.assign(new Error('Stop not found'), { status: 404 });
    stop = rows[0];
  } else {
    stop = { title: title || '', locationName: locationName || '', address: address || '', metadata: {} };
  }

  const { rows: itinRows } = await pool.query(
    `SELECT destination, country, region FROM "Itinerary" WHERE id = $1`,
    [itineraryId]
  );
  const itin = itinRows[0] || {};
  const query = buildGeocodeQuery(stop, itin);
  if (!query.trim()) return { status: 'not_found', query };

  const results = await nominatimSearch(query);
  if (!Array.isArray(results) || results.length === 0) return { status: 'not_found', query };

  const clear = isClearResult(results);
  const r = results[0];
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  const warning = countryMismatch(itin.country, r.address)
    ? `Result is in ${r.address?.country || '?'} — please confirm this is correct.`
    : null;

  if (clear) {
    const geocodingMeta = {
      provider: 'nominatim', displayName: r.display_name,
      confidence: 'auto', geocodedAt: new Date().toISOString(),
    };

    if (stopId) {
      const existing = stop.metadata || {};
      const metadata = { ...existing, geocoding: geocodingMeta };
      const { rows: updated } = await pool.query(
        `UPDATE "ItineraryDayStop" SET latitude = $1, longitude = $2, metadata = $3, "updatedAt" = NOW()
         WHERE id = $4 AND "itineraryId" = $5 RETURNING *`,
        [lat, lng, JSON.stringify(metadata), stopId, itineraryId]
      );
      return { status: 'saved', stop: updated[0], result: { lat, lng, displayName: r.display_name }, warning };
    }
    return { status: 'found', result: { lat, lng, displayName: r.display_name }, warning };
  }

  const candidates = results.slice(0, 5).map(r2 => ({
    lat: parseFloat(r2.lat), lng: parseFloat(r2.lon),
    displayName: r2.display_name,
    type: r2.type,
    importance: parseFloat(r2.importance),
    country: r2.address?.country || '',
    city: r2.address?.city || r2.address?.town || r2.address?.village || '',
  }));
  return { status: 'candidates', candidates, query };
}

// Save a user-selected geocoding candidate to a stop.
async function handleApplyGeocodeCandidate(pool, itineraryId, body) {
  const { stopId, lat, lng, displayName } = body;
  if (!stopId || lat == null || lng == null) throw Object.assign(new Error('stopId, lat, lng required'), { status: 400 });
  const { rows: stopRows } = await pool.query(
    `SELECT metadata FROM "ItineraryDayStop" WHERE id = $1 AND "itineraryId" = $2`,
    [stopId, itineraryId]
  );
  if (!stopRows.length) throw Object.assign(new Error('Stop not found'), { status: 404 });
  const existing = stopRows[0].metadata || {};
  const metadata = {
    ...existing,
    geocoding: {
      provider: 'nominatim', displayName: displayName || '',
      confidence: 'manual', geocodedAt: new Date().toISOString(),
    },
  };
  const { rows: updated } = await pool.query(
    `UPDATE "ItineraryDayStop" SET latitude = $1, longitude = $2, metadata = $3, "updatedAt" = NOW()
     WHERE id = $4 AND "itineraryId" = $5 RETURNING *`,
    [Number(lat), Number(lng), JSON.stringify(metadata), stopId, itineraryId]
  );
  return { stop: updated[0] };
}

// Bulk geocode all showOnMap stops missing coordinates (max 5 per call, throttled).
async function handleGeocodeMissingStops(pool, itineraryId) {
  const { rows: stops } = await pool.query(
    `SELECT * FROM "ItineraryDayStop"
     WHERE "itineraryId" = $1 AND "showOnMap" = true
       AND (latitude IS NULL OR longitude IS NULL)
     ORDER BY "dayNumber", "sortOrder" LIMIT 5`,
    [itineraryId]
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM "ItineraryDayStop"
     WHERE "itineraryId" = $1 AND "showOnMap" = true AND (latitude IS NULL OR longitude IS NULL)`,
    [itineraryId]
  );
  const totalMissing = parseInt(countRows[0].count);
  const { rows: itinRows } = await pool.query(
    `SELECT destination, country, region FROM "Itinerary" WHERE id = $1`,
    [itineraryId]
  );
  const itin = itinRows[0] || {};
  const geocoded = [], candidates = [], failed = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const query = buildGeocodeQuery(stop, itin);
    if (!query.trim()) { failed.push({ id: stop.id, title: stop.title, reason: 'No search terms' }); continue; }
    try {
      const results = await nominatimSearch(query);
      if (!Array.isArray(results) || results.length === 0) {
        failed.push({ id: stop.id, title: stop.title, reason: 'Not found', query });
      } else if (isClearResult(results)) {
        const r = results[0];
        const lat = parseFloat(r.lat); const lng = parseFloat(r.lon);
        const existing = stop.metadata || {};
        const metadata = { ...existing, geocoding: { provider: 'nominatim', displayName: r.display_name, confidence: 'auto', geocodedAt: new Date().toISOString() } };
        await pool.query(
          `UPDATE "ItineraryDayStop" SET latitude = $1, longitude = $2, metadata = $3, "updatedAt" = NOW() WHERE id = $4`,
          [lat, lng, JSON.stringify(metadata), stop.id]
        );
        geocoded.push({ id: stop.id, title: stop.title, lat, lng, displayName: r.display_name });
      } else {
        candidates.push({
          id: stop.id, title: stop.title,
          candidates: results.slice(0, 3).map(r2 => ({ lat: parseFloat(r2.lat), lng: parseFloat(r2.lon), displayName: r2.display_name, country: r2.address?.country || '' })),
        });
      }
    } catch (err) {
      failed.push({ id: stop.id, title: stop.title, reason: err.message });
    }
    if (i < stops.length - 1) await geocodeDelay(1100); // respect Nominatim 1 req/sec
  }
  return { geocoded, candidates, failed, remaining: Math.max(0, totalMissing - stops.length) };
}

async function handleDeleteDayStop(pool, itineraryId, stopId) {
  if (!stopId) throw Object.assign(new Error('stopId is required'), { status: 400 });
  await pool.query(
    `DELETE FROM "ItineraryDayStop" WHERE id = $1 AND "itineraryId" = $2`,
    [stopId, itineraryId]
  );
  return { ok: true };
}

async function handleReorderDayStops(pool, itineraryId, body) {
  // body.order: [{ id, sortOrder }]
  const items = body.order;
  if (!Array.isArray(items) || !items.length) return { ok: true };

  for (const { id, sortOrder } of items) {
    if (!id) continue;
    await pool.query(
      `UPDATE "ItineraryDayStop" SET "sortOrder" = $1, "updatedAt" = NOW()
       WHERE id = $2 AND "itineraryId" = $3`,
      [Number(sortOrder), id, itineraryId]
    );
  }
  return { ok: true };
}

// AI-assisted: parse existing bullets into structured stops
async function handleGenerateStopsFromBullets(pool, id, body) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('AI not configured'), { status: 503 });

  const { rows } = await pool.query(
    `SELECT content FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Itinerary not found'), { status: 404 });

  const content = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
  const days = content?.days || [];
  if (!days.length) return { stops: [] };

  // Build a compact bullets list for AI
  const bulletLines = days.flatMap(d =>
    (d.bullets || []).map(b => `Day ${d.day}: ${b}`)
  ).join('\n');

  if (!bulletLines.trim()) return { stops: [] };

  const { Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Convert these itinerary bullet points into structured day stops. For each bullet, output a JSON object.

Bullets:
${bulletLines}

Return JSON array. Each item:
{
  "dayNumber": <number>,
  "title": "<main name, before ':' if present>",
  "description": "<detail after ':' if present, else null>",
  "type": "<one of: attraction|restaurant|hotel|winery|viewpoint|beach|museum|transfer|experience|walk|free_time|other>",
  "sortOrder": <0-based within day>
}

Return ONLY the JSON array, no commentary.`,
    }],
  });

  let parsed;
  try {
    const text = msg.content[0]?.text || '[]';
    const match = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(match ? match[0] : '[]');
  } catch {
    parsed = [];
  }

  // Insert all generated stops
  const created = [];
  for (const s of parsed) {
    if (!s.title?.trim() || !s.dayNumber) continue;
    const stopType = DAY_STOP_TYPES.includes(s.type) ? s.type : 'attraction';
    const { rows: ins } = await pool.query(
      `INSERT INTO "ItineraryDayStop"
         ("itineraryId", "dayNumber", title, description, type, "sortOrder", "showOnMap")
       VALUES ($1,$2,$3,$4,$5,$6,false)
       RETURNING *`,
      [id, Number(s.dayNumber), s.title.trim(), s.description || null, stopType, Number(s.sortOrder ?? 0)]
    );
    created.push(ins[0]);
  }

  console.log(`[generate-stops-from-bullets] itinerary=${id} | created ${created.length} stops`);
  return { stops: created };
}

// Rebuild content.routeMap.stops from ItineraryDayStop rows that have coordinates
async function handleRegenerateRouteFromStops(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows: stopRows } = await pool.query(
    `SELECT "dayNumber", title, latitude, longitude, "isMajorStop", "sortOrder"
     FROM "ItineraryDayStop"
     WHERE "itineraryId" = $1 AND "showOnMap" = true
       AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY "dayNumber" ASC, "sortOrder" ASC`,
    [id]
  );

  if (!stopRows.length) return { ok: true, count: 0, message: 'No stops with coordinates found' };

  const stops = stopRows.map((s, i) => ({
    id:        `stop-${i}-${Date.now()}`,
    name:      s.title,
    dayNumber: s.dayNumber,
    latitude:  s.latitude,
    longitude: s.longitude,
    type:      s.isMajorStop || i === 0 || i === stopRows.length - 1 ? 'major' : 'stop',
    visible:   true,
    order:     i + 1,
  }));

  // Patch content.routeMap.stops
  const { rows } = await pool.query(`SELECT content FROM "Itinerary" WHERE id = $1`, [id]);
  if (!rows.length) throw Object.assign(new Error('Itinerary not found'), { status: 404 });

  const content = typeof rows[0].content === 'string' ? JSON.parse(rows[0].content) : rows[0].content;
  content.routeMap = { ...(content.routeMap || {}), stops, showOnSite: true };

  await pool.query(
    `UPDATE "Itinerary" SET content = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify(content), id]
  );

  console.log(`[regenerate-route-from-stops] itinerary=${id} | ${stops.length} stops written to routeMap`);
  return { ok: true, count: stops.length, stops };
}

// ──────────────────────────────────────────────────────────────────────────────

function handleImportCsvTemplate() {
  const csv = [
    'title,subtitle,destination,durationDays,country,region,tagline,description,category,pace,bestFor,groupSize,slug,seoTitle,seoDescription,highlights,coverImage,routeOverview,whySpecial,practicalNotes,dayNumber,dayTitle,dayDescription,dayHighlights,insiderTip,imageUrl,hotelName,hotelType,hotelNote,faqQuestion,faqAnswer',
    '"10 Days in Puglia","Southern Italy Road Trip","Puglia, Italy",10,"Italy","Puglia","Ancient trulli and sun-bleached piazzas","Discover the soul of southern Italy across 10 leisurely days through trulli villages, baroque towns, and a rugged coastline.","Road Trip","Relaxed","Couples|Families","2-6 people","puglia-10-days","10 Days in Puglia, Italy | Road Trip","Explore Puglia\'s trulli villages, whitewashed towns and seafood coast in 10 days.","Trulli of Alberobello|Baroque Lecce|Polignano cliffs|Ostuni hilltop|Otranto castle|Adriatic seafood","","Drive along the Valle d\'Itria and the Adriatic coast","The light in Puglia is unlike anywhere else in Europe","Rent a car. Best visited April-June or September-October. Cash useful in smaller towns.","","","","","","","","","","",""',
    '"","","","","","","","","","","","","","","","","","","","","1","Arrival in Bari","Fly into Bari Karol Wojtyla Airport and check into the old quarter. Explore the Basilica di San Nicola and the seafront promenade before dinner in the Murattiano district.","Basilica di San Nicola|Seafront promenade|Old town dinner","Try focaccia barese from a street bakery","","","","","","",""',
    '"","","","","","","","","","","","","","","","","","","","","2","Alberobello and the Valle d\'Itria","Drive south through the Valle d\'Itria to Alberobello, home to over 1,500 trulli houses. Explore the Rione Monti district.","Rione Monti trulli|Locorotondo walls|Valle d\'Itria overlook","Visit early morning before tour groups arrive","","Masseria Torre Coccaro","Masseria Hotel","A historic working farm converted into a boutique retreat surrounded by olive groves","",""',
  ].join('\n');
  return { csv };
}
