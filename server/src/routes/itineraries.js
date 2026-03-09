const { Router } = require('express');
const prisma = require('../lib/prisma');

const router = Router();

// ── GET /api/itineraries ──────────────────────────────────────
// Published itinerary listing (no full content)
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

// ── GET /api/itineraries/:slug/access?userId= ─────────────────
// Returns whether a user has purchased a given itinerary.
// Safe to call without userId — just returns hasAccess: false.
router.get('/:slug/access', async (req, res) => {
  const { slug } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.json({ hasAccess: false, pdfUrl: null });
  }

  try {
    const purchase = await prisma.purchase.findFirst({
      where: { userId, itinerary: { slug } },
      include: { itinerary: { select: { pdfUrl: true } } },
    });

    res.json({
      hasAccess: !!purchase,
      pdfUrl: purchase?.itinerary?.pdfUrl ?? null,
    });
  } catch (err) {
    console.error('[GET /itineraries/:slug/access]', err.message);
    res.status(500).json({ error: 'Access check failed' });
  }
});

// ── POST /api/itineraries/:slug/purchase ──────────────────────
// Simulates a completed payment.
// Upserts both the itinerary and the user so the flow works
// without pre-seeding the database.
// Body: { userId, amount, title?, coverImage? }
router.post('/:slug/purchase', async (req, res) => {
  const { slug } = req.params;
  const { userId, amount, title, coverImage } = req.body;

  if (!userId || amount == null) {
    return res.status(400).json({ error: 'userId and amount are required' });
  }

  try {
    // Ensure the demo/placeholder user exists
    await prisma.user.upsert({
      where:  { id: userId },
      update: {},
      create: { id: userId, email: `user-${userId}@hiddenatlas.com`, name: 'HiddenAtlas User' },
    });

    // Ensure the itinerary row exists in the database
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
// Full itinerary by slug (kept for future CMS-driven pages)
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
