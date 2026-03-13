const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { protect, syncUser } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── POST /api/checkout/session ─────────────────────────────────
// Creates a Stripe Checkout session for a premium itinerary.
// Uses the single shared STRIPE_PRICE_ID; itinerary identity lives in metadata.
router.post('/session', protect, syncUser, async (req, res) => {
  try {
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug is required' });

    if (!process.env.STRIPE_PRICE_ID) {
      console.error('STRIPE_PRICE_ID is not configured');
      return res.status(500).json({ error: 'Payment not configured' });
    }

    const successUrl = `${process.env.CLIENT_ORIGIN}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${process.env.CLIENT_ORIGIN}/itineraries/${slug}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: {
        itinerary_slug: slug,
        user_id:        req.dbUser.id,
        clerk_id:       req.auth.userId,
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/checkout/verify ──────────────────────────────────
// Called when the user returns from Stripe (success_url contains ?session_id=).
// Verifies payment status and persists a Purchase record.
router.post('/verify', protect, syncUser, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed', hasAccess: false });
    }

    const { itinerary_slug: slug, user_id: userId } = session.metadata;

    // Guard: only the authenticated user can claim their own session
    if (userId !== req.dbUser.id) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Upsert itinerary stub so purchases can reference it
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

    // Idempotent: skip if already purchased (webhook may have arrived first)
    const existing = await prisma.purchase.findFirst({
      where: { userId: req.dbUser.id, itineraryId: itinerary.id },
    });

    if (!existing) {
      await prisma.purchase.create({
        data: {
          userId:                req.dbUser.id,
          itineraryId:           itinerary.id,
          stripeSessionId:       sessionId,
          stripePaymentIntentId: session.payment_intent,
          amount:                session.amount_total / 100,
          status:                'paid',
        },
      }).catch(err => {
        // P2002 = unique constraint violation — webhook already created this purchase
        if (err.code !== 'P2002') throw err;
      });
    }

    res.json({ hasAccess: true, pdfUrl: itinerary.pdfUrl });
  } catch (err) {
    console.error('Checkout verify error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ── POST /api/checkout/webhook ─────────────────────────────────
// Stripe webhook — production reliability fallback.
// Requires raw body; mounted BEFORE express.json() in index.js.
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

    const { itinerary_slug: slug, user_id: userId } = session.metadata || {};
    if (!slug || !userId) return res.json({ received: true });

    try {
      // Idempotent on session ID — safe if webhook is retried
      const existing = await prisma.purchase.findUnique({
        where: { stripeSessionId: session.id },
      });
      if (existing) return res.json({ received: true });

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

      await prisma.purchase.create({
        data: {
          userId,
          itineraryId:           itinerary.id,
          stripeSessionId:       session.id,
          stripePaymentIntentId: session.payment_intent,
          amount:                session.amount_total / 100,
          status:                'paid',
        },
      }).catch(err => {
        // P2002 = verify endpoint already created this purchase — safe to ignore
        if (err.code !== 'P2002') throw err;
      });
    } catch (err) {
      console.error('Webhook DB error:', err);
      // Return 200 so Stripe does not retry — /verify is the client-facing fallback
    }
  }

  res.json({ received: true });
});

module.exports = router;
