import Stripe from 'stripe';
import pg from 'pg';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

// POST /api/checkout/session
// Body: { slug: string }
// Returns: { url: string } — Stripe hosted checkout URL
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let userId;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    userId = rows[0].id;
  } catch (err) {
    console.error('[checkout/session] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }

  // Use the request origin so success/cancel URLs work on any port
  const origin = req.headers.origin || 'http://localhost:3000';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'payment',
      success_url: `${origin}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/itineraries/${slug}`,
      metadata: {
        itinerary_slug: slug,
        user_id:        userId,
        clerk_id:       clerkId,
      },
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout/session] Stripe error:', err.message);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
