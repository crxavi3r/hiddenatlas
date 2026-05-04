import { verifyToken } from '@clerk/backend';

// authorizedParties is intentionally omitted from verifyToken (see below).
// The JWT signature check against CLERK_SECRET_KEY is the real security
// boundary. authorizedParties breaks more than it protects in a single-app
// setup because Clerk's azp claim may point to the Clerk Frontend API URL,
// not the page origin.

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

  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[verifyAuth] missing or malformed Authorization header');
    throw new Error('Missing authorization header');
  }

  const token = authHeader.slice(7);
  const payload = decodeJwtPayload(token);

  // ── Verify signature — NO authorizedParties ───────────────────────────────
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
