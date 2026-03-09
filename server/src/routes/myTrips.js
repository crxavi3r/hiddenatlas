const { Router } = require('express');
const prisma = require('../lib/prisma');
const { protect, syncUser } = require('../middleware/auth');

const router = Router();

// ── GET /api/my-trips ─────────────────────────────────────────
// Protected — returns all itineraries purchased by the
// authenticated user. No userId in the URL; identity comes
// from the verified Clerk JWT attached to the request.
router.get('/', protect, syncUser, async (req, res) => {
  const userId = req.dbUser.id;

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
    console.error('[GET /my-trips]', err.message);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

module.exports = router;
