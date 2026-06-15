// Central Instagram token lifecycle management for per-creator OAuth tokens
// Used by CRM import, Discovery enrichment, and Instagram Publishing.

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
