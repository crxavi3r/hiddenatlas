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
  if (action === 'session')        return handleSession(req, res, body);
  if (action === 'verify')         return handleVerify(req, res, body);
  if (action === 'custom-session') return handleCustomSession(req, res, body);
  if (action === 'custom-verify')  return handleCustomVerify(req, res, body);

  return res.status(400).json({ error: 'Unknown checkout action' });
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
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: userEmail,
      success_url: `${origin}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/itineraries/${slug}`,
      metadata: {
        itinerary_slug: slug,
        user_id:        userId,
        clerk_id:       clerkId,
      },
    };

    console.log('[checkout/session] creating session — slug:', slug);

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log('[checkout/session] session created — id:', session.id);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout/session] Stripe error:', err);
    return res.status(500).json({ error: err.message });
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

    const { rowCount } = await pool.query(
      `INSERT INTO "Purchase" (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId", amount, status, "purchasedAt", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'paid', NOW(), NOW())
       ON CONFLICT ("stripeSessionId") DO NOTHING`,
      [userId, itinerary.id, sessionId, session.payment_intent, session.amount_total / 100]
    );
    console.log('[checkout/verify] purchase', rowCount > 0 ? 'created' : 'already existed', '— userId:', userId, '| slug:', slug, '| sessionId:', sessionId);

    return res.status(200).json({ hasAccess: true, pdfUrl: itinerary.pdfUrl ?? null });
  } catch (err) {
    console.error('[checkout/verify] DB error:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  } finally {
    await pool.end();
  }
}

