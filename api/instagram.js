// ── Instagram Graph API Integration ──────────────────────────────────────────
//
// Uses "API setup with Instagram login" (instagram_business_* scopes, Jan 2025+).
// No Facebook Page linkage required — the Instagram User ID is returned directly
// in the token exchange response.
//
// ⚠️  Env var notes:
//   INSTAGRAM_CLIENT_ID     — Instagram App ID from Meta Dashboard →
//                             Instagram → API setup with Instagram login →
//                             section 3 "Set up Instagram business login" →
//                             Business login settings → "Instagram App ID".
//                             NOT the Meta App ID at the top of the dashboard.
//   INSTAGRAM_CLIENT_SECRET — Instagram App Secret from the same location.
//                             NOT the Meta App Secret from Basic Settings.
//   INSTAGRAM_REDIRECT_URI  — must match exactly what is listed in
//                             Business login settings → Valid OAuth Redirect URIs.
//
//   Legacy aliases (still accepted if new vars are absent):
//   INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET
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
// Required env vars: INSTAGRAM_CLIENT_ID (or INSTAGRAM_APP_ID), INSTAGRAM_CLIENT_SECRET
//                    (or INSTAGRAM_APP_SECRET), INSTAGRAM_REDIRECT_URI, DATABASE_URL

import pg             from 'pg';
import crypto         from 'crypto';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;
// Three separate Instagram endpoints — do not mix these up:
const IG_AUTH  = 'https://www.instagram.com';        // OAuth dialog (browser redirect)
const IG_TOKEN = 'https://api.instagram.com';        // token exchange (server-to-server)
const IG_GRAPH = 'https://graph.instagram.com/v25.0'; // Graph API calls
// Minimum scopes for connecting and publishing (instagram_business_* family, Jan 2025+)
const REQUIRED_SCOPES = 'instagram_business_basic,instagram_business_content_publish';

// ── Env accessors — prefer INSTAGRAM_CLIENT_* with INSTAGRAM_APP_* as legacy fallback ─
function igClientId()     { return process.env.INSTAGRAM_CLIENT_ID     ?? process.env.INSTAGRAM_APP_ID; }
function igClientSecret() { return process.env.INSTAGRAM_CLIENT_SECRET ?? process.env.INSTAGRAM_APP_SECRET; }

