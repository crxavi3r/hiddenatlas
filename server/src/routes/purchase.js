const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// POST /api/purchase
// Body: { userId, itineraryId, amount }
router.post('/', async (req, res) => {
  const { userId, itineraryId, amount } = req.body;

  if (!userId || !itineraryId || amount == null) {
    return res.status(400).json({ error: 'userId, itineraryId and amount are required' });
  }

  try {
    const purchase = await prisma.purchase.create({
      data: { userId, itineraryId, amount: parseFloat(amount) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        itinerary: { select: { id: true, title: true, slug: true } },
      },
    });
    res.status(201).json(purchase);
  } catch (err) {
    // P2025 = related record not found (bad userId or itineraryId)
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User or itinerary not found' });
    }
    console.error('[POST /purchase]', err.message);
    res.status(500).json({ error: 'Failed to create purchase' });
  }
});

module.exports = router;
