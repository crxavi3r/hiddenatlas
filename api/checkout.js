import Stripe from 'stripe';
import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';
import { getVariantPriceId, getUnlockableSlugs } from './_lib/itineraryVariants.js';
import { sendPurchaseEmail } from './_lib/sendPurchaseEmail.js';

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

// ── Discount helpers ──────────────────────────────────────────────────────────
// Extracts discount data from a Stripe CheckoutSession.
// grossAmount  = amount_subtotal / 100 (full price before any discount)
// discountAmount = amount_discount / 100 (0 if no coupon)
// couponCode   = coupon name/id (only populated when total_details.breakdown is expanded)
// stripeCouponId = coupon.id from Stripe (same)
function extractDiscount(session) {
  const grossAmount    = (session.amount_subtotal ?? session.amount_total) / 100;
  const discountAmount = (session.total_details?.amount_discount ?? 0) / 100;
  const first          = session.total_details?.breakdown?.discounts?.[0];
  const couponCode     = first?.discount?.coupon?.name || first?.discount?.coupon?.id || null;
  const stripeCouponId = first?.discount?.coupon?.id ?? null;
  return { grossAmount, discountAmount, couponCode, stripeCouponId };
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
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { slug, variant = 'premium', title = '' } = body;
  if (!slug) return res.status(400).json({ error: 'slug is required' });

  // Resolve the correct Stripe price ID for this variant tier
  const priceId = getVariantPriceId(variant);
  if (!priceId) {
    console.error('[checkout/session] no price configured for variant:', variant);
    return res.status(500).json({ error: `Stripe price not configured for variant: ${variant}` });
  }

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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: userEmail,
      success_url: `${origin}/itineraries/${slug}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/itineraries/${slug}`,
      metadata: {
        itinerary_slug:  slug,
        itinerary_title: (title || '').slice(0, 500),
        variant:         variant,
        user_id:         userId,
        clerk_id:        clerkId,
      },
    });

    console.log('[checkout/session] session created — slug:', slug, '| variant:', variant, '| id:', session.id);
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
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['total_details.breakdown'],
    });
  } catch {
    return res.status(400).json({ error: 'Invalid session' });
  }

  // 'no_payment_required' = 100% coupon; treat as paid
  const sessionPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!sessionPaid) {
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

    // Resolve all slugs to unlock (purchased + lower tiers if applicable)
    const unlockableSlugs = getUnlockableSlugs(slug);
    console.log('[checkout/verify] unlocking slugs:', unlockableSlugs, '— userId:', userId);

    const { grossAmount, discountAmount, couponCode, stripeCouponId } = extractDiscount(session);
    let primaryPdfUrl = null;

    for (const [idx, unlockSlug] of unlockableSlugs.entries()) {
      await pool.query(
        `INSERT INTO "Itinerary" (id, slug, title, description, price, "coverImage", "isPublished", "createdAt")
         VALUES (gen_random_uuid(), $1, $1, '', $2, '', true, NOW())
         ON CONFLICT (slug) DO NOTHING`,
        [unlockSlug, session.amount_total / 100]
      );

      const { rows: itinRows } = await pool.query(
        `SELECT id, "pdfUrl" FROM "Itinerary" WHERE slug = $1`,
        [unlockSlug]
      );
      const itin = itinRows[0];
      if (!itin) continue;

      // Purchased slug uses the real sessionId; unlocked siblings use a derived key
      const stripeKey = idx === 0 ? sessionId : `${sessionId}__unlock_${idx}`;

      const netAmount = session.amount_total / 100;
      let rowCount = 0;
      try {
        const result = await pool.query(
          `INSERT INTO "Purchase"
             (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId",
              amount, "grossAmount", "netAmount", "discountAmount", "couponCode", "stripeCouponId",
              status, "purchasedAt", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'paid', NOW(), NOW())
           ON CONFLICT ("stripeSessionId") DO NOTHING`,
          [userId, itin.id, stripeKey, session.payment_intent,
           netAmount, grossAmount, netAmount, discountAmount, couponCode, stripeCouponId]
        );
        rowCount = result.rowCount;
      } catch (insertErr) {
        // 23505 = unique_violation: (userId, itineraryId) already exists — treat as DO NOTHING
        if (insertErr.code === '23505') {
          console.log('[checkout/verify] purchase already exists (userId+itineraryId) — slug:', unlockSlug);
        } else {
          throw insertErr;
        }
      }

      if (idx === 0) {
        primaryPdfUrl = itin.pdfUrl ?? null;
        console.log('[checkout/verify] purchase', rowCount > 0 ? 'created' : 'already existed', '— slug:', unlockSlug, '| sessionId:', sessionId);
      } else {
        console.log('[checkout/verify] unlock', rowCount > 0 ? 'created' : 'already existed', '— slug:', unlockSlug);
      }
    }

    return res.status(200).json({ hasAccess: true, pdfUrl: primaryPdfUrl });
  } catch (err) {
    console.error('[checkout/verify] DB error:', err.message);
    return res.status(500).json({ error: 'Verification failed' });
  } finally {
    await pool.end();
  }
}

