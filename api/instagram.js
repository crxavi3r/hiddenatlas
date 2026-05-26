// ── Instagram Graph API Integration ──────────────────────────────────────────
//
// OAuth (browser-triggered, no Auth header):
//   GET  /api/instagram?action=auth-url&creatorId=:id   — returns OAuth redirect URL
//   GET  /api/instagram?code=...&state=...               — OAuth callback (detected by params)
//
// Publishing (require valid admin/designer JWT):
//   GET  /api/instagram?action=preview&id=:itineraryId  — caption + image list
//   POST /api/instagram?action=publish                   — publish to Instagram
//
// Account management (require valid JWT):
//   POST /api/instagram?action=disconnect                — remove Instagram connection
//   GET  /api/instagram?action=logs&id=:itineraryId     — publish history (admin only)
//
// Required env vars: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_REDIRECT_URI, DATABASE_URL

import pg             from 'pg';
import crypto         from 'crypto';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;
const FB_API           = 'https://graph.facebook.com/v18.0';
const REQUIRED_SCOPES  = 'instagram_basic,instagram_content_publish,pages_show_list';

// ── Env guard ─────────────────────────────────────────────────────────────────
function requireInstagramEnv() {
  const missing = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI']
    .filter(k => !process.env[k]);
  if (missing.length) {
    throw Object.assign(
      new Error(`Instagram integration is not configured (missing: ${missing.join(', ')})`),
      { status: 503 }
    );
  }
}

// ── State signing — prevents CSRF on OAuth callback ───────────────────────────
// state = base64url( creatorId + ':' + timestamp + ':' + hmac[0:16] )
function signState(creatorId) {
  const ts  = Date.now();
  const msg = `${creatorId}:${ts}`;
  const sig = crypto
    .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
    .update(msg)
    .digest('hex')
    .slice(0, 16);
  return Buffer.from(`${msg}:${sig}`).toString('base64url');
}

function verifyState(state) {
  try {
    const decoded   = Buffer.from(state, 'base64url').toString();
    const lastColon = decoded.lastIndexOf(':');
    const sig       = decoded.slice(lastColon + 1);
    const body      = decoded.slice(0, lastColon);
    const tsStart   = body.lastIndexOf(':');
    const ts        = parseInt(body.slice(tsStart + 1), 10);
    const creatorId = body.slice(0, tsStart);

    const expected = crypto
      .createHmac('sha256', process.env.INSTAGRAM_APP_SECRET)
      .update(body)
      .digest('hex')
      .slice(0, 16);

    if (sig !== expected) return null;
    if (Date.now() - ts > 3_600_000) return null; // 1-hour window
    return creatorId;
  } catch {
    return null;
  }
}

// ── Redirect URI ──────────────────────────────────────────────────────────────
function getRedirectUri(req) {
  if (process.env.INSTAGRAM_REDIRECT_URI) return process.env.INSTAGRAM_REDIRECT_URI;
  // Fallback for local dev — no query params so Meta accepts the URI
  const host  = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000';
  const proto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim() ?? 'http';
  return `${proto}://${host}/api/instagram`;
}

// ── Auth guard ────────────────────────────────────────────────────────────────
async function verifyUser(authHeader, pool) {
  const ctx = await resolveUserCtx(authHeader, pool);
  if (!ctx) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  if (!ctx.isAdmin && !ctx.isDesigner) {
    throw Object.assign(new Error('Forbidden — designers and admins only'), { status: 403 });
  }
  return ctx;
}

