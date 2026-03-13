import Stripe from 'stripe';
import pg from 'pg';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

// POST /api/checkout/verify
// Body: { sessionId: string }
// Called when user returns from Stripe (success_url contains ?session_id=).
// Verifies payment status and persists a Purchase record.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { sessionId } = req.body || {};
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
    // Guard: only the user who created this session can claim it
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length || users[0].id !== userId) {
      return res.status(403).json({ error: 'Session does not belong to this user' });
    }

    // Upsert Itinerary stub so the FK in Purchase is satisfied
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

    // Idempotent: ON CONFLICT covers both webhook-first and verify-first races
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