// ── Env guard ─────────────────────────────────────────────────────────────────
function requireInstagramEnv() {
  const missing = [];
  if (!igClientId())     missing.push('INSTAGRAM_CLIENT_ID (or INSTAGRAM_APP_ID)');
  if (!igClientSecret()) missing.push('INSTAGRAM_CLIENT_SECRET (or INSTAGRAM_APP_SECRET)');
  if (!process.env.INSTAGRAM_REDIRECT_URI) missing.push('INSTAGRAM_REDIRECT_URI');
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
    .createHmac('sha256', igClientSecret())
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
      .createHmac('sha256', igClientSecret())
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

// ── Meta API error formatter ──────────────────────────────────────────────────
// Translates Meta error codes into actionable admin messages.
function metaErrorMessage(err, context) {
  if (!err) return `${context} failed`;
  const code = err.code;
  if (code === 10 || code === 200) {
    return `${context}: permission denied — ensure 'instagram_business_basic' and 'instagram_business_content_publish' are approved in the Meta app, and that the account is an Instagram Business or Creator account.`;
  }
  if (code === 190) {
    return `${context}: access token invalid or expired — reconnect Instagram in Creator settings.`;
  }
  if (code === 24) {
    return `${context}: the account has hit the publishing rate limit (100 posts per 24 hours).`;
  }
  return `${context}: ${err.message ?? JSON.stringify(err)}`;
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
  const clientId    = igClientId();

  // Params per Meta docs for Instagram API with Instagram Login (Jan 2025+):
  //   enable_fb_login=0  — hide the "Log in with Facebook" option on the dialog
  //   force_reauth=1     — force Instagram credential entry (correct name; NOT force_authentication)
  const url = new URL(`${IG_AUTH}/oauth/authorize`);
  url.searchParams.set('client_id',       clientId);
  url.searchParams.set('redirect_uri',    redirectUri);
  url.searchParams.set('response_type',   'code');
  url.searchParams.set('scope',           REQUIRED_SCOPES);
  url.searchParams.set('enable_fb_login', '0');
  url.searchParams.set('force_reauth',    '1');
  url.searchParams.set('state',           state);

  // Config-level checks (no API call — checks env vars and URL structure only)
  const configCheck = {
    clientIdPresent:        Boolean(clientId),
    clientSecretPresent:    Boolean(igClientSecret()),
    redirectUriPresent:     Boolean(process.env.INSTAGRAM_REDIRECT_URI),
    scopesLookCorrect:      REQUIRED_SCOPES.startsWith('instagram_business_'),
    oauthHostCorrect:       IG_AUTH === 'https://www.instagram.com',
    tokenHostCorrect:       IG_TOKEN === 'https://api.instagram.com',
    graphHostCorrect:       IG_GRAPH.startsWith('https://graph.instagram.com/'),
    enableFbLogin:          '0 (Facebook Login option hidden)',
    forceReauth:            '1 (forces fresh Instagram credential entry)',
    note:                   'If app still returns "Invalid platform app": verify the Meta app type is "Business", that Instagram API with Instagram Login product is added, and that required permissions (instagram_business_basic, instagram_business_content_publish) are listed under "Add required permissions" in the dashboard.',
  };

  // Preview URL with state HMAC redacted — safe to show to admins
  const previewUrl = new URL(`${IG_AUTH}/oauth/authorize`);
  previewUrl.searchParams.set('client_id',       clientId);
  previewUrl.searchParams.set('redirect_uri',    redirectUri);
  previewUrl.searchParams.set('response_type',   'code');
  previewUrl.searchParams.set('scope',           REQUIRED_SCOPES);
  previewUrl.searchParams.set('enable_fb_login', '0');
  previewUrl.searchParams.set('force_reauth',    '1');
  previewUrl.searchParams.set('state',           '[state_token]');

  const debug = {
    flowType:                    'Instagram Business Login',
    oauthEndpoint:               `${IG_AUTH}/oauth/authorize`,
    tokenExchangeEndpoint:       `${IG_TOKEN}/oauth/access_token`,
    apiBaseUsed:                 IG_GRAPH,
    clientIdUsed:                clientId,
    redirectUriUsed:             redirectUri,
    scopesUsed:                  REQUIRED_SCOPES,
    response_type:               'code',
    enable_fb_login:             '0',
    force_reauth:                '1',
    envSource:                   process.env.INSTAGRAM_CLIENT_ID ? 'INSTAGRAM_CLIENT_ID' : 'INSTAGRAM_APP_ID (legacy)',
    exactEncodedOAuthUrl:        previewUrl.toString(),
    configCheck,
  };
  console.log('[instagram:auth-url]', debug);

  return {
    url: url.toString(),
    // debug only returned to admins — no secrets, tokens, or HMAC values included
    ...(ctx.isAdmin ? { debug } : {}),
  };
}

// ── GET callback (unauthenticated — browser redirect from Instagram OAuth) ────
async function handleCallback(req, res) {
  const { code, state, error: igError, error_description: igDesc } = req.query;

  if (igError || !code || !state) {
    console.warn('[instagram:callback] denied or missing params', { igError, igDesc });
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

    // 1. Exchange code for short-lived token via POST (Instagram Login flow).
    //    Response includes user_id directly — no Facebook Pages lookup needed.
    const tokenRes  = await fetch(`${IG_TOKEN}/oauth/access_token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        client_id:     igClientId(),
        client_secret: igClientSecret(),
        grant_type:    'authorization_code',
        redirect_uri:  redirectUri,
        code,
      }),
    });
    const tokenRaw  = await tokenRes.json();
    // Meta docs show two possible response shapes:
    //   flat:    { access_token, user_id, permissions }
    //   wrapped: { data: [{ access_token, user_id, permissions }] }
    // Normalise to a single object so downstream code doesn't care.
    const tokenData = Array.isArray(tokenRaw?.data) ? tokenRaw.data[0] : tokenRaw;

    // Instagram Login errors surface as error_type + error_message (not error.code)
    if (tokenData?.error_type || !tokenData?.access_token) {
      console.error('[instagram:callback] token exchange failed', tokenRaw);
      let reason = 'token_exchange';
      const msg  = (tokenData?.error_message ?? '').toLowerCase();
      if (msg.includes('invalid platform app'))                      reason = 'invalid_platform_app';
      else if (msg.includes('redirect'))                             reason = 'redirect_mismatch';
      else if (msg.includes('scope') || msg.includes('permission'))  reason = 'scope_denied';
      else if (msg.includes('code') || msg.includes('already used')) reason = 'code_used';
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=${reason}`);
    }

    if (!tokenData.user_id) {
      console.error('[instagram:callback] user_id missing from token response', tokenRaw);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=no_ig_account`);
    }

    const igAccountId = String(tokenData.user_id); // Instagram User ID — returned directly
    const shortToken  = tokenData.access_token;

    // 2. Exchange short-lived for long-lived token (~60 days) via graph.instagram.com
    const longRes  = await fetch(`${IG_GRAPH}/access_token?` + new URLSearchParams({
      grant_type:    'ig_exchange_token',
      client_id:     igClientId(),
      client_secret: igClientSecret(),
      access_token:  shortToken,
    }));
    const longData = await longRes.json();
    if (longData.error || !longData.access_token) {
      console.error('[instagram:callback] long-lived token exchange failed', longData.error);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_refresh`);
    }

    const accessToken = longData.access_token;
    const expiresIn   = longData.expires_in ?? 5_184_000; // 60 days default
    const expiresAt   = new Date(Date.now() + expiresIn * 1000);

    // 3. Persist on Creator row
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
    const containerRes  = await fetch(`${IG_GRAPH}/${igAccountId}/media`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
    });
    const containerData = await containerRes.json();
    if (containerData.error || !containerData.id) {
      throw new Error(metaErrorMessage(containerData.error, 'Media container creation'));
    }

    // 2. Publish the container
    const publishRes  = await fetch(`${IG_GRAPH}/${igAccountId}/media_publish`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (publishData.error || !publishData.id) {
      throw new Error(metaErrorMessage(publishData.error, 'Media publish'));
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
      `${IG_GRAPH}/${instagramPostId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
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