// ── Caption generator ─────────────────────────────────────────────────────────
function generateCaption(it) {
  const parts = [];

  const header = it.durationDays
    ? `${it.title} | ${it.durationDays} Days`
    : it.title;
  parts.push(header);
  parts.push('');

  const desc = (it.excerpt || it.description || '').trim();
  if (desc) {
    const snippet = desc.length > 200 ? desc.slice(0, 197) + '...' : desc;
    parts.push(snippet);
    parts.push('');
  }

  const location = [it.destination, it.country].filter(Boolean).join(', ');
  if (location) parts.push(`📍 ${location}`);
  if (it.durationDays) parts.push(`🗓 ${it.durationDays} days`);
  parts.push('');
  parts.push('Discover the full day-by-day route. Link in bio.');
  parts.push('');

  const tags = ['#HiddenAtlas', '#TravelItinerary', '#LuxuryTravel', '#TravelInspiration'];
  if (it.country)     tags.push(`#${it.country.replace(/\s+/g, '')}`);
  if (it.destination) tags.push(`#${it.destination.replace(/\s+/g, '')}Journey`);
  parts.push(tags.join(' '));

  return parts.join('\n');
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const action = req.query.action;

  // OAuth callback is browser-redirected (no JWT).
  // Detected by presence of `code` + `state` (Meta appends these — no action= needed).
  if (req.method === 'GET' && req.query.code && req.query.state) {
    return handleCallback(req, res);
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured — DATABASE_URL missing' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    if (req.method === 'GET') {
      if (action === 'auth-url') {
        const ctx = await verifyUser(req.headers.authorization, pool);
        return res.json(await handleAuthUrl(req, pool, ctx));
      }
      if (action === 'preview') {
        const ctx = await verifyUser(req.headers.authorization, pool);
        return res.json(await handlePreview(pool, req.query.id, ctx));
      }
      if (action === 'logs') {
        const ctx = await verifyUser(req.headers.authorization, pool);
        return res.json(await handleLogs(pool, req.query.id, ctx));
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      const ctx  = await verifyUser(req.headers.authorization, pool);
      const body = req.body ?? {};
      if (action === 'publish')    return res.json(await handlePublish(pool, body, ctx));
      if (action === 'disconnect') return res.json(await handleDisconnect(pool, body, ctx));
      return res.status(400).json({ error: 'Unknown POST action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[instagram]', err);
    return res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await pool.end();
  }
}

// ── GET auth-url ──────────────────────────────────────────────────────────────
async function handleAuthUrl(req, pool, ctx) {
  requireInstagramEnv();

  const creatorId = req.query.creatorId;
  if (!creatorId) throw Object.assign(new Error('creatorId is required'), { status: 400 });

  // Designers can only connect their own profile
  if (!ctx.isAdmin && ctx.creatorId !== creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  const { rows } = await pool.query(
    `SELECT id FROM "Creator" WHERE id = $1 LIMIT 1`, [creatorId]
  );
  if (!rows.length) throw Object.assign(new Error('Creator not found'), { status: 404 });

  const redirectUri = getRedirectUri(req);
  const state       = signState(creatorId);

  const url = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  url.searchParams.set('client_id',     process.env.INSTAGRAM_APP_ID);
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         REQUIRED_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state',         state);

  return { url: url.toString() };
}

// ── GET callback (unauthenticated — browser redirect from Facebook OAuth) ─────
async function handleCallback(req, res) {
  const { code, state, error: fbError, error_description: fbDesc } = req.query;

  if (fbError || !code || !state) {
    console.warn('[instagram:callback] denied or missing params', { fbError, fbDesc });
    return res.redirect(302, `/admin?instagram=denied`);
  }

  try {
    requireInstagramEnv();
  } catch {
    return res.redirect(302, `/admin?instagram=error&reason=not_configured`);
  }

  const creatorId = verifyState(state);
  if (!creatorId) {
    console.warn('[instagram:callback] invalid or expired state');
    return res.redirect(302, `/admin?instagram=error&reason=invalid_state`);
  }

  if (!process.env.DATABASE_URL) {
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=server_error`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const redirectUri = getRedirectUri(req);

    // 1. Exchange code for short-lived user access token
    const tokenRes  = await fetch(`${FB_API}/oauth/access_token?` + new URLSearchParams({
      client_id:     process.env.INSTAGRAM_APP_ID,
      redirect_uri:  redirectUri,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      code,
    }));
    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      console.error('[instagram:callback] token exchange failed', tokenData.error);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_exchange`);
    }

    // 2. Exchange for long-lived token (~60 days)
    const longRes  = await fetch(`${FB_API}/oauth/access_token?` + new URLSearchParams({
      grant_type:        'fb_exchange_token',
      client_id:         process.env.INSTAGRAM_APP_ID,
      client_secret:     process.env.INSTAGRAM_APP_SECRET,
      fb_exchange_token: tokenData.access_token,
    }));
    const longData = await longRes.json();
    if (longData.error || !longData.access_token) {
      console.error('[instagram:callback] long-lived token exchange failed', longData.error);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_refresh`);
    }

    const accessToken = longData.access_token;
    const expiresIn   = longData.expires_in ?? 5_184_000; // 60 days default
    const expiresAt   = new Date(Date.now() + expiresIn * 1000);

    // 3. Get Facebook Pages connected to this user account
    const pagesRes  = await fetch(`${FB_API}/me/accounts?access_token=${encodeURIComponent(accessToken)}`);
    const pagesData = await pagesRes.json();
    if (pagesData.error || !pagesData.data?.length) {
      console.warn('[instagram:callback] no Facebook Pages found', pagesData.error);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=no_pages`);
    }

    // 4. Find the Instagram Business Account linked to any of the Pages
    let igAccountId = null;
    for (const page of pagesData.data) {
      const pageRes  = await fetch(
        `${FB_API}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`
      );
      const pageData = await pageRes.json();
      if (pageData.instagram_business_account?.id) {
        igAccountId = pageData.instagram_business_account.id;
        break;
      }
    }

    if (!igAccountId) {
      console.warn('[instagram:callback] no Instagram Business Account found', { creatorId });
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=no_ig_account`);
    }

    // 5. Persist on Creator row
    await pool.query(
      `UPDATE "Creator"
       SET instagram_account_id       = $1,
           instagram_access_token     = $2,
           instagram_token_expires_at = $3
       WHERE id = $4`,
      [igAccountId, accessToken, expiresAt, creatorId]
    );

    console.log(`[instagram:callback] connected igAccountId=${igAccountId} creatorId=${creatorId}`);
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=connected`);

  } catch (err) {
    console.error('[instagram:callback] unexpected error', err);
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=server_error`);
  } finally {
    await pool.end();
  }
}

// ── GET preview ───────────────────────────────────────────────────────────────
async function handlePreview(pool, itineraryId, ctx) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.slug, i.description, i.excerpt, i."coverImage",
            i.destination, i.country, i."durationDays",
            c.id AS creator_id, c.instagram_account_id,
            c.instagram_token_expires_at
     FROM "Itinerary" i
     LEFT JOIN "Creator" c ON c.id = i.creator_id
     WHERE i.id = $1 LIMIT 1`,
    [itineraryId]
  );
  if (!rows.length) throw Object.assign(new Error('Itinerary not found'), { status: 404 });
  const it = rows[0];

  // Ownership: designers can only preview their own itineraries
  if (!ctx.isAdmin && ctx.creatorId && it.creator_id !== ctx.creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  if (!it.instagram_account_id) {
    throw Object.assign(
      new Error("This itinerary's creator has no connected Instagram account"),
      { status: 400 }
    );
  }

  // Collect available images: hero coverImage first, then active gallery assets
  const { rows: assets } = await pool.query(
    `SELECT url, alt, "assetType", "sortOrder"
     FROM "ItineraryAsset"
     WHERE "itineraryId" = $1 AND active = true
       AND "assetType" IN ('hero', 'gallery')
     ORDER BY "assetType" DESC, "sortOrder" ASC`,
    [itineraryId]
  );

  const seen   = new Set();
  const images = [];

  if (it.coverImage) {
    seen.add(it.coverImage);
    images.push({ url: it.coverImage, type: 'hero', alt: it.title });
  }
  for (const a of assets) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      images.push({ url: a.url, type: a.assetType, alt: a.alt || it.title });
    }
  }

  const tokenWarning = (() => {
    if (!it.instagram_token_expires_at) return null;
    const daysLeft = (new Date(it.instagram_token_expires_at) - Date.now()) / 86_400_000;
    if (daysLeft < 7)  return 'Instagram access token expires very soon. Reconnect in Creator settings.';
    if (daysLeft < 14) return 'Instagram access token expires in under 2 weeks. Consider reconnecting soon.';
    return null;
  })();

  return {
    caption:   generateCaption(it),
    images,
    itinerary: { id: it.id, title: it.title, destination: it.destination, country: it.country },
    tokenWarning,
  };
}

