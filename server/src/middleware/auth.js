const { requireAuth, clerkClient } = require('@clerk/express');
const prisma = require('../lib/prisma');

// ── requireAuth ───────────────────────────────────────────────
// Drop-in middleware: verifies the Clerk JWT in the Authorization
// header and attaches req.auth.userId (Clerk's user_xxx ID).
// Returns 401 if the token is missing or invalid.
const protect = requireAuth();

// ── syncUser ──────────────────────────────────────────────────
// Runs after protect. Looks up (or creates) the PostgreSQL User
// that matches the Clerk identity. Attaches req.dbUser so every
// downstream route handler has the real DB record ready.
async function syncUser(req, res, next) {
  const { userId: clerkId } = req.auth;
  try {
    // Fetch fresh profile from Clerk so we always have email + name
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email = clerkUser.emailAddresses[0]?.emailAddress
      ?? `${clerkId}@clerk.local`;
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
      || 'HiddenAtlas User';

    const dbUser = await prisma.user.upsert({
      where:  { clerkId },
      update: { email, name },
      create: { clerkId, email, name },
    });

    req.dbUser = dbUser; // { id (UUID), clerkId, email, name, … }
    next();
  } catch (err) {
    console.error('[syncUser]', err.message);
    res.status(500).json({ error: 'User sync failed' });
  }
}

module.exports = { protect, syncUser };
