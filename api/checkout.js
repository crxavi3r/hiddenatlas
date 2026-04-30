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

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let userId, userEmail, resolvedPriceId;
  try {
    const { rows: userRow } = await pool.query(
      `SELECT id, email FROM "User" WHERE "clerkId" = $1`, [clerkId]
    );
    if (!userRow.length) return res.status(404).json({ error: 'User not found' });
    userId    = userRow[0].id;
    userEmail = userRow[0].email;

    // Try to resolve price from designer pricing plan attached to the itinerary
    // Falls back gracefully if DesignerPricingPlan table or column doesn't exist yet
    let planPriceId = null;
    try {
      const { rows: itinRow } = await pool.query(
        `SELECT p."stripePriceId" AS plan_price_id
         FROM "Itinerary" i
         LEFT JOIN "DesignerPricingPlan" p ON p.id = i."pricingPlanId" AND p."isActive" = true
         WHERE i.slug = $1 LIMIT 1`,
        [slug]
      );
      planPriceId = itinRow[0]?.plan_price_id ?? null;
    } catch { /* table/column not yet migrated — use env-var fallback */ }

    resolvedPriceId = planPriceId || getVariantPriceId(variant);
  } catch (err) {
    console.error('[checkout/session] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }

  if (!resolvedPriceId) {
    console.error('[checkout/session] no price configured — slug:', slug, '| variant:', variant);
    return res.status(500).json({ error: `Stripe price not configured for variant: ${variant}` });
  }
  const priceId = resolvedPriceId;

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

  const { tierKey, pricingPlanId, formData: fd, designerSlug } = body;
  if (!fd) return res.status(400).json({ error: 'formData is required' });
  if (!tierKey && !pricingPlanId) return res.status(400).json({ error: 'tierKey or pricingPlanId is required' });

  let priceId = null;
  let resolvedPlanId = pricingPlanId || null;

  // Prefer designer pricing plan when provided
  if (pricingPlanId && process.env.DATABASE_URL) {
    const planPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await planPool.query(
        `SELECT "stripePriceId" FROM "DesignerPricingPlan"
         WHERE id = $1 AND "isActive" = true AND "isCustomQuote" = false
         LIMIT 1`,
        [pricingPlanId]
      );
      priceId = rows[0]?.stripePriceId ?? null;
    } catch (err) {
      console.warn('[checkout/custom-session] designer plan lookup failed:', err.message);
    } finally {
      await planPool.end().catch(() => {});
    }
  }

  // Fallback to global tier price IDs from env
  if (!priceId && tierKey) {
    const PRICE_ID_MAP = {
      couple:      process.env.STRIPE_CUSTOM_COUPLE_PRICE_ID,
      small_group: process.env.STRIPE_CUSTOM_SMALL_GROUP_PRICE_ID,
      large_group: process.env.STRIPE_CUSTOM_LARGE_GROUP_PRICE_ID,
    };
    priceId = PRICE_ID_MAP[tierKey] ?? null;
  }

  if (!priceId) {
    return res.status(400).json({ error: 'Stripe price not configured for this plan' });
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
        type:             'custom_planning',
        tier_key:         tierKey ?? '',
        pricing_plan_id:  resolvedPlanId ?? '',
        user_id:          internalUserId ?? '',
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
        designer_slug: (designerSlug?.trim()                   || '').slice(0, 100),
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
  const meta          = session.metadata || {};
  const userId        = meta.user_id    || null;
  const pricingPlanId = meta.pricing_plan_id || null;
  const fullName      = meta.full_name  || '';
  const email         = meta.email      || '';
  const phone         = meta.phone      || null;
  const dest          = meta.destination || null;
  const dates         = meta.dates      || null;
  const duration      = meta.duration   || null;
  const groupSize     = meta.group_size ? (parseInt(meta.group_size, 10) || null) : null;
  const groupType     = meta.group_type || null;
  const budget        = meta.budget     || null;
  const style         = meta.travel_style
    ? meta.travel_style.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Resolve designer's User.id from pricingPlan (for denormalized designerUserId on Purchase)
  let designerUserId = null;
  if (pricingPlanId) {
    try {
      const { rows: planRows } = await pool.query(
        `SELECT "designerUserId" FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`,
        [pricingPlanId]
      );
      designerUserId = planRows[0]?.designerUserId ?? null;
    } catch { /* non-fatal */ }
  }
  const notes     = meta.notes      || null;
  const amount    = (session.amount_total ?? 0) / 100;

  // ── 1. Create Itinerary ──────────────────────────────────────────────────
  // Slug derived from session.id — deterministic across retries.
  const slug  = `custom-${session.id.replace(/^cs_(test_|live_)?/, '').slice(0, 40).toLowerCase()}`;
  const title = dest ? `${dest} — Custom Journey` : 'Custom Journey';
  const subtitle = duration || '';
  const durationDays = duration ? (parseInt((duration.match(/(\d+)/) || [])[1], 10) || null) : null;
  const styleStr = style.length > 0 ? style.join(', ') : null;

  // Build a rich initial content document from the request metadata
  const initialContent = {
    hero: {
      title,
      subtitle,
      tagline: dest ? `A tailor-made journey to ${dest}` : 'A tailor-made journey',
      coverImage: '',
    },
    summary: {
      shortDescription: [
        dest ? `A custom journey to ${dest}` : null,
        dates ? `in ${dates}` : null,
        duration ? `for ${duration}` : null,
      ].filter(Boolean).join(', ') + '.',
      whySpecial: notes || '',
      routeOverview: dest || '',
      highlights: [],
      included: [],
    },
    tripFacts: {
      groupSize: groupSize ? String(groupSize) : '',
      difficulty: 'Moderate',
      bestFor: groupType ? [groupType] : [],
      category: 'Custom Journey',
    },
    days: [],
    sections: {
      hotels: [],
      practicalNotes: [
        budget    ? `Budget: ${budget}` : null,
        styleStr  ? `Travel style: ${styleStr}` : null,
        groupType ? `Group type: ${groupType}` : null,
        notes     ? `Notes: ${notes}` : null,
      ].filter(Boolean).join('\n'),
      faq: [],
    },
    pdfConfig: { showRouteMap: true, showHotels: true },
    seo: { metaTitle: title, metaDescription: '' },
  };

  await pool.query(
    `INSERT INTO "Itinerary"
       (id, slug, title, subtitle, destination, description, price,
        "durationDays", "coverImage", content,
        type, status, "userId", "isPrivate", "isPublished", "createdAt")
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
        $7, '', $8::jsonb,
        'custom', 'processing', $9, true, false, NOW())
     ON CONFLICT (slug) DO NOTHING`,
    [slug, title, subtitle, dest || '', initialContent.summary.shortDescription, amount,
     durationDays, JSON.stringify(initialContent), userId || null]
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
          status, "userId", "itineraryId", "designerId", "createdAt")
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          'open', $12, $13, $14, NOW())`,
      [
        fullName, email, dest, dates, groupSize, notes,
        phone, duration, groupType, budget, JSON.stringify(style),
        userId || null, itinId, designerUserId || null,
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
            "pricingPlanId", "designerUserId",
            status, "purchasedAt", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'paid', NOW(), NOW())
         ON CONFLICT ("stripeSessionId") DO NOTHING`,
        [
          userId, itinId, session.id, session.payment_intent ?? null,
          netAmount, grossAmount, netAmount, discountAmount, couponCode, stripeCouponId,
          pricingPlanId, designerUserId,
        ]
      );
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  } else {
    console.warn('[processCustomPayment] no userId in metadata — Purchase skipped — sessionId:', session.id);
  }

  // ── 4. Designer notification email ──────────────────────────────────────────
  // Resolve designer from DB using slug stored in metadata (never trust client data).
  if (process.env.RESEND_API_KEY && process.env.DATABASE_URL) {
    const designerSlugMeta = meta.designer_slug?.trim() || null;
    const FALLBACK_EMAIL = 'contact@hiddenatlas.travel';
    let designerEmail = null;
    let designerName  = null;

    if (designerSlugMeta) {
      try {
        const { rows: creatorRows } = await pool.query(
          `SELECT c.name, u.email
           FROM "Creator" c
           LEFT JOIN "User" u ON u.id = c.user_id
           WHERE c.slug = $1 AND c.is_active = true
           LIMIT 1`,
          [designerSlugMeta]
        );
        if (creatorRows.length && creatorRows[0].email) {
          designerEmail = creatorRows[0].email.trim().toLowerCase();
          designerName  = creatorRows[0].name;
        }
      } catch (err) {
        console.warn('[processCustomPayment] designer email lookup failed:', err.message);
      }
    }

    const primaryTo   = designerEmail ?? FALLBACK_EMAIL;
    const isFallback  = !designerEmail;
    const travelStyle = style.length ? style.join(', ') : '—';

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const emailPayload = {
        from:    process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>',
        replyTo: [email.trim().toLowerCase()],
        to:      [primaryTo],
        subject: designerName
          ? `New custom trip request for ${designerName} (paid)`
          : `New Custom Journey Request (paid) – ${dest || 'New Inquiry'}`,
        ...(isFallback ? {} : { bcc: [FALLBACK_EMAIL] }),
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;margin-bottom:4px;">${designerName ? `New paid trip request for ${designerName}` : 'New Custom Journey Request'}</h2>
            <p style="color:#8C8070;font-size:13px;margin-top:0;">Paid via Stripe · ${isFallback ? 'No designer selected' : `Designer: ${designerName}`}</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${fullName}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#1B6B65;">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Phone</td><td style="padding:6px 0;">${phone || '—'}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Destination</td><td style="padding:6px 0;font-weight:600;">${dest || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Dates</td><td style="padding:6px 0;">${dates || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Duration</td><td style="padding:6px 0;">${duration || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Group Size</td><td style="padding:6px 0;">${groupSize || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Trip Type</td><td style="padding:6px 0;">${groupType || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Travel Style</td><td style="padding:6px 0;">${travelStyle}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Budget</td><td style="padding:6px 0;">${budget || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Amount Paid</td><td style="padding:6px 0;font-weight:600;color:#1B6B65;">€${amount.toFixed(2)}</td></tr>
            </table>
            ${notes ? `<hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" /><p style="color:#8C8070;font-size:13px;margin-bottom:6px;">Notes</p><p style="font-size:14px;margin:0;">${notes}</p>` : ''}
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <p><a href="https://hiddenatlas.travel/admin/custom-requests" style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">View in Backoffice →</a></p>
          </div>
        `,
      };
      const result = await resend.emails.send(emailPayload);
      if (result.error) {
        console.error('[processCustomPayment] designer notification error:', JSON.stringify(result.error));
      } else {
        console.log('[processCustomPayment] designer notification sent — to:', primaryTo, '| Resend id:', result.data?.id);
      }
    } catch (err) {
      console.error('[processCustomPayment] designer notification exception:', err.message);
    }
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

// ── HTML escape helper ────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Shared: mark a CustomRequest as paid from a Stripe session ────────────────
// Used by processQuotePayment (webhook).
// Returns the updated CustomRequest row (with designer info), or null if not
// found / already paid.
// NOTE: paidAt and quoteAcceptedAt use separate parameters ($1/$2) with
// explicit ::timestamptz casts to avoid PostgreSQL "inconsistent types deduced
// for parameter $N" when the two columns have different timestamp type variants.
async function markQuotePaid(pool, requestId, session) {
  const nowISO = new Date().toISOString();
  // Step 1: atomic UPDATE — only fires when paidAt IS NULL (idempotency guard)
  const result = await pool.query(
    `UPDATE "CustomRequest"
     SET "paidAt"                  = $1::timestamptz,
         "quoteAcceptedAt"         = $2::timestamptz,
         "stripeCheckoutSessionId" = $3::text,
         status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END
     WHERE id = $4::uuid AND "paidAt" IS NULL
     RETURNING id, "fullName", email, destination, "designerId"`,
    [nowISO, nowISO, session.id, requestId]
  );
  if (!result.rows[0]) return null;
  const row = { ...result.rows[0] };

  // Step 2: fetch designer contact separately (avoids correlated-subquery
  // ambiguity in RETURNING when designerId/id column names overlap)
  if (row.designerId) {
    try {
      const { rows: dRows } = await pool.query(
        `SELECT email AS "designerEmail", name AS "designerName"
         FROM "User" WHERE id = $1::uuid LIMIT 1`,
        [row.designerId]
      );
      if (dRows[0]) {
        row.designerEmail = dRows[0].designerEmail;
        row.designerName  = dRows[0].designerName;
      }
    } catch { /* non-fatal — emails will use fallback address */ }
  }
  return row;
}

// ── Process a completed quote payment (custom_request_quote) ──────────────────
// Idempotent: guards on CustomRequest.paidAt IS NULL in the UPDATE.
async function processQuotePayment(pool, session) {
  const meta = session.metadata || {};
  // Support both camelCase (new) and snake_case (legacy sessions in flight)
  let requestId = meta.customRequestId || meta.custom_request_id || null;

  console.log('[processQuotePayment] START',
    '| sessionId:', session.id,
    '| payment_status:', session.payment_status,
    '| amount_total:', session.amount_total,
    '| metadata:', JSON.stringify(meta));

  // Fallback: if metadata is missing, look up by the session ID stored on the record
  if (!requestId) {
    console.warn('[processQuotePayment] customRequestId missing from metadata — attempting lookup by stripeCheckoutSessionId');
    const { rows: fallback } = await pool.query(
      `SELECT id::text FROM "CustomRequest" WHERE "stripeCheckoutSessionId" = $1::text LIMIT 1`,
      [session.id]
    );
    requestId = fallback[0]?.id ?? null;
    if (requestId) {
      console.log('[processQuotePayment] fallback lookup matched requestId:', requestId);
    } else {
      console.error('[processQuotePayment] no matching CustomRequest found for sessionId:', session.id);
      return;
    }
  }

  // amount_total === 0 means 100% coupon — still treat as paid
  const amount    = (session.amount_total ?? 0) / 100;
  const amountFmt = `€${amount.toFixed(2)}`;

  const cr = await markQuotePaid(pool, requestId, session);
  if (!cr) {
    // Either not found or already paid (UPDATE WHERE paidAt IS NULL returned 0 rows)
    const { rows } = await pool.query(`SELECT id::text, "paidAt" FROM "CustomRequest" WHERE id = $1::uuid`, [requestId]);
    if (rows[0]?.paidAt) {
      console.log('[processQuotePayment] already paid — requestId:', requestId);
    } else {
      console.error('[processQuotePayment] CustomRequest not found — id:', requestId, '| sessionId:', session.id);
    }
    return;
  }

  console.log('[processQuotePayment] marked paid — requestId:', requestId,
    '| sessionId:', session.id,
    '| amount:', amount);

  const dest      = cr.destination || 'your destination';

  // Emails — non-fatal
  if (!process.env.RESEND_API_KEY) return;
  const { Resend } = await import('resend');
  const resend   = new Resend(process.env.RESEND_API_KEY);
  const FROM     = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
  const FALLBACK = 'contact@hiddenatlas.travel';
  const firstName = cr.fullName?.split(' ')[0] ?? 'there';
  const senderLabel = cr.designerName ?? 'The HiddenAtlas Team';

  // Notify designer/admin
  try {
    const designerTo = cr.designerEmail ?? FALLBACK;
    await resend.emails.send({
      from:    FROM,
      replyTo: cr.email,
      to:      designerTo,
      ...(cr.designerEmail ? { bcc: [FALLBACK] } : {}),
      subject: `Quote accepted — ${cr.fullName} paid ${amountFmt}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
          <h2 style="color:#1B6B65;">Quote accepted — payment received</h2>
          <p style="font-size:14px;color:#8C8070;">${esc(cr.fullName)} has paid the custom trip planning quote.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
            <tr><td style="padding:6px 0;color:#8C8070;width:120px;">Client</td><td style="padding:6px 0;font-weight:600;">${esc(cr.fullName)}</td></tr>
            <tr><td style="padding:6px 0;color:#8C8070;">Email</td><td style="padding:6px 0;"><a href="mailto:${esc(cr.email)}" style="color:#1B6B65;">${esc(cr.email)}</a></td></tr>
            <tr><td style="padding:6px 0;color:#8C8070;">Destination</td><td style="padding:6px 0;">${esc(dest)}</td></tr>
            <tr><td style="padding:6px 0;color:#8C8070;">Amount paid</td><td style="padding:6px 0;font-weight:700;color:#1B6B65;">${amountFmt}</td></tr>
          </table>
          <p><a href="https://hiddenatlas.travel/admin/custom-requests" style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">Open in Backoffice →</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[processQuotePayment] designer notification error:', err.message);
  }

  // Confirm to client
  try {
    await resend.emails.send({
      from:    FROM,
      replyTo: cr.designerEmail ?? FALLBACK,
      to:      cr.email,
      subject: `Payment confirmed — your HiddenAtlas journey to ${dest}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
          <h2 style="color:#1B6B65;">Hi ${esc(firstName)},</h2>
          <p style="font-size:15px;line-height:1.7;">Your payment of <strong>${amountFmt}</strong> has been received. ${cr.designerName ? esc(cr.designerName) : 'Your travel designer'} will now start building your bespoke itinerary for <strong>${esc(dest)}</strong>.</p>
          <p style="font-size:15px;line-height:1.7;">You'll receive your itinerary once it's ready. If you have any questions in the meantime, just reply to this email.</p>
          <p style="font-size:14px;color:#8C8070;margin-top:24px;">— ${esc(senderLabel)}, HiddenAtlas</p>
          <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
          <p style="color:#B5AA99;font-size:11px;">You are receiving this because you purchased a custom trip planning service on hiddenatlas.travel.</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[processQuotePayment] client confirmation error:', err.message);
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

  // Log every event — essential for diagnosing missed webhooks in production
  console.log('[checkout/webhook] event received — type:', event.type, '| id:', event.id);

  if (event.type !== 'checkout.session.completed') {
    console.log('[checkout/webhook] ignoring event type:', event.type);
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  console.log('[checkout/webhook] checkout.session.completed',
    '| session.id:', session.id,
    '| payment_status:', session.payment_status,
    '| amount_total:', session.amount_total,
    '| customer_email:', session.customer_email,
    '| metadata:', JSON.stringify(session.metadata));

  // paid OR no_payment_required (100% coupon) OR amount_total === 0 → all treated as paid
  const sessionPaid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required' ||
    session.amount_total === 0;
  if (!sessionPaid) {
    console.warn('[checkout/webhook] payment not completed — payment_status:', session.payment_status, '— skipping');
    return res.status(200).json({ received: true });
  }

  // ── Route by session type ─────────────────────────────────────────────────
  if (session.metadata?.type === 'custom_request_quote') {
    console.log('[checkout/webhook] routing → processQuotePayment',
      '| sessionId:', session.id,
      '| customRequestId:', session.metadata?.customRequestId || session.metadata?.custom_request_id || '(missing)');
    const wpPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await processQuotePayment(wpPool, session);
      console.log('[checkout/webhook] custom_request_quote processed — sessionId:', session.id);
    } catch (err) {
      console.error('[checkout/webhook] custom_request_quote DB error:', err.message);
    } finally {
      await wpPool.end();
    }
    return res.status(200).json({ received: true });
  }

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