// ── POST publish ──────────────────────────────────────────────────────────────
async function handlePublish(pool, body, ctx) {
  requireInstagramEnv();

  const { itineraryId, caption, imageUrl } = body;
  if (!itineraryId) throw Object.assign(new Error('itineraryId is required'), { status: 400 });
  if (!imageUrl)    throw Object.assign(new Error('imageUrl is required'),    { status: 400 });
  if (!caption?.trim()) throw Object.assign(new Error('caption is required'), { status: 400 });

  // Fetch creator credentials via the itinerary
  const { rows } = await pool.query(
    `SELECT c.instagram_account_id, c.instagram_access_token, c.id AS creator_id
     FROM "Itinerary" i
     LEFT JOIN "Creator" c ON c.id = i.creator_id
     WHERE i.id = $1 LIMIT 1`,
    [itineraryId]
  );
  if (!rows.length) throw Object.assign(new Error('Itinerary not found'), { status: 404 });
  const { instagram_account_id: igAccountId, instagram_access_token: accessToken, creator_id: creatorId } = rows[0];

  if (!igAccountId || !accessToken) {
    throw Object.assign(
      new Error("Creator has no connected Instagram account — connect via Creator settings"),
      { status: 400 }
    );
  }

  // Ownership: designers can only publish their own itineraries
  if (!ctx.isAdmin && ctx.creatorId !== creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  let instagramPostId = null;
  let status          = 'failed';
  let errorMessage    = null;

  try {
    // 1. Create media container
    const containerRes  = await fetch(`${FB_API}/${igAccountId}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
    });
    const containerData = await containerRes.json();
    if (containerData.error || !containerData.id) {
      throw new Error(
        containerData.error?.message ?? `Media container creation failed (HTTP ${containerRes.status})`
      );
    }

    // 2. Publish the container
    const publishRes  = await fetch(`${FB_API}/${igAccountId}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.error || !publishData.id) {
      throw new Error(
        publishData.error?.message ?? `Media publish failed (HTTP ${publishRes.status})`
      );
    }

    instagramPostId = publishData.id;
    status          = 'success';

    // 3. Store post ID on the Itinerary
    await pool.query(
      `UPDATE "Itinerary" SET "instagramPostId" = $1 WHERE id = $2`,
      [instagramPostId, itineraryId]
    );

  } catch (err) {
    errorMessage = err.message;
    console.error('[instagram:publish]', err.message);
  }

  // Always log the attempt
  await pool.query(
    `INSERT INTO "InstagramPublishLog"
       ("id", "itineraryId", "creatorId", "instagramAccountId", "instagramPostId", "caption", "status", "errorMessage")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
    [itineraryId, creatorId, igAccountId, instagramPostId, caption.slice(0, 2000), status, errorMessage]
  );

  if (status === 'failed') {
    throw Object.assign(new Error(errorMessage ?? 'Publishing failed'), { status: 502 });
  }

  // 4. Fetch the post permalink (best-effort)
  let permalink = null;
  try {
    const plRes  = await fetch(
      `${FB_API}/${instagramPostId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
    );
    const plData = await plRes.json();
    permalink    = plData.permalink ?? null;
  } catch {
    // Non-fatal — post was published, permalink fetch failed
  }

  return { success: true, instagramPostId, permalink };
}

// ── POST disconnect ───────────────────────────────────────────────────────────
async function handleDisconnect(pool, body, ctx) {
  const { creatorId } = body;
  if (!creatorId) throw Object.assign(new Error('creatorId is required'), { status: 400 });

  if (!ctx.isAdmin && ctx.creatorId !== creatorId) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  await pool.query(
    `UPDATE "Creator"
     SET instagram_account_id       = NULL,
         instagram_access_token     = NULL,
         instagram_token_expires_at = NULL
     WHERE id = $1`,
    [creatorId]
  );

  return { success: true };
}

// ── GET logs ──────────────────────────────────────────────────────────────────
async function handleLogs(pool, itineraryId, ctx) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });
  if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });

  const { rows } = await pool.query(
    `SELECT id, "itineraryId", "creatorId", "instagramAccountId", "instagramPostId",
            status, "errorMessage", "publishedAt"
     FROM "InstagramPublishLog"
     WHERE "itineraryId" = $1
     ORDER BY "publishedAt" DESC
     LIMIT 20`,
    [itineraryId]
  );
  return { logs: rows };
}
