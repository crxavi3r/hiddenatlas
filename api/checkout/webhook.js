// POST /api/checkout/webhook — Stripe webhook endpoint
//
// This is the ONLY file that handles Stripe webhook events.
// The Stripe Dashboard must point to: https://hiddenatlas.travel/api/checkout/webhook
//
// Critical: bodyParser MUST be disabled so getRawBody can read the raw bytes
// needed for Stripe signature verification.

import Stripe from 'stripe';
import pg from 'pg';
import { reconcileCustomRequestPayment } from '../_lib/reconcileCustomRequestPayment.js';
import { getUnlockableSlugs } from '../_lib/itineraryVariants.js';
import { sendPurchaseEmail } from '../_lib/sendPurchaseEmail.js';

export const config = { api: { bodyParser: false } };

const { Pool } = pg;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extractDiscount(session) {
  const grossAmount    = (session.amount_subtotal ?? session.amount_total) / 100;
  const discountAmount = (session.total_details?.amount_discount ?? 0) / 100;
  const first          = session.total_details?.breakdown?.discounts?.[0];
  const couponCode     = first?.discount?.coupon?.name || first?.discount?.coupon?.id || null;
  const stripeCouponId = first?.discount?.coupon?.id ?? null;
  return { grossAmount, discountAmount, couponCode, stripeCouponId };
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'DATABASE_URL']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error('[webhook] missing env vars:', missing.join(', '));
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Read raw bytes BEFORE anything else — required for signature verification
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('[webhook] failed to read raw body:', err.message);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[webhook] missing stripe-signature header');
    return res.status(400).json({ error: 'Missing stripe-signature' });
  }

  // Signature verification — ONLY place we return non-2xx after this
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] signature verification FAILED:', err.message,
      '| sig prefix:', sig?.slice(0, 20),
      '| body length:', rawBody?.length);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('[webhook] ✓ verified | type:', event.type, '| id:', event.id);

  // Only process checkout.session.completed — acknowledge all others
  if (event.type !== 'checkout.session.completed') {
    console.log('[webhook] ignoring event type:', event.type);
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  console.log('[webhook] checkout.session.completed',
    '| session.id:', session.id,
    '| payment_status:', session.payment_status,
    '| amount_total:', session.amount_total,
    '| customer_email:', session.customer_email,
    '| metadata:', JSON.stringify(session.metadata));

  // Treat 100% coupon (amount_total === 0 or no_payment_required) as paid
  const sessionPaid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required' ||
    session.amount_total === 0;

  if (!sessionPaid) {
    console.warn('[webhook] payment not completed | payment_status:', session.payment_status, '— acknowledging without processing');
    return res.status(200).json({ received: true });
  }

  const type = session.metadata?.type;
  console.log('[webhook] routing by session type:', type || '(none — premium itinerary)');

  // ── Route by session type — all errors caught, always return 200 ────────────

  if (type === 'custom_request_quote') {
    try {
      await handleQuotePayment(session);
    } catch (err) {
      console.error('[webhook] custom_request_quote unhandled error:', err.message, err.stack);
    }
    return res.status(200).json({ received: true });
  }

  if (type === 'custom_planning') {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await processCustomPayment(pool, session);
      console.log('[webhook] custom_planning processed | sessionId:', session.id);
    } catch (err) {
      console.error('[webhook] custom_planning error:', err.message, err.stack);
    } finally {
      await pool.end().catch(() => {});
    }
    return res.status(200).json({ received: true });
  }

  // ── Premium itinerary purchase ────────────────────────────────────────────
  const { itinerary_slug: slug, user_id: userId } = session.metadata || {};

  if (!slug || !userId) {
    console.warn('[webhook] no session type and missing slug/userId — acknowledging without processing',
      '| slug:', slug ?? '(missing)', '| userId:', userId ?? '(missing)');
    return res.status(200).json({ received: true });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await handlePremiumPurchase(pool, session, slug, userId);
  } catch (err) {
    console.error('[webhook] premium purchase error:', err.message, err.stack);
  } finally {
    await pool.end().catch(() => {});
  }

  return res.status(200).json({ received: true });
}

// ── custom_request_quote ──────────────────────────────────────────────────────
// Uses the shared reconcileCustomRequestPayment helper (same as Sync Payment),
// which always retrieves the Stripe session fresh with discount breakdown expanded.

