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
import { put as blobPut } from '@vercel/blob';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;
// Three separate Instagram endpoints — do not mix these up:
const IG_AUTH  = 'https://www.instagram.com';        // OAuth dialog (browser redirect)
const IG_TOKEN = 'https://api.instagram.com';        // token exchange (server-to-server)
const IG_GRAPH = 'https://graph.instagram.com/v25.0'; // Graph API calls
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
// Translates Meta error codes and message patterns into actionable admin messages.
function metaErrorMessage(err, context) {
  if (!err) return `${context} failed`;
  const code    = err.code;
  const message = (err.message ?? '').toLowerCase();

  // String-pattern check first — catches "missing permissions" errors that surface
  // as code 100 with specific message text rather than code 10/200.
  if (
    message.includes('missing permissions') ||
    message.includes('unsupported post request') ||
    (message.includes('does not exist') && message.includes('permissions'))
  ) {
    return 'Instagram publishing permission is missing. Please reconnect Instagram.';
  }

  if (code === 10 || code === 200) {
    return 'Instagram publishing permission is missing. Please reconnect Instagram.';
  }
  if (code === 190) {
    return `${context}: access token invalid or expired. Reconnect Instagram in Creator settings.`;
  }
  if (code === 24) {
    return `${context}: the account has hit the publishing rate limit (100 posts per 24 hours).`;
  }
  return `${context}: ${err.message ?? JSON.stringify(err)}`;
}

// ── Permission check via Meta debug_token API ─────────────────────────────────
// Returns true if the token has instagram_business_content_publish scope.
// Best-effort — returns true on any network/parse failure so we don't block.
async function hasPublishPermission(accessToken) {
  try {
    const appId     = igClientId();
    const appSecret = igClientSecret();
    if (!appId || !appSecret) return true; // can't check without app credentials

    const url = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const res  = await fetch(url);
    if (!res.ok) return true;
    const json = await res.json();
    const scopes = json?.data?.scopes ?? [];
    if (!Array.isArray(scopes) || scopes.length === 0) return true; // can't determine
    return scopes.includes('instagram_business_content_publish');
  } catch {
    return true; // non-fatal
  }
}

// ── Caption text sanitizer ────────────────────────────────────────────────────
// Replaces em/en dashes with natural punctuation so source copy never carries
// "X — Y" patterns into captions.
function sanitize(text) {
  if (!text) return text;
  // " — word" or " – word" → ". Word" (start a new sentence)
  let out = text.replace(/ [—–] ([a-zA-Z])/g, (_, c) => `. ${c.toUpperCase()}`);
  // Any remaining " — " or " – " spacing variants → ". "
  out = out.replace(/ [—–] /g, '. ');
  // Bare em/en dashes with no surrounding space → comma
  out = out.replace(/[—–]/g, ', ');
  return out;
}

