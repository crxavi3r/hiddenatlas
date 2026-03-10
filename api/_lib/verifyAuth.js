import { verifyToken } from '@clerk/backend';

// Production domains that are allowed to issue Clerk JWTs.
// Required in @clerk/backend v1.x: verifyToken rejects tokens whose `azp`
// claim does not match an entry here — mobile OAuth tokens always carry `azp`.
const AUTHORIZED_PARTIES = [
  'https://hiddenatlas.travel',
  'https://www.hiddenatlas.travel',
];

/**
 * Verifies the Clerk Bearer token from the Authorization header.
 * Returns the clerkId (payload.sub) on success, or throws with a message.
 *
 * @param {string} authHeader  Value of the Authorization request header
 * @returns {Promise<string>}  clerkId
 */
export async function verifyAuth(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing authorization header'), { status: 401 });
  }
  const token = authHeader.slice(7);

  const payload = await verifyToken(token, {
    secretKey:        process.env.CLERK_SECRET_KEY,
    authorizedParties: AUTHORIZED_PARTIES,
  });

  return payload.sub;
}
