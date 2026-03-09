const { Router } = require('express');
const prisma = require('../lib/prisma');
const { protect, syncUser } = require('../middleware/auth');

const router = Router();

// ── GET /api/itineraries ──────────────────────────────────────
// Public — published listing only (no full content)
router.get('/', async (_req, res) => {
  try {
    const itineraries = await prisma.itinerary.findMany({
      where: { isPublished: true },
      select: { id: true, title: true, slug: true, excerpt: true, price: true, coverImage: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(itineraries);
  } catch (err) {
    console.error('[GET /itineraries]', err.message);
    res.status(500).json({ error: 'Failed to fetch itineraries' });
  }
});

// ── GET /api/itineraries/:slug/access ────────────────────────
// Protected — checks whether the authenticated user has purchased
// this itinerary. Returns { hasAccess, pdfUrl }.
router.get('/:slug/access', protect, syncUser, async (req, res) => {
  const { slug } = req.params;
  const userId = req.dbUser.id; // PostgreSQL UUID

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { userId, itinerary: { slug } },
      include: { itinerary: { select: { pdfUrl: true } } },
    });
    res.json({ hasAccess: !!purchase, pdfUrl: purchase?.itinerary?.pdfUrl ?? null });
  } catch (err) {
    console.error('[GET /itineraries/:slug/access]', err.message);
    res.status(500).json({ error: 'Access check failed' });
  }
});

// ── POST /api/itineraries/:slug/purchase ─────────────────────
// Protected — creates a purchase record for the authenticated user.
// Upserts the Itinerary row so static itineraries don't need
// to be pre-seeded in the database.
router.post('/:slug/purchase', protect, syncUser, async (req, res) => {
  const { slug } = req.params;
  const { amount, title, coverImage } = req.body;
  const userId = req.dbUser.id;

  if (amount == null) {
    return res.status(400).json({ error: 'amount is required' });
  }

  try {
    // Ensure the itinerary row exists
    const itinerary = await prisma.itinerary.upsert({
      where:  { slug },
      update: {},
      create: {
        title:       title      || slug,
        slug,
        description: '',
        price:       parseFloat(amount),
        coverImage:  coverImage || '',
        isPublished: true,
      },
    });

    // Guard against double-purchase
    const existing = await prisma.purchase.findFirst({
      where: { userId, itineraryId: itinerary.id },
    });
    if (existing) {
      return res.json({ hasAccess: true, purchaseId: existing.id, pdfUrl: itinerary.pdfUrl });
    }

    const purchase = await prisma.purchase.create({
      data: { userId, itineraryId: itinerary.id, amount: parseFloat(amount), status: 'paid' },
    });

    res.status(201).json({ hasAccess: true, purchaseId: purchase.id, pdfUrl: itinerary.pdfUrl });
  } catch (err) {
    console.error('[POST /itineraries/:slug/purchase]', err.message);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

// ── GET /api/itineraries/:slug ────────────────────────────────
// Public — full itinerary by slug (CMS-driven pages)
router.get('/:slug', async (req, res) => {
  try {
    const itinerary = await prisma.itinerary.findFirst({
      where: { slug: req.params.slug, isPublished: true },
    });
    if (!itinerary) return res.status(404).json({ error: 'Itinerary not found' });
    res.json(itinerary);
  } catch (err) {
    console.error('[GET /itineraries/:slug]', err.message);
    res.status(500).json({ error: 'Failed to fetch itinerary' });
  }
});

module.exports = router;
