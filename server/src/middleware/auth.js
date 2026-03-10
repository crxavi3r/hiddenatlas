const { requireAuth, clerkClient } = require('@clerk/express');
const prisma = require('../lib/prisma');

// ── protect ───────────────────────────────────────────────────
// Verifies the Clerk JWT in the Authorization header.
// Attaches req.auth.userId. Returns 401 if missing or invalid.
const protect = requireAuth();

// ── syncUser ──────────────────────────────────────────────────
// Runs after protect. Upserts the User row in PostgreSQL using
// the verified clerkId from req.auth — never from req.body.
async function syncUser(req, res, next) {
  const { userId: clerkId } = req.auth;
  try {
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

    req.dbUser = dbUser;
    next();
  } catch (err) {
    console.error('[syncUser]', err.message);
    res.status(500).json({ error: 'User sync failed' });
  }
}

module.exports = { protect, syncUser };
