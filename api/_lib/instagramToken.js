// Central Instagram token lifecycle management.
// NEVER log the full access token — only the last 4 chars when needed.
//
// Two separate token contexts:
//   1. Per-creator publishing token  — Creator.instagram_access_token
//      Used for: posting to the creator's own Instagram account
//      Helper:   ensureValidInstagramToken(pool, creatorId)
//
//   2. Server Business Discovery connection — env vars only
//      Used for: CRM enrichment, Business Discovery API (looking up other accounts)
//      Helper:   getMetaDiscoveryConnection()
//      Env vars: META_INSTAGRAM_ACCOUNT_ID + META_GRAPH_ACCESS_TOKEN

const IG_REFRESH_ENDPOINT    = 'https://graph.instagram.com/refresh_access_token';
const REFRESH_THRESHOLD_DAYS = 7;

// ── Publishing token ─────────────────────────────────────────────────────────

/**
 * Ensures a Creator has a valid Instagram access token for PUBLISHING.
 * Not used for Business Discovery — see getMetaDiscoveryConnection().
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

  // null expiresAt = expiry was not stored during OAuth exchange.
  // Treat as valid — a definite future timestamp is required to call EXPIRED.
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    console.warn('[InstagramToken] Token expired for creator:', creatorId, {
      expiresAt: new Date(expiresAt).toISOString(),
    });
    return { status: 'EXPIRED' };
  }

  if (!expiresAt) {
    console.warn('[InstagramToken] No expiry date stored — treating token as valid:', {
      creatorId, accountId,
    });
  }

  const daysUntilExpiry = expiresAt
    ? (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
    : null;

  if (daysUntilExpiry !== null && daysUntilExpiry <= REFRESH_THRESHOLD_DAYS) {
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

// ── Business Discovery connection ─────────────────────────────────────────────

/**
 * Returns the server-level Meta connection for CRM / Business Discovery API calls.
 *
 * ⚠️  IMPORTANT — two different Instagram account contexts:
 *
 *   Publishing (per-creator):
 *     Creator.instagram_access_token → account ID from Creator.instagram_account_id
 *     e.g. 27037612042559394 (creator's own personal/business account)
 *     Used by handlePublish / handlePreview in api/instagram.js
 *
 *   Business Discovery (server-level):
 *     META_GRAPH_ACCESS_TOKEN → META_INSTAGRAM_ACCOUNT_ID
 *     e.g. 17841440950330512 (hiddenatlas.travel, from me/accounts on the FB page)
 *     Used by CRM enrichment and refresh — THIS function
 *
 * These are separate Instagram accounts. Using a creator's publishing token for
 * Business Discovery will fail with a permission error (wrong account).
 *
 * Required env vars:
 *   META_INSTAGRAM_ACCOUNT_ID  = 17841440950330512   (hiddenatlas.travel IG Business account)
 *   META_GRAPH_ACCESS_TOKEN    = <long-lived token with instagram_business_basic permission>
 *
 * Returns one of:
 *   { status: 'OK',             token, accountId, version, tokenTail }
 *   { status: 'NOT_CONFIGURED', missing }
 */
export function getMetaDiscoveryConnection() {
  const version   = process.env.META_GRAPH_API_VERSION || 'v25.0';
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const token     = process.env.META_GRAPH_ACCESS_TOKEN
                 || process.env.META_PAGE_ACCESS_TOKEN
                 || process.env.META_INSTAGRAM_ACCESS_TOKEN;

  // Always log env var presence so missing values are visible in Vercel logs
  console.info('[MetaDiscovery] Env var diagnostic:', {
    'META_INSTAGRAM_ACCOUNT_ID exists': Boolean(accountId),
    igBusinessAccountId:                accountId ?? '(not set)',
    'META_PAGE_ACCESS_TOKEN exists':    Boolean(process.env.META_PAGE_ACCESS_TOKEN),
    'META_GRAPH_ACCESS_TOKEN exists':   Boolean(process.env.META_GRAPH_ACCESS_TOKEN),
    tokenSource:                        process.env.META_GRAPH_ACCESS_TOKEN ? 'META_GRAPH_ACCESS_TOKEN'
                                      : process.env.META_PAGE_ACCESS_TOKEN   ? 'META_PAGE_ACCESS_TOKEN'
                                      : process.env.META_INSTAGRAM_ACCESS_TOKEN ? 'META_INSTAGRAM_ACCESS_TOKEN'
                                      : '(none)',
    graphEndpoint:                      `graph.facebook.com/${version}`,
    tokenTail:                          token ? token.slice(-4) : '(no token)',
  });

  const missing = [];
  if (!accountId) missing.push('META_INSTAGRAM_ACCOUNT_ID');
  if (!token)     missing.push('META_PAGE_ACCESS_TOKEN');

  if (missing.length) {
    console.warn('[MetaDiscovery] Connection not configured — missing env vars:', { missing });
    return { status: 'NOT_CONFIGURED', missing };
  }

  return { status: 'OK', token, accountId, version, tokenTail: token.slice(-4) };
}

// ── Internal: token refresh ───────────────────────────────────────────────────

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
