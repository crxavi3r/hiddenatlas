// ── Itinerary CMS API ─────────────────────────────────────────────────────────
// Admin-only. All actions require a valid admin JWT.
//
// GET  /api/itinerary-cms?action=list
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
// POST /api/itinerary-cms?action=ai-generate

import pg                         from 'pg';
import { verifyAuth }             from './_lib/verifyAuth.js';
import { existsSync }             from 'fs';
import { readdir, readFile }      from 'fs/promises';
import path                       from 'path';

const { Pool } = pg;

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

// ── Auth guard (same pattern as api/admin.js) ─────────────────────────────────
async function verifyAdmin(authHeader, pool) {
  let clerkId;
  try { clerkId = await verifyAuth(authHeader); }
  catch { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }

  const { rows } = await pool.query(
    `SELECT email FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
  );
  const email = rows[0]?.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return email;
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
  let adminEmail;
  try {
    adminEmail = await verifyAdmin(req.headers.authorization, pool);
  } catch (err) {
    await pool.end();
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const action = req.query.action;
  const id     = req.query.id;

  try {
    if (req.method === 'GET') {
      if (action === 'list')           return res.json(await handleList(pool));
      if (action === 'get')            return res.json(await handleGet(pool, id));
      if (action === 'assets')         return res.json(await handleListAssets(pool, id));
      if (action === 'scan-assets')    return res.json(await handleScanAssets(req.query.slug));
      if (action === 'ai-history')     return res.json(await handleAIHistory(pool, id));
      if (action === 'linked-request') return res.json(await handleLinkedRequest(pool, id));
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      if (action === 'create')       return res.json(await handleCreate(pool, body));
      if (action === 'update')       return res.json(await handleUpdate(pool, id, body));
      if (action === 'duplicate')    return res.json(await handleDuplicate(pool, id));
      if (action === 'delete')       return res.json(await handleDelete(pool, id));
      if (action === 'publish')      return res.json(await handleSetStatus(pool, id, 'published'));
      if (action === 'unpublish')    return res.json(await handleSetStatus(pool, id, 'draft'));
      if (action === 'seed')         return res.json(await handleSeed(pool, body));
      if (action === 'bulk-publish') return res.json(await handleBulkPublish(pool));
      if (action === 'save-asset')   return res.json(await handleSaveAsset(pool, body));
      if (action === 'delete-asset') return res.json(await handleDeleteAsset(pool, id));
      if (action === 'toggle-asset') return res.json(await handleToggleAsset(pool, id));
      if (action === 'ai-generate')  return res.json(await handleAIGenerate(pool, body, adminEmail));
      return res.status(400).json({ error: 'Unknown POST action' });
    }
  } catch (err) {
    console.error('[itinerary-cms]', err);
    return res.status(500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

// ── List all itineraries (CMS view) ──────────────────────────────────────────
// Uses SELECT i.* so the query works on both the base schema (pre-migration) and
// the extended schema (post-migration). New columns (subtitle, destination, status,
// updatedAt, etc.) will be undefined in rows until the 20260316100000 migration runs.
// ORDER BY createdAt is always safe; updatedAt is used by the UI when available.
async function handleList(pool) {
  const { rows } = await pool.query(`
    SELECT i.*, COUNT(p.id)::int AS purchase_count
    FROM "Itinerary" i
    LEFT JOIN "Purchase" p ON p."itineraryId" = i.id
    GROUP BY i.id
    ORDER BY i."createdAt" DESC
  `);
  return { itineraries: rows };
}

// ── Get single itinerary with full content ────────────────────────────────────
async function handleGet(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM "Itinerary" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { itinerary: rows[0] };
}

// ── Create new itinerary ──────────────────────────────────────────────────────
async function handleCreate(pool, body) {
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
    price = 0,
    stripePriceId = null,
    coverImage = '',
    content = {},
    status = 'draft',
  } = body;

  if (!slug) throw Object.assign(new Error('slug is required'), { status: 400 });

  const rawContent   = typeof content === 'string'
    ? (() => { try { return JSON.parse(content); } catch { return {}; } })()
    : (content ?? {});
  const finalContent = mergeEmptyContent(rawContent);
  const finalType       = ['free', 'premium', 'custom'].includes(type) ? type : 'free';
  const finalAccessType = finalType === 'free' ? 'free' : 'paid';
  const finalPrivate    = finalType === 'custom' ? true : Boolean(isPrivate);

  const { rows } = await pool.query(
    `INSERT INTO "Itinerary"
       (title, subtitle, slug, destination, country, region, "durationDays",
        "accessType", price, "stripePriceId", "coverImage", description,
        type, "isPrivate", "isCollection", status, "isPublished", content, "schemaVersion", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,false,$15,$16,$17,1,NOW())
     RETURNING *`,
    [
      title, subtitle, slug, destination, country, region, durationDays,
      finalAccessType, finalType === 'free' ? 0 : (price || 0), stripePriceId || null,
      coverImage,
      finalContent.summary?.shortDescription || '',
      finalType, finalPrivate,
      status, status === 'published',
      JSON.stringify(finalContent),
    ]
  );
  return { itinerary: rows[0] };
}

// ── Update itinerary ──────────────────────────────────────────────────────────
async function handleUpdate(pool, id, body) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });

  const {
    title, subtitle, slug, destination, country, region, durationDays,
    accessType, price, stripePriceId, coverImage, content, status,
    type, isPrivate, isCollection,
  } = body;

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
       price           = COALESCE($10, price),
       "stripePriceId" = $11,
       "coverImage"    = COALESCE(NULLIF($12,''), "coverImage"),
       description     = COALESCE(NULLIF($13,''), description),
       status          = COALESCE($14, status),
       "isPublished"   = $15,
       content         = $16::jsonb,
       type            = COALESCE($17, type),
       "isPrivate"     = COALESCE($18::boolean, "isPrivate"),
       "isCollection"  = COALESCE($19::boolean, "isCollection"),
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
      accessTypeParam === 'free' ? 0 : (price ?? null),
      stripePriceId ?? null,
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
        type, "isPrivate", status, "isPublished", content, "schemaVersion", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',false,$16,$17,NOW())
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
  const { rows } = await pool.query(
    `UPDATE "Itinerary"
     SET status = $2, "isPublished" = $3, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING id, slug, status, "isPublished"`,
    [id, status, status === 'published']
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { itinerary: rows[0] };
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

// ── Assets: list ──────────────────────────────────────────────────────────────
async function handleListAssets(pool, itineraryId) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  const { rows } = await pool.query(
    `SELECT * FROM "ItineraryAsset"
     WHERE "itineraryId" = $1
     ORDER BY "assetType", "sortOrder", "createdAt"`,
    [itineraryId]
  );
  return { assets: rows };
}

// ── Assets: scan filesystem ────────────────────────────────────────────────────
// Walks content/itineraries/<slug>/ and returns normalized asset metadata.
// URLs point to /api/content-image?slug=...&path=... proxy.
// No DB involved — read-only, used to hydrate the Images tab on load.
async function handleScanAssets(slug) {
  if (!slug) throw Object.assign(new Error('slug is required'), { status: 400 });

  const contentDir = path.join(process.cwd(), 'content', 'itineraries', slug);
  if (!existsSync(contentDir)) return { assets: [] };

  const IMAGE_RE = /\.(jpg|jpeg|png|webp|gif|avif)$/i;

  function makeUrl(relPath) {
    return `/api/content-image?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(relPath)}`;
  }

  function altFromFilename(filename) {
    return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  }

  const assets = [];

  // Hero — read heroImage filename from itinerary.json, fallback to cover.jpg
  let meta = {};
  try {
    meta = JSON.parse(await readFile(path.join(contentDir, 'itinerary.json'), 'utf8'));
  } catch { /* no metadata */ }

  const heroFilename = meta.heroImage || 'cover.jpg';
  const heroPath     = path.join(contentDir, heroFilename);
  if (existsSync(heroPath) && IMAGE_RE.test(heroFilename)) {
    assets.push({
      id: null, assetType: 'hero',
      url: makeUrl(heroFilename),
      alt: `${meta.title || slug} cover`,
      caption: '', source: 'filesystem', active: true, sortOrder: 0,
    });
  }

  // Gallery
  const galleryDir = path.join(contentDir, 'gallery');
  if (existsSync(galleryDir)) {
    const files = (await readdir(galleryDir)).filter(f => IMAGE_RE.test(f)).sort();
    files.forEach((file, i) => assets.push({
      id: null, assetType: 'gallery',
      url:     makeUrl(`gallery/${file}`),
      alt:     altFromFilename(file),
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  // Research
  const researchDir = path.join(contentDir, 'research');
  if (existsSync(researchDir)) {
    const files = (await readdir(researchDir)).filter(f => IMAGE_RE.test(f)).sort();
    files.forEach((file, i) => assets.push({
      id: null, assetType: 'research',
      url:     makeUrl(`research/${file}`),
      alt:     altFromFilename(file),
      caption: '', source: 'filesystem', active: true, sortOrder: i,
    }));
  }

  // Day images — day-images/day{N}/<file>
  const dayImagesDir = path.join(contentDir, 'day-images');
  if (existsSync(dayImagesDir)) {
    const dayFolders = (await readdir(dayImagesDir)).sort();
    for (const dayFolder of dayFolders) {
      const match = dayFolder.match(/^day(\d+)$/i);
      if (!match) continue;
      const dayNumber = parseInt(match[1], 10);
      const dayDir    = path.join(dayImagesDir, dayFolder);
      const files     = (await readdir(dayDir)).filter(f => IMAGE_RE.test(f)).sort();
      files.forEach((file, i) => assets.push({
        id: null, assetType: 'day',
        dayNumber,
        url:     makeUrl(`day-images/${dayFolder}/${file}`),
        alt:     `Day ${dayNumber}`,
        caption: '', source: 'filesystem', active: true, sortOrder: i,
      }));
    }
  }

  return { assets };
}

// ── Assets: save (create or update) ──────────────────────────────────────────
async function handleSaveAsset(pool, body) {
  const { itineraryId, id, assetType = 'gallery', url, alt = '', caption = '', sortOrder = 0, source = 'manual' } = body;
  if (!itineraryId) throw Object.assign(new Error('itineraryId is required'), { status: 400 });
  if (!url)         throw Object.assign(new Error('url is required'), { status: 400 });

  if (id) {
    // Update existing
    const { rows } = await pool.query(
      `UPDATE "ItineraryAsset"
       SET "assetType"=$2, url=$3, alt=$4, caption=$5, "sortOrder"=$6
       WHERE id=$1 AND "itineraryId"=$7
       RETURNING *`,
      [id, assetType, url, alt, caption, sortOrder, itineraryId]
    );
    return { asset: rows[0] };
  }

  const { rows } = await pool.query(
    `INSERT INTO "ItineraryAsset" ("itineraryId","assetType",url,alt,caption,"sortOrder",source)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [itineraryId, assetType, url, alt, caption, sortOrder, source]
  );
  return { asset: rows[0] };
}

// ── Assets: delete ────────────────────────────────────────────────────────────
async function handleDeleteAsset(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
  await pool.query(`DELETE FROM "ItineraryAsset" WHERE id = $1`, [id]);
  return { ok: true };
}

// ── Assets: toggle active ─────────────────────────────────────────────────────
async function handleToggleAsset(pool, id) {
  if (!id) throw Object.assign(new Error('id is required'), { status: 400 });
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
