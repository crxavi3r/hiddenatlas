const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// ── GET /api/itineraries ──────────────────────────────────────
// Returns all published itineraries (listing fields only — no htmlContent/pdfUrl)
router.get('/', async (_req, res) => {
  try {
    const itineraries = await prisma.itinerary.findMany({
      where: { isPublished: true },
      select: {
        id:         true,
        title:      true,
        slug:       true,
        excerpt:    true,
        price:      true,
        coverImage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(itineraries);
  } catch (err) {
    console.error('[GET /itineraries]', err.message);
    res.status(500).json({ error: 'Failed to fetch itineraries' });
  }
});

// ── GET /api/itineraries/:slug ────────────────────────────────
// Returns a single published itinerary by slug (full content)
router.get('/:slug', async (req, res) => {
  try {
    const itinerary = await prisma.itinerary.findFirst({
      where: { slug: req.params.slug, isPublished: true },
    });
    if (!itinerary) {
      return res.status(404).json({ error: 'Itinerary not found' });
    }
    res.json(itinerary);
  } catch (err) {
    console.error('[GET /itineraries/:slug]', err.message);
    res.status(500).json({ error: 'Failed to fetch itinerary' });
  }
});

module.exports = router;
