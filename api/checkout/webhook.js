import Stripe from 'stripe';
import pg from 'pg';

const { Pool } = pg;

// Disable Vercel's automatic body parsing — Stripe needs the raw bytes to verify
// the webhook signature.
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

// POST /api/checkout/webhook
// Stripe webhook — production reliability fallback alongside /api/checkout/verify.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    const rawBody = await getRawBody(req);
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
    // Idempotent on stripeSessionId — safe when Stripe retries
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