// ── POST /api/checkout?action=custom-session ─────────────────────────────────
// Creates a Stripe Checkout Session for a fixed-price custom planning tier.
// NO DB records are created here — all form data is stored in Stripe metadata
// and records are only created after confirmed payment (see processCustomPayment).
async function handleCustomSession(req, res, body) {
  if (!process.env.STRIPE_SECRET_KEY) {
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

  // Optional auth — look up internal userId to embed in metadata
  let internalUserId = null;
  if (req.headers.authorization?.startsWith('Bearer ') && process.env.DATABASE_URL) {
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

  const origin = req.headers.origin || 'https://hiddenatlas.travel';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer_email: fd.email?.trim().toLowerCase() || undefined,
      success_url: `${origin}/my-trips?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/custom`,
      metadata: {
        // Stripe metadata limit: 50 keys, 500 chars/value
        type:         'custom_planning',
        tier_key:     tierKey,
        user_id:      internalUserId ?? '',
        full_name:    (fd.name?.trim()                          || '').slice(0, 500),
        email:        (fd.email?.trim().toLowerCase()           || '').slice(0, 500),
        phone:        (fd.phone?.trim()                         || '').slice(0, 500),
        destination:  (fd.destination?.trim()                   || '').slice(0, 500),
        dates:        (fd.dates?.trim()                         || '').slice(0, 500),
        duration:     (fd.duration?.trim()                      || '').slice(0, 100),
        group_size:   String(fd.groupSize                       || '').slice(0, 100),
        group_type:   (fd.groupType?.trim()                     || '').slice(0, 500),
        budget:       (fd.budget?.trim()                        || '').slice(0, 500),
        travel_style: (Array.isArray(fd.style) ? fd.style : []).join(',').slice(0, 500),
        notes:        (fd.notes?.trim()                         || '').slice(0, 500),
      },
    });
    console.log('[checkout/custom-session] session created — id:', session.id, '| tier:', tierKey, '| userId:', internalUserId);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[checkout/custom-session] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── Shared helper: process a completed custom planning payment ────────────────
// Reads ALL data from session.metadata — no pre-existing DB records needed.
// Idempotent: Purchase.stripeSessionId is the guard (fast-exit if already done).
// Creates: Itinerary → CustomRequest → Purchase, in that order.
// Handles 0€ checkout: payment_intent may be null, amount may be 0.
async function processCustomPayment(pool, session) {
  // ── Idempotency: bail out immediately if this session was already processed ─
  const { rows: existing } = await pool.query(
    `SELECT id FROM "Purchase" WHERE "stripeSessionId" = $1 LIMIT 1`,
    [session.id]
  );
  if (existing.length > 0) {
    console.log('[processCustomPayment] already processed — sessionId:', session.id);
    return;
  }

  // ── Extract form data from metadata ──────────────────────────────────────
  const meta      = session.metadata || {};
  const userId    = meta.user_id    || null;
  const fullName  = meta.full_name  || '';
  const email     = meta.email      || '';
  const phone     = meta.phone      || null;
  const dest      = meta.destination || null;
  const dates     = meta.dates      || null;
  const duration  = meta.duration   || null;
  const groupSize = meta.group_size ? (parseInt(meta.group_size, 10) || null) : null;
  const groupType = meta.group_type || null;
  const budget    = meta.budget     || null;
  const style     = meta.travel_style
    ? meta.travel_style.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const notes     = meta.notes      || null;
  const amount    = (session.amount_total ?? 0) / 100;

  // ── 1. Create Itinerary ──────────────────────────────────────────────────
  // Slug derived from session.id — deterministic across retries.
  const slug  = `custom-${session.id.replace(/^cs_(test_|live_)?/, '').slice(0, 40).toLowerCase()}`;
  const title = dest || 'Custom Trip';

  await pool.query(
    `INSERT INTO "Itinerary"
       (id, slug, title, description, price, "coverImage",
        type, status, "userId", "isPrivate", "isPublished", "createdAt")
     VALUES
       (gen_random_uuid(), $1, $2, '', $3, '',
        'custom', 'processing', $4, true, false, NOW())
     ON CONFLICT (slug) DO NOTHING`,
    [slug, title, amount, userId || null]
  );

  const { rows: itinRows } = await pool.query(
    `SELECT id FROM "Itinerary" WHERE slug = $1`, [slug]
  );
  const itinId = itinRows[0]?.id;
  if (!itinId) {
    console.error('[processCustomPayment] itinerary missing after insert — slug:', slug);
    return;
  }

  // ── 2. Create CustomRequest (linked to Itinerary) ────────────────────────
  // Check if a prior retry already created it for this itinerary.
  const { rows: existingCR } = await pool.query(
    `SELECT id FROM "CustomRequest" WHERE "itineraryId" = $1 LIMIT 1`,
    [itinId]
  );
  if (existingCR.length === 0) {
    await pool.query(
      `INSERT INTO "CustomRequest"
         (id, "fullName", email, destination, dates, "groupSize", notes,
          phone, duration, "groupType", budget, style,
          status, "userId", "itineraryId", "createdAt")
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          'open', $12, $13, NOW())`,
      [
        fullName, email, dest, dates, groupSize, notes,
        phone, duration, groupType, budget, JSON.stringify(style),
        userId || null, itinId,
      ]
    );
    console.log('[processCustomPayment] CustomRequest created — sessionId:', session.id);
  }

  // ── 3. Create Purchase ───────────────────────────────────────────────────
  if (userId) {
    const { grossAmount, discountAmount, couponCode, stripeCouponId } = extractDiscount(session);
    const netAmount = amount;
    try {
      await pool.query(
        `INSERT INTO "Purchase"
           (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId",
            amount, "grossAmount", "netAmount", "discountAmount", "couponCode", "stripeCouponId",
            status, "purchasedAt", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'paid', NOW(), NOW())
         ON CONFLICT ("stripeSessionId") DO NOTHING`,
        [
          userId, itinId, session.id, session.payment_intent ?? null,
          netAmount, grossAmount, netAmount, discountAmount, couponCode, stripeCouponId,
        ]
      );
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  } else {
    console.warn('[processCustomPayment] no userId in metadata — Purchase skipped — sessionId:', session.id);
  }

  console.log('[processCustomPayment] done — sessionId:', session.id, '| itinId:', itinId, '| slug:', slug);
}

// ── POST /api/checkout?action=custom-verify ───────────────────────────────────
// Called client-side after Stripe redirects to /my-trips?session_id=...
// No auth required — Stripe session ID is the credential.
// Creates Itinerary + links CustomRequest + creates Purchase. Idempotent.
async function handleCustomVerify(req, res, body) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { sessionId } = body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['total_details.breakdown'],
    });
  } catch {
    return res.status(400).json({ error: 'Invalid session', success: false });
  }

  const sessionPaid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required';
  if (!sessionPaid) {
    return res.status(400).json({ error: 'Payment not completed', success: false });
  }

  if (session.metadata?.type !== 'custom_planning') {
    return res.status(400).json({ error: 'Not a custom planning session', success: false });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await processCustomPayment(pool, session);
    console.log('[checkout/custom-verify] done — sessionId:', sessionId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[checkout/custom-verify] error:', err.message);
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

  // 'no_payment_required' = 100% coupon; treat as completed
  const sessionPaid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!sessionPaid) {
    console.log('[checkout/webhook] payment not completed (status:', session.payment_status, ') — skipping');
    return res.status(200).json({ received: true });
  }

  // ── Route by session type ─────────────────────────────────────────────────
  if (session.metadata?.type === 'custom_planning') {
    console.log('[checkout/webhook] custom_planning payment — sessionId:', session.id);
    const wpPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await processCustomPayment(wpPool, session);
      console.log('[checkout/webhook] custom_planning processed — sessionId:', session.id);
    } catch (err) {
      console.error('[checkout/webhook] custom_planning DB error:', err.message);
    } finally {
      await wpPool.end();
    }
    return res.status(200).json({ received: true });
  }

  const { itinerary_slug: slug, user_id: userId } = session.metadata || {};
  console.log('[checkout/webhook] metadata — slug:', slug, '| userId:', userId);

  if (!slug || !userId) {
    console.warn('[checkout/webhook] missing metadata — skipping');
    return res.status(200).json({ received: true });
  }

  // Resolve all slugs to unlock (purchased + lower tiers if applicable)
  const unlockableSlugs = getUnlockableSlugs(slug);
  console.log('[checkout/webhook] unlocking slugs:', unlockableSlugs, '— userId:', userId);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { grossAmount, discountAmount } = extractDiscount(session);
    // Coupon code/id not available from webhook without extra API call — stored as null;
    // handleVerify (called client-side on success) persists the full coupon details.

    for (const [idx, unlockSlug] of unlockableSlugs.entries()) {
      await pool.query(
        `INSERT INTO "Itinerary" (id, slug, title, description, price, "coverImage", "isPublished", "createdAt")
         VALUES (gen_random_uuid(), $1, $1, '', $2, '', true, NOW())
         ON CONFLICT (slug) DO NOTHING`,
        [unlockSlug, session.amount_total / 100]
      );

      const { rows: itinRows } = await pool.query(
        `SELECT id FROM "Itinerary" WHERE slug = $1`,
        [unlockSlug]
      );
      const itin = itinRows[0];
      if (!itin) continue;

      // Purchased slug uses the real sessionId; unlocked siblings use a derived key
      const stripeKey = idx === 0 ? session.id : `${session.id}__unlock_${idx}`;

      const netAmount = session.amount_total / 100;
      let rowCount = 0;
      try {
        const result = await pool.query(
          `INSERT INTO "Purchase"
             (id, "userId", "itineraryId", "stripeSessionId", "stripePaymentIntentId",
              amount, "grossAmount", "netAmount", "discountAmount",
              status, "purchasedAt", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'paid', NOW(), NOW())
           ON CONFLICT ("stripeSessionId") DO NOTHING`,
          [userId, itin.id, stripeKey, session.payment_intent,
           netAmount, grossAmount, netAmount, discountAmount]
        );
        rowCount = result.rowCount;
      } catch (insertErr) {
        // 23505 = unique_violation: (userId, itineraryId) already exists — treat as DO NOTHING
        if (insertErr.code === '23505') {
          console.log('[checkout/webhook] purchase already exists (userId+itineraryId) — slug:', unlockSlug);
        } else {
          throw insertErr;
        }
      }

      if (idx === 0) {
        console.log('[checkout/webhook] purchase', rowCount > 0 ? 'created' : 'already existed', '— slug:', unlockSlug, '| sessionId:', session.id);
      } else {
        console.log('[checkout/webhook] unlock', rowCount > 0 ? 'created' : 'already existed', '— slug:', unlockSlug);
      }
    }

    // ── Purchase confirmation email ───────────────────────────────────────────
    await sendPurchaseEmail({
      to:             session.customer_email,
      itineraryTitle: session.metadata?.itinerary_title || '',
      slug,
      netAmount:      session.amount_total / 100,
      grossAmount,
      discountAmount,
    });
    // ─────────────────────────────────────────────────────────────────────────

  } catch (err) {
    console.error('[checkout/webhook] DB error:', err.message);
    // Return 200 so Stripe does not retry — /verify is the client-facing fallback
  } finally {
    await pool.end();
  }

  return res.status(200).json({ received: true });
}
