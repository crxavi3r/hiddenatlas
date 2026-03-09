const { Router } = require('express');
const prisma = require('../lib/prisma');
const { protect, syncUser } = require('../middleware/auth');

const router = Router();

// ── POST /api/purchase ────────────────────────────────────────
// Protected — generic purchase endpoint (used when the caller
// already knows the itineraryId UUID).
// Body: { itineraryId, amount }
router.post('/', protect, syncUser, async (req, res) => {
  const { itineraryId, amount } = req.body;
  const userId = req.dbUser.id;

  if (!itineraryId || amount == null) {
    return res.status(400).json({ error: 'itineraryId and amount are required' });
  }

  try {
    const purchase = await prisma.purchase.create({
      data: { userId, itineraryId, amount: parseFloat(amount), status: 'paid' },
      select: {
        id:          true,
        amount:      true,
        status:      true,
        purchasedAt: true,
        user:      { select: { id: true, name: true, email: true } },
        itinerary: { select: { id: true, title: true, slug: true } },
      },
    });
    res.status(201).json(purchase);
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Itinerary not found' });
    }
    console.error('[POST /purchase]', err.message);
    res.status(500).json({ error: 'Failed to create purchase' });
  }
});

module.exports = router;