async function handleQuotePayment(session) {
  const meta      = session.metadata || {};
  let requestId   = meta.customRequestId || meta.custom_request_id || null;

  console.log('[webhook/quote] START',
    '| sessionId:', session.id,
    '| payment_status:', session.payment_status,
    '| amount_total:', session.amount_total,
    '| customRequestId:', requestId || '(missing — will attempt fallback lookup)',
    '| metadata:', JSON.stringify(meta));

  // Fallback: look up CustomRequest by stripeCheckoutSessionId if metadata is missing.
  // CustomRequest.id is TEXT — never cast to uuid.
  if (!requestId) {
    const fbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await fbPool.query(
        `SELECT id::text FROM "CustomRequest"
         WHERE "stripeCheckoutSessionId" = $1::text LIMIT 1`,
        [session.id]
      );
      requestId = rows[0]?.id ?? null;
      if (requestId) {
        console.log('[webhook/quote] fallback lookup matched requestId:', requestId);
      } else {
        console.error('[webhook/quote] no matching CustomRequest for sessionId:', session.id,
          '| payment will need manual sync');
      }
    } catch (err) {
      console.error('[webhook/quote] fallback lookup DB error:', err.message);
    } finally {
      await fbPool.end().catch(() => {});
    }
  }

  if (!requestId) {
    console.error('[webhook/quote] cannot reconcile — requestId unknown for sessionId:', session.id);
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await reconcileCustomRequestPayment(pool, requestId, session.id);
    console.log('[webhook/quote] reconcile result',
      '| ok:', result.ok,
      '| synced:', result.synced,
      '| alreadyPaid:', result.alreadyPaid,
      '| amount:', result.amount,
      '| error:', result.error ?? 'none');
  } finally {
    await pool.end().catch(() => {});
  }
}

// ── custom_planning ───────────────────────────────────────────────────────────
// Reads all form data from session.metadata (no pre-existing DB records needed).
// Idempotent: fast-exits if Purchase already exists for this stripeSessionId.
// Creates: Itinerary → CustomRequest → Purchase, then notifies designer.

