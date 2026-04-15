// ── adminEmails ────────────────────────────────────────────────────────────────
// Canonical list of email addresses that always receive admin access,
// regardless of the role stored in the database.
//
// Usage:
//   import { isAdminEmail } from './adminEmails.js';
//   const isAdmin = role === 'admin' || isAdminEmail(email);

const ADMIN_EMAILS = new Set([
  'cristiano.xavier@hiddenatlas.travel',
  'cristiano.xavier@outlook.com',
]);

/**
 * Returns true if the email matches one of the hardcoded admin addresses.
 * Comparison is case-insensitive and trims surrounding whitespace.
 * @param {string|null|undefined} email
 * @returns {boolean}
 */
export function isAdminEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return ADMIN_EMAILS.has(email.toLowerCase().trim());
}
