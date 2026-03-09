const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// GET /api/itineraries
// Returns all itineraries ordered by newest first
router.get('/', async (_req, res) => {
  try {
    const itineraries = await prisma.itinerary.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(itineraries);
  } catch (err) {
    console.error('[GET /itineraries]', err.message);
    res.status(500).json({ error: 'Failed to fetch itineraries' });
  }
});

module.exports = router;