async function processCustomPayment(pool, session) {
  const { rows: existing } = await pool.query(
    `SELECT id FROM "Purchase" WHERE "stripeSessionId" = $1 LIMIT 1`,
    [session.id]
  );
  if (existing.length > 0) {
    console.log('[processCustomPayment] already processed — sessionId:', session.id);
    return;
  }

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
  const notes         = meta.notes || null;
  const amount        = (session.amount_total ?? 0) / 100;

  let designerUserId = null;
  if (pricingPlanId) {
    try {
      const { rows } = await pool.query(
        `SELECT "designerUserId" FROM "DesignerPricingPlan" WHERE id = $1 LIMIT 1`,
        [pricingPlanId]
      );
      designerUserId = rows[0]?.designerUserId ?? null;
    } catch { /* non-fatal */ }
  }

  const slug         = `custom-${session.id.replace(/^cs_(test_|live_)?/, '').slice(0, 40).toLowerCase()}`;
  const title        = dest ? `${dest} — Custom Journey` : 'Custom Journey';
  const subtitle     = duration || '';
  const durationDays = duration ? (parseInt((duration.match(/(\d+)/) || [])[1], 10) || null) : null;
  const styleStr     = style.length > 0 ? style.join(', ') : null;

  const initialContent = {
    hero:    { title, subtitle, tagline: dest ? `A tailor-made journey to ${dest}` : 'A tailor-made journey', coverImage: '' },
    summary: {
      shortDescription: [
        dest     ? `A custom journey to ${dest}` : null,
        dates    ? `in ${dates}` : null,
        duration ? `for ${duration}` : null,
      ].filter(Boolean).join(', ') + '.',
      whySpecial: notes || '', routeOverview: dest || '', highlights: [], included: [],
    },
    tripFacts: { groupSize: groupSize ? String(groupSize) : '', difficulty: 'Moderate', bestFor: groupType ? [groupType] : [], category: 'Custom Journey' },
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

  const { rows: existingCR } = await pool.query(
    `SELECT id FROM "CustomRequest" WHERE "itineraryId" = $1 LIMIT 1`, [itinId]
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
      [fullName, email, dest, dates, groupSize, notes,
       phone, duration, groupType, budget, JSON.stringify(style),
       userId || null, itinId, designerUserId || null]
    );
    console.log('[processCustomPayment] CustomRequest created — sessionId:', session.id);
  }

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
        [userId, itinId, session.id, session.payment_intent ?? null,
         netAmount, grossAmount, netAmount, discountAmount, couponCode, stripeCouponId,
         pricingPlanId, designerUserId]
      );
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  } else {
    console.warn('[processCustomPayment] no userId — Purchase skipped — sessionId:', session.id);
  }

  if (process.env.RESEND_API_KEY) {
    const designerSlugMeta = meta.designer_slug?.trim() || null;
    const FALLBACK_EMAIL   = 'contact@hiddenatlas.travel';
    let designerEmail = null;
    let designerName  = null;

    if (designerSlugMeta) {
      try {
        const { rows } = await pool.query(
          `SELECT c.name, u.email FROM "Creator" c
           LEFT JOIN "User" u ON u.id = c.user_id
           WHERE c.slug = $1 AND c.is_active = true LIMIT 1`,
          [designerSlugMeta]
        );
        if (rows.length && rows[0].email) {
          designerEmail = rows[0].email.trim().toLowerCase();
          designerName  = rows[0].name;
        }
      } catch (err) {
        console.warn('[processCustomPayment] designer email lookup failed:', err.message);
      }
    }

    const primaryTo  = designerEmail ?? FALLBACK_EMAIL;
    const isFallback = !designerEmail;
    const travelStyle = style.length ? style.join(', ') : '—';

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
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
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${esc(fullName)}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Email</td><td style="padding:6px 0;"><a href="mailto:${esc(email)}" style="color:#1B6B65;">${esc(email)}</a></td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Phone</td><td style="padding:6px 0;">${esc(phone) || '—'}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Destination</td><td style="padding:6px 0;font-weight:600;">${esc(dest) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Dates</td><td style="padding:6px 0;">${esc(dates) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Duration</td><td style="padding:6px 0;">${esc(duration) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Group Size</td><td style="padding:6px 0;">${groupSize || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Trip Type</td><td style="padding:6px 0;">${esc(groupType) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Travel Style</td><td style="padding:6px 0;">${esc(travelStyle)}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Budget</td><td style="padding:6px 0;">${esc(budget) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Amount Paid</td><td style="padding:6px 0;font-weight:600;color:#1B6B65;">€${amount.toFixed(2)}</td></tr>
            </table>
            ${notes ? `<hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" /><p style="color:#8C8070;font-size:13px;margin-bottom:6px;">Notes</p><p style="font-size:14px;margin:0;">${esc(notes)}</p>` : ''}
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <p><a href="https://hiddenatlas.travel/admin/custom-requests" style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">View in Backoffice →</a></p>
          </div>
        `,
      });
    } catch (err) {
      console.error('[processCustomPayment] designer notification error:', err.message);
    }
  }

  console.log('[processCustomPayment] done | sessionId:', session.id, '| itinId:', itinId, '| slug:', slug);
}

// ── Premium itinerary purchase ────────────────────────────────────────────────

async function handlePremiumPurchase(pool, session, slug, userId) {
  const unlockableSlugs = getUnlockableSlugs(slug);
  console.log('[webhook/premium] unlocking slugs:', unlockableSlugs, '| userId:', userId);

  const { grossAmount, discountAmount } = extractDiscount(session);

  for (const [idx, unlockSlug] of unlockableSlugs.entries()) {
    await pool.query(
      `INSERT INTO "Itinerary" (id, slug, title, description, price, "coverImage", "isPublished", "createdAt")
       VALUES (gen_random_uuid(), $1, $1, '', $2, '', true, NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [unlockSlug, session.amount_total / 100]
    );

    const { rows: itinRows } = await pool.query(
      `SELECT id FROM "Itinerary" WHERE slug = $1`, [unlockSlug]
    );
    const itin = itinRows[0];
    if (!itin) continue;

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
      if (insertErr.code === '23505') {
        console.log('[webhook/premium] purchase already exists (userId+itineraryId) — slug:', unlockSlug);
      } else {
        throw insertErr;
      }
    }

    if (idx === 0) {
      console.log('[webhook/premium] purchase', rowCount > 0 ? 'created' : 'already existed',
        '— slug:', unlockSlug, '| sessionId:', session.id);
    } else {
      console.log('[webhook/premium] unlock', rowCount > 0 ? 'created' : 'already existed',
        '— slug:', unlockSlug);
    }
  }

  await sendPurchaseEmail({
    to:             session.customer_email,
    itineraryTitle: session.metadata?.itinerary_title || '',
    slug,
    netAmount:      session.amount_total / 100,
    grossAmount,
    discountAmount,
  });
}
