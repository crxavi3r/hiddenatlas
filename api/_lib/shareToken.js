// ── shareToken.js ─────────────────────────────────────────────────────────────
// Cryptographically secure share-token utilities for Agency client portals.
//
// SECURITY MODEL:
//   - Raw token: 32 crypto-random bytes encoded as base64url (URL-safe)
//   - Stored:    SHA-256 hash of the raw token ONLY
//   - Raw token is returned once for URL construction and NEVER stored/logged
//
// Why not store the raw token?
//   If the DB were compromised, an attacker could not derive valid share URLs
//   from stored hashes alone (preimage resistance of SHA-256).

import { randomBytes, createHash } from 'crypto';

/**
 * Generates a new cryptographically secure share token.
 *
 * @returns {{ token: string, hash: string }}
 *   token — base64url-encoded raw token (32 bytes = 256 bits)
 *   hash  — SHA-256 hex digest of the raw token (store this, never the token)
 */
export function generateShareToken() {
  const raw = randomBytes(32);
  const token = raw.toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Hashes an incoming token for DB lookup.
 * Use this when validating a token from a URL parameter.
 *
 * @param {string} token   The raw base64url token from the URL
 * @returns {string}       SHA-256 hex digest to query against share_token_hash
 */
export function hashShareToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
