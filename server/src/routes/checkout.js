const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { protect, syncUser } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── POST /api/checkout/session ─────────────────────────────────
// Creates a Stripe Checkout session and returns { url }
router.post('/session', protect, syncUser, async (req, res) => {
  try {
    const { slug, amount, title, coverImage } = req.body;
    if (!slug || !amount) return res.status(400).json({ error: 'slug and amount are required' });

    const successUrl = `${process.env.CLIENT_ORIGIN}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${process.env.CLIENT_ORIGIN}/itineraries/${slug}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: title || slug,
            images: coverImage ? [coverImage] : [],
          },
          unit_amount: Math.round(amount * 100), // cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: {
        slug,
        userId: req.dbUser.id,
        clerkId: req.auth.userId,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/checkout/verify ──────────────────────────────────
// Verifies Stripe session and creates Purchase record on success
router.post('/verify', protect, syncUser, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed', hasAccess: false });
    }

    const { slug, userId } = session.metadata;

    // Guard: only let the authenticated user claim their own session
    if (userId !== req.dbUser.id) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Upsert itinerary row (slug must exist in DB; we create a stub if missing)
    let itinerary = await prisma.itinerary.findUnique({ where: { slug } });
    if (!itinerary) {
      itinerary = await prisma.itinerary.create({
        data: {
          slug,
          title:      session.line_items?.data?.[0]?.description ?? slug,
          description: '',
          price:      session.amount_total / 100,
          coverImage: '',
          isPublished: true,
        },
      });
    }

    // Idempotent: skip if already purchased
    const existing = await prisma.purchase.findFirst({
      where: { userId: req.dbUser.id, itineraryId: itinerary.id },
    });

    if (!existing) {
      await prisma.purchase.create({
        data: {
          userId:      req.dbUser.id,
          itineraryId: itinerary.id,
          amount:      session.amount_total / 100,
          status:      'paid',
        },
      });
    }

    res.json({ hasAccess: true, pdfUrl: itinerary.pdfUrl });
  } catch (err) {
    console.error('Checkout verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── POST /api/checkout/webhook ─────────────────────────────────
// Stripe webhook — production reliability fallback
// Requires raw body; mounted BEFORE express.json() in index.js
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.json({ received: true });

    const { slug, userId } = session.metadata || {};
    if (!slug || !userId) return res.json({ received: true });

    try {
      let itinerary = await prisma.itinerary.findUnique({ where: { slug } });
      if (!itinerary) {
        itinerary = await prisma.itinerary.create({
          data: {
            slug,
            title:       slug,
            description: '',
            price:       session.amount_total / 100,
            coverImage:  '',
            isPublished: true,
          },
        });
      }

      const existing = await prisma.purchase.findFirst({
        where: { userId, itineraryId: itinerary.id },
      });
      if (!existing) {
        await prisma.purchase.create({
          data: {
            userId,
            itineraryId: itinerary.id,
            amount:      session.amount_total / 100,
            status:      'paid',
          },
        });
      }
    } catch (err) {
      console.error('Webhook DB error:', err);
      // Return 200 so Stripe doesn't retry — we'll rely on /verify as fallback
    }
  }

  res.json({ received: true });
});

module.exports = router;
