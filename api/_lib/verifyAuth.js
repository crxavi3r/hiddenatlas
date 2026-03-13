import { verifyToken } from '@clerk/backend';

// All origins that may appear as the `azp` claim in Clerk JWTs.
// @clerk/backend v1.x rejects tokens whose azp does not match — mobile OAuth
// tokens always carry azp, so this list must include every production origin.
const AUTHORIZED_PARTIES = [
  'https://hiddenatlas.travel',
  'https://www.hiddenatlas.travel',
  'http://localhost:3000',
  'http://localhost:5173',
];

/**
 * Verifies the Clerk Bearer token from the Authorization header.
 * Returns the clerkId (payload.sub) on success.
 * Throws a plain Error on failure — safe to catch and return 401.
 *
 * Logs the failure reason (never the token itself) for production debugging.
 *
 * @param {string|undefined} authHeader  Value of the Authorization request header
 * @returns {Promise<string>}            clerkId
 */
export async function verifyAuth(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('[verifyAuth] missing or malformed Authorization header');
    throw new Error('Missing authorization header');
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, {
      secretKey:         process.env.CLERK_SECRET_KEY,
      authorizedParties: AUTHORIZED_PARTIES,
    });
    return payload.sub;
  } catch (err) {
    // Log the reason (e.g. "Unauthorized party", "JWT is expired") but never the token.
    console.warn('[verifyAuth] token rejected —', err.message);
    throw new Error('Invalid or expired token');
  }
}