// ── POST /api/checkout?action=custom-session ─────────────────────────────────
// Creates a Stripe Checkout Session for a fixed-price custom planning tier.
// Saves the CustomRequest to DB first so it exists before the user leaves the site.
async function handleCustomSession(req, res, body) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { tierKey, formData: fd } = body;
  if (!tierKey || !fd) return res.status(400).json({ error: 'tierKey and formData are required' });

  const PRICE_ID_MAP = {
    couple:      process.env.STRIPE_CUSTOM_COUPLE_PRICE_ID,
    small_group: process.env.STRIPE_CUSTOM_SMALL_GROUP_PRICE_ID,
    large_group: process.env.STRIPE_CUSTOM_LARGE_GROUP_PRICE_ID,
  };
  const priceId = PRICE_ID_MAP[tierKey];
  if (!priceId) {
    return res.status(400).json({ error: `Stripe price not configured for tier: ${tierKey}` });
  }

  // Optional auth — look up internal userId if a JWT is present
  let internalUserId = null;
  if (req.headers.authorization?.startsWith('Bearer ')) {
    try {
      const clerkId = await verifyAuth(req.headers.authorization);
      const authPool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        const { rows } = await authPool.query(
          `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
        );
        internalUserId = rows[0]?.id ?? null;
      } finally {
        await authPool.end().catch(() => {});
      }
    } catch { /* anonymous — continue */ }
  }

  // Save CustomRequest with status='pending_payment' before redirecting to Stripe
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let requestId = null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO "CustomRequest"
         (id, "fullName", email, destination, dates, "groupSize", notes, status, "createdAt")
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending_payment', NOW())
       RETURNING id`,
      [
        fd.name?.trim()        || '',
        fd.email?.trim().toLowerCase() || '',
        fd.destination?.trim() || null,
        fd.dates?.trim()       || null,
        fd.groupSize ? parseInt(fd.groupSize, 10) : null, // '1-2' → 1, '3-8' → 3, etc.
        fd.notes?.trim()       || null,
      ]
    );
    requestId = rows[0]?.id ?? null;
    console.log('[checkout/custom-session] CustomRequest created — id:', requestId, '| tier:', tierKey);
  } catch (err) {
    // Fallback: try without status column (migration may be pending)
    try {
      const { rows } = await pool.query(
        `INSERT INTO "CustomRequest" (id, "fullName", email, destination, dates, "groupSize", notes, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          fd.name?.trim()        || '',
          fd.email?.trim().toLowerCase() || '',
          fd.destination?.trim() || null,
          fd.dates?.trim()       || null,
          fd.groupSize ? parseInt(fd.groupSize, 10) : null,
          fd.notes?.trim()       || null,
        ]
      );
      requestId = rows[0]?.id ?? null;
      console.log('[checkout/custom-session] CustomRequest created (fallback) — id:', requestId);
    } catch (fbErr) {
      console.error('[checkout/custom-session] DB insert failed:', fbErr.message);
      await pool.end();
      return res.status(500).json({ error: 'Failed to save request. Please try again.' });
    }
  }

  // Best-effort: save extended fields (phone, duration, groupType, budget, style, userId)
  if (requestId) {
    pool.query(
      `UPDATE "CustomRequest"
       SET phone=$1, duration=$2, "groupType"=$3, budget=$4, style=$5, "userId"=$6
       WHERE id=$7`,
      [
        fd.phone?.trim()     || null,
        fd.duration?.trim()  || null,
        fd.groupType?.trim() || null,
        fd.budget?.trim()    || null,
        JSON.stringify(Array.isArray(fd.style) ? fd.style : []),
        internalUserId,
        requestId,
      ]
    ).catch(err => console.warn('[checkout/custom-session] Extended UPDATE skipped:', err.message));
  }

  await pool.end();

  // Create Stripe Checkout Session
  const origin = req.headers.origin || 'https://hiddenatlas.travel';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: fd.email?.trim().toLowerCase() || undefined,
      success_url: `${origin}/custom?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/custom`,
      metadata: {
        type:              'custom_planning',
        custom_request_id: requestId ?? '',
        tier_key:          tierKey,
      },
    });
    console.log('[checkout/custom-session] Stripe session created — id:', session.id, '| requestId:', requestId);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout/custom-session] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── POST /api/checkout?action=custom-verify ───────────────────────────────────
// Called client-side after Stripe redirects back on success.
// Confirms payment and updates CustomRequest status to 'paid'.
async function handleCustomVerify(req, res, body) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { sessionId } = body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return res.status(400).json({ error: 'Invalid session', success: false });
  }

  if (session.payment_status !== 'paid') {
    return res.status(400).json({ error: 'Payment not completed', success: false });
  }

  const { custom_request_id: requestId } = session.metadata || {};
  if (!requestId) {
    return res.status(400).json({ error: 'Session not linked to a custom request', success: false });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Update status to 'paid' — idempotent (only if still pending_payment or open)
    await pool.query(
      `UPDATE "CustomRequest" SET status='paid' WHERE id=$1 AND status IN ('pending_payment','open')`,
      [requestId]
    );
    // Best-effort: set paidAt and stripeSessionId columns (added by migration)
    pool.query(
      `UPDATE "CustomRequest" SET "paidAt"=NOW(), "stripeSessionId"=$1 WHERE id=$2`,
      [sessionId, requestId]
    ).catch(() => {}); // columns may not exist yet — non-fatal
    console.log('[checkout/custom-verify] CustomRequest marked paid — id:', requestId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[checkout/custom-verify] DB error:', err.message);
    return res.status(500).json({ error: 'Verification failed', success: false });
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

  console.log('[checkout/webhook] event received — type:', event.type, '| id:', event.id);

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  console.log('[checkout/webhook] session.id:', session.id, '| payment_status:', session.payment_status, '| customer_email:', session.customer_email);

  if (session.payment_status !== 'paid') {
    console.log('[checkout/webhook] payment not paid — skipping');
    return res.status(200).json({ received: true });
  }

  // ── Route by session type ─────────────────────────────────────────────────
  if (session.metadata?.type === 'custom_planning') {
    const requestId = session.metadata?.custom_request_id;
    console.log('[checkout/webhook] custom_planning payment — requestId:', requestId);
    if (requestId) {
      const wpPool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        await wpPool.query(
          `UPDATE "CustomRequest" SET status='paid' WHERE id=$1 AND status IN ('pending_payment','open')`,
          [requestId]
        );
        wpPool.query(
          `UPDATE "CustomRequest" SET "paidAt"=NOW(), "stripeSessionId"=$1 WHERE id=$2`,
          [session.id, requestId]
        ).catch(() => {});
        console.log('[checkout/webhook] CustomRequest marked paid — id:', requestId);
      } catch (err) {
        console.error('[checkout/webhook] custom_planning DB error:', err.message);
      } finally {
        await wpPool.end();
      }
    }
    return res.status(200).json({ received: true });
  }

  const { itinerary_slug: slug, user_id: userId } = session.metadata || {};
  console.log('[checkout/webhook] metadata — slug:', slug, '| userId:', userId);

  if (!slug || !userId) {
    console.warn('[checkout/webhook] missing metadata — skipping');
    return res.status(200).json({ received: true });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Idempotency: skip if this Stripe session was already processed
    const { rows: existing } = await pool.query(
      `SELECT id FROM "Purchase" WHERE "stripeSessionId" = $1`,
      [session.id]
    );
    if (existing.length) {
      console.log('[checkout/webhook] purchase already exists for session:', session.id, '— skipping');
      return res.status(200).json({ received: true });
    }

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

    console.log('[checkout/webhook] purchase created — userId:', userId, '| slug:', slug, '| sessionId:', session.id);

    // ── Email hook point ─────────────────────────────────────────────────────
    // Stripe receipt is already sent automatically via the Dashboard.
    // When a HiddenAtlas confirmation email is needed, call it here:
    // await sendPurchaseConfirmationEmail({
    //   email:  session.customer_email,
    //   slug,
    //   amount: session.amount_total / 100,
    // });
    // ─────────────────────────────────────────────────────────────────────────

  } catch (err) {
    console.error('[checkout/webhook] DB error:', err.message);
    // Return 200 so Stripe does not retry — /verify is the client-facing fallback
  } finally {
    await pool.end();
  }

  return res.status(200).json({ received: true });
}
