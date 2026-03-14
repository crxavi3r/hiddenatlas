import Stripe from 'stripe';
import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// Disable Vercel's automatic body parsing — needed so the webhook action can
// receive raw bytes for Stripe signature verification. Non-webhook actions
// parse JSON manually from the raw body below.
export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// POST /api/checkout?action=session  — create Stripe checkout session
// POST /api/checkout?action=verify   — verify completed payment
// POST /api/checkout                 — webhook (detected by stripe-signature header)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await getRawBody(req);

  // ── Webhook (detected by Stripe-Signature header) ────────────────────────
  if (req.headers['stripe-signature']) {
    return handleWebhook(req, res, rawBody);
  }

  // ── JSON actions ─────────────────────────────────────────────────────────
  let body;
  try {
    body = rawBody.length ? JSON.parse(rawBody.toString()) : {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { action } = req.query;
  if (action === 'session') return handleSession(req, res, body);
  if (action === 'verify') return handleVerify(req, res, body);

  return res.status(400).json({ error: 'Unknown checkout action. Use ?action=session or ?action=verify' });
}

// ── POST /api/checkout?action=session ────────────────────────────────────────
async function handleSession(req, res, body) {
  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slug } = body;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let userId, userEmail;
  try {
    const { rows } = await pool.query(
      `SELECT id, email FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    userId = rows[0].id;
    userEmail = rows[0].email;
  } catch (err) {
    console.error('[checkout/session] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }

  const origin = req.headers.origin || 'http://localhost:3000';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // ── Diagnostics: inspect the Price object before creating the session ──────
  // This does NOT change checkout behavior — read-only fetch for logging only.
  try {
    const priceId = process.env.STRIPE_PRICE_ID;
    console.log('[checkout/session] STRIPE_PRICE_ID present:', !!priceId, '| value:', priceId);
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      console.log('[checkout/session] price currency:', price.currency, '| unit_amount:', price.unit_amount, '| active:', price.active);
    }
  } catch (diagErr) {
    console.warn('[checkout/session] price diagnostics failed (non-fatal):', diagErr.message);
  }

  try {
    const sessionParams = {
      automatic_payment_methods: { enabled: true },
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      customer_email: userEmail,
      success_url: `${origin}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/itineraries/${slug}`,
      metadata: {
        itinerary_slug: slug,
        user_id:        userId,
        clerk_id:       clerkId,
      },
    };

    console.log('[checkout/session] creating session — slug:', slug, '| automatic_payment_methods: true');

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[checkout/session] session created — id:', session.id, '| payment_method_types returned by Stripe:', JSON.stringify(session.payment_method_types));

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout/session] Stripe error — type:', err.type, '| code:', err.code, '| requestId:', err.requestId ?? 'n/a', '| message:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}

// ── POST /api/checkout?action=verify ─────────────────────────────────────────
async function handleVerify(req, res, body) {
  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return res.status(400).json({ error: 'Invalid session' });
  }

  if (session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'Payment not completed', hasAccess: false });
  }

  const { itinerary_slug: slug, user_id: userId } = session.metadata || {};
  if (!slug || !userId) {
    return res.status(400).json({ error: 'Invalid session metadata' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length || users[0].id !== userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    await pool.query(
      `INSERT INTO "Itinerary" (id, slug, title, description, price, "coverImage", "isPublished", "createdAt")
       VALUES (gen_random_uuid(), $1, $1, '', $2, '', true, NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [slug, session.amount_total / 100]
    );

    const { rows: itineraries } = await pool.query(
      `SELECT id, "pdfUrl" FROM "Itinerary" WHERE slug = $1`,
      [slug]
    );
    const itinerary = itineraries[0];

    await pool.query(
      `INSERT INTO "Purchase" (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId", amount, status, "purchasedAt", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'paid', NOW(), NOW())
       ON CONFLICT ("userId", "itineraryId") DO NOTHING`,
      [userId, itinerary.id, sessionId, session.payment_intent, session.amount_total / 100]
    );

    return res.status(200).json({ hasAccess: true, pdfUrl: itinerary.pdfUrl ?? null });
  } catch (err) {
    console.error('[checkout/verify] DB error:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  } finally {
    await pool.end();
  }
}

// ── POST /api/checkout (stripe-signature header present) ─────────────────────
async function handleWebhook(req, res, rawBody) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[checkout/webhook] signature error:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  if (session.payment_status !== 'paid') return res.status(200).json({ received: true });

  const { itinerary_slug: slug, user_id: userId } = session.metadata || {};
  if (!slug || !userId) return res.status(200).json({ received: true });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM "Purchase" WHERE "stripeSessionId" = $1`,
      [session.id]
    );
    if (existing.length) return res.status(200).json({ received: true });

    await pool.query(
      `INSERT INTO "Itinerary" (id, slug, title, description, price, "coverImage", "isPublished", "createdAt")
       VALUES (gen_random_uuid(), $1, $1, '', $2, '', true, NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [slug, session.amount_total / 100]
    );

    const { rows: itineraries } = await pool.query(
      `SELECT id FROM "Itinerary" WHERE slug = $1`,
      [slug]
    );

    await pool.query(
      `INSERT INTO "Purchase" (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId", amount, status, "purchasedAt", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'paid', NOW(), NOW())
       ON CONFLICT ("stripeSessionId") DO NOTHING`,
      [userId, itineraries[0].id, session.id, session.payment_intent, session.amount_total / 100]
    );
  } catch (err) {
    console.error('[checkout/webhook] DB error:', err.message);
    // Return 200 so Stripe does not retry — /verify is the client-facing fallback
  } finally {
    await pool.end();
  }

  return res.status(200).json({ received: true });
}
