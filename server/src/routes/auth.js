const { Router } = require('express');
const { protect, syncUser } = require('../middleware/auth');

const router = Router();

// ── POST /api/auth/sync ───────────────────────────────────────
// Called by the frontend immediately after sign-in.
// Verifies the Clerk JWT, upserts the user in PostgreSQL,
// and returns the DB user record so the client has the real ID.
router.post('/sync', protect, syncUser, (req, res) => {
  const { id, clerkId, email, name, createdAt } = req.dbUser;
  res.json({ id, clerkId, email, name, createdAt });
});

module.exports = router;