// ── Caption generator ─────────────────────────────────────────────────────────
function generateCaption(it) {
  const SITE_BASE = 'https://www.hiddenatlas.travel';

  const titleLower   = (it.title       || '').toLowerCase();
  const destLower    = (it.destination || '').toLowerCase();
  const countryLower = (it.country     || '').toLowerCase();
  const excerptText  = (it.excerpt     || '').trim();
  const descText     = (it.description || '').trim();
  const fullCtx      = [titleLower, destLower, countryLower, excerptText, descText].join(' ').toLowerCase();

  // ── Description paragraphs ──────────────────────────────────────────────────
  function parseDescParagraphs(raw) {
    if (!raw) return [];
    const clean = raw.replace(/[ \t]+/g, ' ').trim();
    const blocks = clean.split(/\n{2,}/).map(b => b.replace(/\n/g, ' ').trim()).filter(Boolean);
    if (blocks.length >= 2) return blocks;
    // Single block — split at first sentence boundary after 120 chars
    if (clean.length > 160) {
      const tail   = clean.slice(120);
      const cutIdx = tail.search(/(?<=[.!?])\s+[A-Z]/);
      if (cutIdx !== -1) {
        const pivot = 120 + cutIdx + 1;
        return [clean.slice(0, pivot).trim(), clean.slice(pivot).trim()].filter(Boolean);
      }
    }
    return [clean];
  }

  let hookPara = '', routePara = '', discoveryPara = '';
  if (excerptText && descText && excerptText !== descText) {
    hookPara = excerptText;
    const dp = parseDescParagraphs(descText);
    routePara     = dp[0] || '';
    discoveryPara = dp[1] || '';
  } else {
    const dp = parseDescParagraphs(excerptText || descText);
    hookPara      = dp[0] || '';
    routePara     = dp[1] || '';
    discoveryPara = dp[2] || '';
  }

  // Strip em/en dashes from source copy before it enters the caption
  hookPara      = sanitize(hookPara);
  routePara     = sanitize(routePara);
  discoveryPara = sanitize(discoveryPara);

  // ── Sub-destination extraction (from title) ──────────────────────────────────
  // "Normandy, Brittany & Loire" → ["Normandy", "Brittany", "Loire"]
  function extractSubDests() {
    const clean = (it.title || '')
      .replace(/\s+in\s+\d+\s+days?/i, '')
      .replace(/\s+\d+[-\s]?days?\b/i, '')
      .trim();
    return clean
      .split(/[,&]|\band\b/i)
      .map(s => s.replace(/[^a-zA-Z0-9\s]/g, '').trim())
      .filter(s => s.length >= 3 && /^[A-Z]/.test(s));
  }
  const subDests = extractSubDests();

  // ── Bullets ─────────────────────────────────────────────────────────────────
  function buildBullets() {
    const bullets = [];

    // Bullet 1 — places/towns
    if (subDests.length >= 3) {
      bullets.push(`The most beautiful places in ${subDests[0]} and ${subDests[1]}`);
    } else if (subDests.length === 2) {
      bullets.push(`The highlights of ${subDests[0]} and ${subDests[1]}`);
    } else if (fullCtx.match(/beach|coast|ocean|atlantic|mediterranean/)) {
      bullets.push('The best beaches and coastal highlights');
    } else if (fullCtx.match(/wine|vineyard|winery/)) {
      bullets.push('The top wine regions and vineyard stops');
    } else if (fullCtx.match(/town|village|medieval|ancient/)) {
      bullets.push('The most beautiful historic towns and villages');
    } else {
      const dest = it.destination || it.country || 'the region';
      bullets.push(`The most unmissable places in ${dest}`);
    }

    // Bullet 2 — landmark or signature experience
    if (fullCtx.match(/mont.?saint.?michel|mont saint/i)) {
      bullets.push('Mont-Saint-Michel and the Atlantic coast');
    } else if (fullCtx.match(/château|chateau/i) && fullCtx.match(/loire/i)) {
      bullets.push('The most iconic castles of the Loire Valley');
    } else if (fullCtx.match(/wine|vineyard|chianti|bordeaux|rioja/)) {
      bullets.push('Scenic drives through classic wine country');
    } else if (fullCtx.match(/cliff|gorge|canyon|fjord|waterfall/)) {
      bullets.push('Dramatic landscapes, cliffs and natural highlights');
    } else if (fullCtx.match(/temple|shrine|ryokan|japan/i)) {
      bullets.push('Temples, shrines and traditional Japanese culture');
    } else if (fullCtx.match(/mountain|highland|peak|summit|alps/)) {
      bullets.push('Mountain scenery, scenic passes and highland stops');
    } else if (fullCtx.match(/castle|fortress|fortif/)) {
      bullets.push('Historic castles, fortified towns and heritage sites');
    } else if (fullCtx.match(/island|archipelago/)) {
      bullets.push('Island routes, hidden coves and local villages');
    } else {
      bullets.push('Scenic routes and standout places to stop');
    }

    // Bullet 3 — history or culture
    if (fullCtx.match(/d.?day|omaha|wwii|war.?history|normandy.*beach/i)) {
      bullets.push('History, heritage sites and D-Day memorials');
    } else if (fullCtx.match(/abbey|cathedral|monastery|convent/)) {
      bullets.push('Abbeys, cathedrals and cultural landmarks');
    } else if (fullCtx.match(/market|local.?food|gastronomy|street food/)) {
      bullets.push('Local markets, food culture and regional specialties');
    } else if (fullCtx.match(/museum|gallery|art|architecture/)) {
      bullets.push('Art, museums and cultural highlights');
    } else if (fullCtx.match(/onsen|spa|thermal|wellness/)) {
      bullets.push('Traditional onsen and slow travel moments');
    } else {
      bullets.push('Local culture, history and hidden highlights');
    }

    // Bullet 4 — always practical
    bullets.push('Restaurant and travel recommendations');

    // Bullet 5 — always structural
    bullets.push('A clear day-by-day travel plan');

    return bullets;
  }

  // ── Hashtags ─────────────────────────────────────────────────────────────────
  function buildHashtags() {
    const tags = new Set(['#HiddenAtlas']);

    // Sub-destination tags — single-word only.
    // Multi-word slugs (e.g. "TuscanyWineRoads") are not useful hashtags;
    // the destination field handles the region tag.
    const REMAP = { Loire: 'LoireValley', Sardinia: 'Sardinia', Sicilia: 'Sicily' };
    for (const sub of subDests.slice(0, 4)) {
      if (sub.includes(' ')) continue;
      const slug = sub.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
      tags.add('#' + (REMAP[slug] || REMAP[sub] || slug));
    }

    // If the title is a single-destination title, also tag the destination field
    if (subDests.length <= 1 && it.destination) {
      const dt = it.destination.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/)
        .map(w => w[0].toUpperCase() + w.slice(1)).join('');
      if (dt.length >= 3) tags.add('#' + dt);
    }

    // Landmark-specific tags derived from content
    if (fullCtx.match(/mont.?saint.?michel|mont saint/i))               tags.add('#MontSaintMichel');
    if (fullCtx.match(/château|chateau/i) && fullCtx.match(/loire/i))  tags.add('#LoireCastles');
    if (fullCtx.match(/amalfi/i))                                        tags.add('#AmalfiCoast');

    // Road trip tags — prefer destination-based (#TuscanyRoadTrip) over country-only
    if (it.country) {
      const c = it.country.replace(/\s+/g, '');
      if (fullCtx.match(/road.?trip|roads?\b|drive|driving|route/)) {
        const dest = (it.destination || '').replace(/[^a-zA-Z0-9]/g, '');
        if (dest.length >= 3) tags.add(`#${dest}RoadTrip`);
        tags.add(`#${c}RoadTrip`);
      } else if (![...tags].some(t => t.toLowerCase().includes(c.toLowerCase()))) {
        tags.add(`#${c}Travel`);
      }
    }

    // Thematic
    if (fullCtx.match(/wine|vineyard/))             tags.add('#WineTravel');
    if (fullCtx.match(/road.?trip|roads?\b|drive/)) tags.add('#RoadTrip');

    tags.add('#TravelItinerary');
    tags.add('#TravelPlanning');
    tags.add('#SlowTravel');

    return [...tags];
  }

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const bullets  = buildBullets();
  const hashtags = buildHashtags();
  const slug     = it.slug
    || (it.title || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const url = slug ? `${SITE_BASE}/itineraries/${slug}` : null;

  const parts = [];

  // Emoji + full itinerary title as header
  const emoji = (() => {
    if (fullCtx.match(/wine|vineyard|chianti|bordeaux|rioja/)) return '🍷';
    if (fullCtx.match(/beach|coast|ocean|atlantic|mediterranean/)) return '🌊';
    if (fullCtx.match(/castle|medieval|heritage|d.?day|wwii/)) return '🏰';
    if (fullCtx.match(/japan|temple|shrine|ryokan/i)) return '🌸';
    if (fullCtx.match(/mountain|highland|alps/)) return '🏔️';
    return '✈️';
  })();
  if (it.title) parts.push(`${emoji} ${it.title}`, '');

  // Short editorial hook — single sentence, destination-specific
  const destName = it.destination || it.country || '';
  if (destName) {
    const hookLine = (() => {
      if (fullCtx.match(/wine|vineyard/))        return `${destName} is not a place to rush.`;
      if (fullCtx.match(/island|archipelago/))   return `${destName} rewards slow travel.`;
      if (fullCtx.match(/road.?trip|drive|driving/)) return `${destName} is best explored by road.`;
      if (fullCtx.match(/beach|coast/))          return `${destName} is the kind of place you want more time in.`;
      return `${destName} is best explored at a slower pace.`;
    })();
    parts.push(hookLine, '');
  }

  // Source content paragraphs — max 2 to keep the caption concise
  if (hookPara)  parts.push(hookPara,  '');
  if (routePara) parts.push(routePara, '');

  // Bullets
  parts.push("Inside the guide you'll find:", '');
  bullets.forEach(b => parts.push(`• ${b}`));
  parts.push('');

  if (url) {
    parts.push('👉 Explore the full itinerary:');
    parts.push(url);
    parts.push('');
  }

  parts.push('Save this post for your future trip ✨', '');
  parts.push(hashtags.join(' '));

  return parts.join('\n');
}

