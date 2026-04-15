import { verifyToken } from '@clerk/backend';

// Logged for debugging only — NOT passed to verifyToken.
//
// Background: Clerk JWTs contain an `azp` (authorized party) claim. In some
// configurations this is set to the Clerk Frontend API URL
// (e.g. "your-instance.clerk.accounts.dev"), not the page's origin. Passing
// authorizedParties to verifyToken causes every such token to be rejected with
// "Unauthorized party", even when the signature and expiry are valid.
//
// The JWT signature check against CLERK_SECRET_KEY is the real security
// boundary. authorizedParties is an optional extra layer that breaks more than
// it protects in a single-app setup.
function buildAuthorizedPartiesForLogging() {
  const parties = [
    'https://hiddenatlas.travel',
    'https://www.hiddenatlas.travel',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3001',
    'http://localhost:3002',
  ];
  if (process.env.VERCEL_URL) {
    parties.push(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.CLERK_AUTHORIZED_PARTIES) {
    process.env.CLERK_AUTHORIZED_PARTIES
      .split(',').map(s => s.trim()).filter(Boolean)
      .forEach(p => parties.push(p));
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
  const keyType = secretKey.startsWith('sk_live_') ? 'live'
                : secretKey.startsWith('sk_test_') ? 'test'
                : 'unknown-format';
  console.log(`[verifyAuth] CLERK_SECRET_KEY present, type=${keyType}`);

  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[verifyAuth] missing or malformed Authorization header —',
      authHeader ? `starts with "${authHeader.slice(0, 20)}..."` : 'undefined');
    throw new Error('Missing authorization header');
  }

  const token = authHeader.slice(7);

  // ── Decode for debug logging (no signature check) ─────────────────────────
  const payload = decodeJwtPayload(token);
  if (payload) {
    const now = Math.floor(Date.now() / 1000);
    const knownParties = buildAuthorizedPartiesForLogging();
    console.log('[verifyAuth] token claims (unverified):', {
      sub:               payload.sub,
      azp:               payload.azp,
      iss:               payload.iss,
      expired:           payload.exp ? payload.exp < now : 'no exp',
      secondsUntilExpiry: payload.exp ? payload.exp - now : 'n/a',
      azpInKnownParties: payload.azp ? knownParties.includes(payload.azp) : 'no azp claim',
    });
  } else {
    console.warn('[verifyAuth] could not decode token payload — token may be "null" or malformed');
  }

  // ── Verify signature — NO authorizedParties ───────────────────────────────
  // authorizedParties is intentionally omitted. Clerk JWTs may contain an `azp`
  // claim pointing to the Clerk Frontend API URL, not the page origin. Passing
  // a static list of page origins causes legitimate tokens to be rejected with
  // "Unauthorized party". The secretKey signature check is the security boundary.
  try {
    const verified = await verifyToken(token, { secretKey });
    console.log('[verifyAuth] token verified — sub:', verified.sub);
    return verified.sub;
  } catch (err) {
    console.error('[verifyAuth] token rejected —', err.message,
      '| azp in token:', payload?.azp);
    throw new Error('Invalid or expired token');
  }
}
