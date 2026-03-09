const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// ── GET /api/my-trips/:userId ─────────────────────────────────
// Returns all itineraries purchased by a given user,
// including pdfUrl so the client can offer a download link.
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const purchases = await prisma.purchase.findMany({
      where: { userId },
      select: {
        id:          true,
        purchasedAt: true,
        status:      true,
        itinerary: {
          select: {
            id:         true,
            title:      true,
            slug:       true,
            excerpt:    true,
            coverImage: true,
            pdfUrl:     true,
          },
        },
      },
      orderBy: { purchasedAt: 'desc' },
    });

    if (purchases.length === 0) {
      return res.status(404).json({ error: 'No purchases found for this user' });
    }

    // Flatten for a clean response shape
    const trips = purchases.map(p => ({
      purchaseId:  p.id,
      purchasedAt: p.purchasedAt,
      status:      p.status,
      itineraryId: p.itinerary.id,
      title:       p.itinerary.title,
      slug:        p.itinerary.slug,
      excerpt:     p.itinerary.excerpt,
      coverImage:  p.itinerary.coverImage,
      pdfUrl:      p.itinerary.pdfUrl,
    }));

    res.json(trips);
  } catch (err) {
    console.error('[GET /my-trips/:userId]', err.message);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

module.exports = router;