// ── Cover card subtitle helper (shared with preview response) ─────────────────
function deriveCardSubtitle(subtitle, durationDays) {
  if (subtitle) {
    // Strip leading "4 Day " / "7-Day " prefix to get the category label
    const stripped = subtitle.replace(/^\d+[-\s]?days?\s+/i, '').trim();
    return stripped || subtitle;
  }
  if (durationDays) return `${durationDays} Day Journey`;
  return 'Travel Itinerary';
}

// ── Card title (strip duration suffix for clean cover text) ──────────────────
function deriveCardTitle(title) {
  return (title || '')
    .replace(/\s+in\s+\d+\s+days?/i, '')
    .replace(/\s+\d+[-\s]?days?\b/i, '')
    .toUpperCase()
    .trim();
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
      if (action === 'proxy-image') {
        await verifyUser(req.headers.authorization, pool);
        return handleProxyImage(req, res);
      }
      return res.status(400).json({ error: 'Unknown GET action' });
    }

    if (req.method === 'POST') {
      const ctx  = await verifyUser(req.headers.authorization, pool);
      const body = req.body ?? {};
      if (action === 'publish')      return res.json(await handlePublish(pool, body, ctx));
      if (action === 'disconnect')   return res.json(await handleDisconnect(pool, body, ctx));
      if (action === 'upload-cover') return res.json(await handleUploadCover(body, ctx));
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

  console.log('[instagram:callback] received', {
    hasCode:  Boolean(code),
    hasState: Boolean(state),
    igError:  igError ?? null,
  });

  if (igError || !code || !state) {
    console.warn('[instagram:callback] denied or missing params', { igError, igDesc });
    return res.redirect(302, `/admin?instagram=denied`);
  }

  try {
    requireInstagramEnv();
  } catch (e) {
    console.error('[instagram:callback] env not configured:', e.message);
    return res.redirect(302, `/admin?instagram=error&reason=not_configured`);
  }

  const creatorId = verifyState(state);
  console.log('[instagram:callback] state verified, creatorId:', creatorId ?? 'INVALID');
  if (!creatorId) {
    return res.redirect(302, `/admin?instagram=error&reason=invalid_state`);
  }

  if (!process.env.DATABASE_URL) {
    console.error('[instagram:callback] DATABASE_URL missing');
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=server_error`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const redirectUri = getRedirectUri(req);

    // ── Step 1: exchange code for short-lived token ──────────────────────────
    // POST to api.instagram.com (not graph.instagram.com) with form-urlencoded body.
    // Response may be flat { access_token, user_id } or wrapped { data: [{ ... }] }.
    console.log('[instagram:callback] step 1 — token exchange, redirectUri:', redirectUri);
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
    console.log('[instagram:callback] step 1 — HTTP', tokenRes.status);

    let tokenRaw;
    try {
      tokenRaw = await tokenRes.json();
    } catch (parseErr) {
      const text = await tokenRes.text().catch(() => '(unreadable)');
      console.error('[instagram:callback] step 1 — response is not JSON, body:', text);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_exchange_failed`);
    }

    // Normalise both response shapes
    const tokenData = Array.isArray(tokenRaw?.data) ? tokenRaw.data[0] : tokenRaw;
    if (tokenData?.error_type || !tokenData?.access_token) {
      console.error('[instagram:callback] step 1 — failed:', JSON.stringify(tokenRaw));
      let reason = 'token_exchange_failed';
      const msg  = (tokenData?.error_message ?? '').toLowerCase();
      if (msg.includes('invalid platform app'))                      reason = 'invalid_platform_app';
      else if (msg.includes('redirect'))                             reason = 'invalid_redirect_uri';
      else if (msg.includes('secret') || msg.includes('client'))    reason = 'invalid_client_secret';
      else if (msg.includes('scope') || msg.includes('permission')) reason = 'scope_denied';
      else if (msg.includes('code') || msg.includes('already used')) reason = 'code_used';
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=${reason}`);
    }
    if (!tokenData.user_id) {
      console.error('[instagram:callback] step 1 — user_id absent:', JSON.stringify(tokenRaw));
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=account_fetch_failed`);
    }

    const igAccountId = String(tokenData.user_id);
    const shortToken  = tokenData.access_token;
    console.log('[instagram:callback] step 1 — OK, igAccountId:', igAccountId);

    // ── Step 2: fetch Instagram profile to validate the account ─────────────
    // Uses short-lived token; non-fatal if it fails — we already have user_id.
    console.log('[instagram:callback] step 2 — profile fetch');
    try {
      const profileRes  = await fetch(
        `${IG_GRAPH}/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(shortToken)}`
      );
      console.log('[instagram:callback] step 2 — HTTP', profileRes.status);
      const profileData = await profileRes.json();
      if (profileData.error) {
        console.warn('[instagram:callback] step 2 — error (non-fatal):', JSON.stringify(profileData.error));
      } else {
        console.log('[instagram:callback] step 2 — OK, username:', profileData.username, 'account_type:', profileData.account_type);
      }
    } catch (profileErr) {
      console.warn('[instagram:callback] step 2 — fetch threw (non-fatal):', profileErr.message);
    }

    // ── Step 3: exchange short-lived token for long-lived token (~60 days) ───
    // Endpoint is unversioned: graph.instagram.com/access_token (no /v25.0/).
    // Only client_secret + access_token needed; client_id is not required here.
    console.log('[instagram:callback] step 3 — long-lived token exchange');
    const longRes = await fetch(
      'https://graph.instagram.com/access_token?' + new URLSearchParams({
        grant_type:    'ig_exchange_token',
        client_secret: igClientSecret(),
        access_token:  shortToken,
      })
    );
    console.log('[instagram:callback] step 3 — HTTP', longRes.status);

    let longData;
    try {
      longData = await longRes.json();
    } catch (parseErr) {
      const text = await longRes.text().catch(() => '(unreadable)');
      console.error('[instagram:callback] step 3 — response is not JSON, body:', text);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_refresh_failed`);
    }

    if (longData.error || !longData.access_token) {
      console.error('[instagram:callback] step 3 — failed:', JSON.stringify(longData));
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=token_refresh_failed`);
    }

    const accessToken = longData.access_token;
    const expiresIn   = longData.expires_in;
    const expiresAt   = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    console.log('[instagram:callback] step 3 — OK, expires_in:', expiresIn ?? 'not provided');

    // ── Step 4: persist on Creator row ───────────────────────────────────────
    // Column names are snake_case as defined in the DB migration.
    console.log('[instagram:callback] step 4 — DB update, creatorId:', creatorId);
    let updateResult;
    try {
      updateResult = await pool.query(
        `UPDATE "Creator"
         SET instagram_account_id       = $1,
             instagram_access_token     = $2,
             instagram_token_expires_at = $3
         WHERE id = $4`,
        [igAccountId, accessToken, expiresAt, creatorId]
      );
    } catch (dbErr) {
      console.error('[instagram:callback] step 4 — DB error:', dbErr.message);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=database_update_failed`);
    }

    if (updateResult.rowCount === 0) {
      console.error('[instagram:callback] step 4 — 0 rows updated, creatorId not found:', creatorId);
      return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=creator_not_found`);
    }

    console.log('[instagram:callback] step 4 — OK, rows updated:', updateResult.rowCount);
    console.log(`[instagram:callback] connected igAccountId=${igAccountId} creatorId=${creatorId}`);
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=connected`);

  } catch (err) {
    console.error('[instagram:callback] unexpected error:', err.message, '\n', err.stack);
    return res.redirect(302, `/admin/creators/${creatorId}?instagram=error&reason=server_error`);
  } finally {
    await pool.end();
  }
}

// ── GET preview ───────────────────────────────────────────────────────────────
async function handlePreview(pool, itineraryId, ctx) {
  if (!itineraryId) throw Object.assign(new Error('id is required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT i.id, i.title, i.slug, i.subtitle, i.description, i.excerpt, i."coverImage",
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

  // Check publish permission via Meta debug_token — best-effort, non-blocking
  const canPublish = await hasPublishPermission(it.instagram_access_token);
  const permissionWarning = canPublish
    ? null
    : 'Instagram is connected, but publishing permission is missing. Please reconnect Instagram.';

  return {
    caption:   generateCaption(it),
    images,
    itinerary: {
      id: it.id, title: it.title, subtitle: it.subtitle,
      destination: it.destination, country: it.country, durationDays: it.durationDays,
    },
    tokenWarning,
    permissionWarning,
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

// ── GET proxy-image ───────────────────────────────────────────────────────────
// Proxies an external image to avoid canvas CORS restrictions.
// Blocks RFC-1918 / loopback addresses.
async function handleProxyImage(req, res) {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    throw Object.assign(new Error('url param is required and must be http(s)'), { status: 400 });
  }
  if (/localhost|127\.\d|10\.\d|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1/i.test(url)) {
    throw Object.assign(new Error('Private/loopback URLs are not allowed'), { status: 400 });
  }

  const imgRes = await fetch(url, { headers: { 'User-Agent': 'HiddenAtlas-Proxy/1.0' } });
  if (!imgRes.ok) {
    throw Object.assign(new Error(`Upstream image fetch failed (${imgRes.status})`), { status: 502 });
  }
  const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw Object.assign(new Error('URL does not point to an image'), { status: 400 });
  }

  const buffer = await imgRes.arrayBuffer();
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).send(Buffer.from(buffer));
}

// ── POST upload-cover ─────────────────────────────────────────────────────────
// Receives base64-encoded JPEG from the canvas generator and stores it in
// Vercel Blob, returning the public URL to use as the Instagram imageUrl.
async function handleUploadCover(body, ctx) {
  const { base64, itineraryId } = body;
  if (!base64)      throw Object.assign(new Error('base64 is required'),      { status: 400 });
  if (!itineraryId) throw Object.assign(new Error('itineraryId is required'), { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw Object.assign(
      new Error('Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)'),
      { status: 503 }
    );
  }

  const buffer   = Buffer.from(base64, 'base64');
  const blobPath = `instagram-covers/${itineraryId}-${Date.now()}.jpg`;
  const result   = await blobPut(blobPath, buffer, {
    access:          'public',
    contentType:     'image/jpeg',
    addRandomSuffix: false,
  });

  console.log('[instagram:upload-cover]', { itineraryId, url: result.url, bytes: buffer.length });
  return { url: result.url };
}
