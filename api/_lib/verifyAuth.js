import { verifyToken } from '@clerk/backend';

// All origins that may appear as the `azp` claim in Clerk JWTs.
// @clerk/backend v1.x rejects tokens whose azp does not match — mobile OAuth
// tokens always carry azp, so this list must include every production origin.
//
// VERCEL_URL is injected by Vercel at build/runtime and covers preview deployments
// (e.g. hiddenatlas-git-main-crxavi3r.vercel.app). Without it, all tokens from
// preview deployments are rejected with "Unauthorized party".
function buildAuthorizedParties() {
  const parties = [
    'https://hiddenatlas.travel',
    'https://www.hiddenatlas.travel',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3001',
    'http://localhost:3002',
  ];
  // Vercel injects VERCEL_URL as the raw hostname (no protocol, no trailing slash).
  if (process.env.VERCEL_URL) {
    parties.push(`https://${process.env.VERCEL_URL}`);
  }
  // Allow any extra origins listed in CLERK_AUTHORIZED_PARTIES (comma-separated).
  if (process.env.CLERK_AUTHORIZED_PARTIES) {
    process.env.CLERK_AUTHORIZED_PARTIES.split(',').map(s => s.trim()).filter(Boolean).forEach(p => parties.push(p));
  }
  return parties;
}

/**
 * Decodes a JWT's payload WITHOUT verifying the signature.
 * Used only for debug logging — never trust this for auth.
 * Returns null on any parse error.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Verifies the Clerk Bearer token from the Authorization header.
 * Returns the clerkId (payload.sub) on success.
 * Throws a plain Error on failure — safe to catch and return 401.
 *
 * @param {string|undefined} authHeader  Value of the Authorization request header
 * @returns {Promise<string>}            clerkId
 */
export async function verifyAuth(authHeader) {
  // ── Pre-flight: check env config ──────────────────────────────────────────
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('[verifyAuth] CLERK_SECRET_KEY is not set — cannot verify tokens');
    throw new Error('Server misconfigured: CLERK_SECRET_KEY missing');
  }
  // Log key type (dev vs prod) without revealing the value
  const keyType = secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : 'unknown';
  console.log(`[verifyAuth] CLERK_SECRET_KEY present, type=${keyType}`);

  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[verifyAuth] missing or malformed Authorization header — value:', authHeader ? `present but starts with "${authHeader.slice(0, 20)}..."` : 'undefined');
    throw new Error('Missing authorization header');
  }

  const token = authHeader.slice(7);

  // ── Decode for debug logging (no signature check) ─────────────────────────
  const payload = decodeJwtPayload(token);
  if (payload) {
    const now = Math.floor(Date.now() / 1000);
    console.log('[verifyAuth] token claims (unverified):', {
      sub:  payload.sub,
      azp:  payload.azp,
      iss:  payload.iss,
      exp:  payload.exp,
      iat:  payload.iat,
      expired: payload.exp ? payload.exp < now : 'no exp',
      secondsUntilExpiry: payload.exp ? payload.exp - now : 'n/a',
    });
  } else {
    console.warn('[verifyAuth] could not decode token payload — token may be malformed or "null"');
  }

  const authorizedParties = buildAuthorizedParties();
  console.log('[verifyAuth] authorizedParties:', authorizedParties);

  try {
    const verified = await verifyToken(token, {
      secretKey,
      authorizedParties,
    });
    console.log('[verifyAuth] token verified — sub:', verified.sub);
    return verified.sub;
  } catch (err) {
    // Log the reason (e.g. "Unauthorized party", "JWT is expired") but never the token.
    console.error('[verifyAuth] token rejected —', err.message, '| azp in token:', payload?.azp, '| authorizedParties:', authorizedParties);
    throw new Error('Invalid or expired token');
  }
}
