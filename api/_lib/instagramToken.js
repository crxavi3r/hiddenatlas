// Central Instagram token lifecycle management for per-creator OAuth tokens.
// Used by CRM import, Discovery enrichment, and Instagram Publishing.
//
// NEVER log the full access token — only the last 4 chars when needed.

const IG_REFRESH_ENDPOINT    = 'https://graph.instagram.com/refresh_access_token';
const REFRESH_THRESHOLD_DAYS = 7;

/**
 * Ensures a Creator has a valid Instagram access token.
 * Performs a preventive refresh if the token expires within 7 days.
 *
 * Returns one of:
 *   { status: 'OK',           token, accountId, refreshed }
 *   { status: 'EXPIRED'                                    }
 *   { status: 'NOT_CONNECTED'                              }
 *
 * @param {import('pg').Pool} pool
 * @param {string}            creatorId — Creator.id UUID
 */
export async function ensureValidInstagramToken(pool, creatorId) {
  if (!creatorId) return { status: 'NOT_CONNECTED' };

  const { rows } = await pool.query(
    `SELECT instagram_access_token, instagram_token_expires_at, instagram_account_id
     FROM "Creator" WHERE id = $1 LIMIT 1`,
    [creatorId]
  );

  if (!rows.length || !rows[0].instagram_access_token) {
    console.info('[InstagramToken] No token stored for creator:', creatorId);
    return { status: 'NOT_CONNECTED' };
  }

  const {
    instagram_access_token:     token,
    instagram_token_expires_at: expiresAt,
    instagram_account_id:       accountId,
  } = rows[0];

  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    console.warn('[InstagramToken] Token expired for creator:', creatorId, {
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
    return { status: 'EXPIRED' };
  }

  const daysUntilExpiry = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;

  if (daysUntilExpiry <= REFRESH_THRESHOLD_DAYS) {
    console.info('[InstagramToken] Token expiring soon — attempting preventive refresh:', {
      creatorId, daysUntilExpiry: daysUntilExpiry.toFixed(1),
    });
    const refreshResult = await _refreshToken(pool, creatorId, token);
    if (refreshResult) {
      return { status: 'OK', token: refreshResult.token, accountId, refreshed: true };
    }
    // Refresh failed but token is still within expiry — continue with current token
    console.warn('[InstagramToken] Refresh failed — using current (still-valid) token:', { creatorId });
  }

  return { status: 'OK', token, accountId, refreshed: false };
}

/**
 * Determines the correct Meta access token for CRM / Business Discovery API calls.
 *
 * Priority:
 *   1. Per-creator OAuth token (`ctx.creatorId`) — refreshed preventively if needed
 *   2. Server env var (`META_GRAPH_ACCESS_TOKEN` / `META_PAGE_ACCESS_TOKEN`)
 *
 * Returns one of:
 *   { status: 'OK',                     token, accountId, source: 'creator'|'env', creatorSlug? }
 *   { status: 'CREATOR_TOKEN_EXPIRED',  creatorSlug }   — creator token exists but expired
 *   { status: 'ENV_NOT_CONFIGURED',     missing }        — no creator token, env vars absent
 *
 * @param {import('pg').Pool} pool
 * @param {{ creatorId?: string|null, creatorSlug?: string|null }} ctx
 */
export async function getMetaAccessTokenForDiscovery(pool, ctx) {
  if (ctx?.creatorId) {
    const result = await ensureValidInstagramToken(pool, ctx.creatorId);

    if (result.status === 'OK') {
      console.info('[MetaDiscovery] Using per-creator OAuth token:', {
        creatorId:   ctx.creatorId,
        accountId:   result.accountId,
        source:      'creator',
        tokenTail:   result.token?.slice(-4),
        refreshed:   result.refreshed,
      });
      return {
        status:      'OK',
        token:       result.token,
        accountId:   result.accountId,
        source:      'creator',
        creatorSlug: ctx.creatorSlug ?? null,
      };
    }

    if (result.status === 'EXPIRED') {
      console.warn('[MetaDiscovery] Creator token expired — cannot fall back to env var:', {
        creatorId:   ctx.creatorId,
        creatorSlug: ctx.creatorSlug ?? null,
      });
      return {
        status:      'CREATOR_TOKEN_EXPIRED',
        creatorSlug: ctx.creatorSlug ?? null,
      };
    }

    // NOT_CONNECTED: creator has no OAuth token — fall through to env var
    console.info('[MetaDiscovery] Creator has no OAuth token — trying env var:', {
      creatorId: ctx.creatorId,
    });
  }

  // Try server-level env var token
  const version   = process.env.META_GRAPH_API_VERSION || 'v25.0';
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const token     = process.env.META_GRAPH_ACCESS_TOKEN
                 || process.env.META_PAGE_ACCESS_TOKEN
                 || process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const missing   = [];
  if (!accountId) missing.push('META_INSTAGRAM_ACCOUNT_ID');
  if (!token)     missing.push('META_GRAPH_ACCESS_TOKEN');

  if (missing.length) {
    console.warn('[MetaDiscovery] Env var Meta token not configured:', { missing });
    return { status: 'ENV_NOT_CONFIGURED', missing };
  }

  console.info('[MetaDiscovery] Using server env var Meta token:', {
    accountId, source: 'env', version, tokenTail: token.slice(-4),
  });
  return { status: 'OK', token, accountId, source: 'env', version };
}

async function _refreshToken(pool, creatorId, currentToken) {
  try {
    const url = `${IG_REFRESH_ENDPOINT}?grant_type=ig_refresh_token&access_token=${encodeURIComponent(currentToken)}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      console.error('[InstagramToken] Refresh API rejected request:', {
        creatorId, httpStatus: res.status, apiError: data?.error,
      });
      return null;
    }

    const newToken  = data.access_token;
    const expiresIn = data.expires_in ?? 5_184_000; // 60 days default
    const newExpiry = new Date(Date.now() + expiresIn * 1_000);

    await pool.query(
      `UPDATE "Creator"
       SET instagram_access_token     = $1,
           instagram_token_expires_at = $2,
           "updatedAt"                = NOW()
       WHERE id = $3`,
      [newToken, newExpiry.toISOString(), creatorId]
    );

    console.info('[InstagramToken] Token refreshed successfully:', {
      creatorId, newExpiry: newExpiry.toISOString(),
    });
    return { token: newToken, expiresAt: newExpiry };
  } catch (err) {
    console.error('[InstagramToken] Refresh threw unexpectedly:', {
      creatorId, error: err.message,
    });
    return null;
  }
}
