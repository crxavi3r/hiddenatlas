import Stripe from 'stripe';

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Single source of truth for marking a CustomRequest quote as paid.
 * Called by both the Stripe webhook (checkout.js) and the manual
 * "Sync payment" action (admin.js) so both paths behave identically.
 *
 * Always retrieves the Stripe session FRESH (with discount breakdown expanded)
 * so discount amounts are accurate regardless of what the caller has in hand.
 *
 * Idempotent:
 *   - CustomRequest UPDATE guards on WHERE "paidAt" IS NULL
 *   - Purchase INSERT uses ON CONFLICT ("stripeSessionId") DO NOTHING
 *
 * @param {pg.Pool} pool
 * @param {string}  customRequestId  — CustomRequest.id (TEXT)
 * @param {string}  stripeSessionId  — Stripe checkout session ID
 * @returns {{ ok, paid, alreadyPaid, synced, amount, requestId, sessionId, error? }}
 */
export async function reconcileCustomRequestPayment(pool, customRequestId, stripeSessionId) {
  console.log('[reconcile] START customRequestId:', customRequestId, '| stripeSessionId:', stripeSessionId);

  if (!customRequestId || !stripeSessionId) {
    console.error('[reconcile] missing customRequestId or stripeSessionId');
    return { ok: false, error: 'missing arguments' };
  }

  // 1. Fetch CustomRequest — id is TEXT, no ::uuid cast
  let cr;
  try {
    const { rows } = await pool.query(
      `SELECT id, "paidAt", "userId", "itineraryId", "quoteAmount", "designerId",
              "fullName", email, destination, "stripeCheckoutSessionId"
       FROM "CustomRequest" WHERE id = $1::text LIMIT 1`,
      [customRequestId]
    );
    if (!rows.length) {
      console.error('[reconcile] CustomRequest not found:', customRequestId);
      return { ok: false, error: 'CustomRequest not found' };
    }
    cr = rows[0];
  } catch (err) {
    console.error('[reconcile] DB fetch error:', err.message);
    return { ok: false, error: `DB error: ${err.message}` };
  }

  const alreadyPaid = !!cr.paidAt;

  // 2. Retrieve Stripe session FRESH with discount breakdown expanded
  if (!process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: 'STRIPE_SECRET_KEY not configured' };
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
      expand: ['total_details.breakdown'],
    });
  } catch (err) {
    console.error('[reconcile] Stripe session retrieve failed:', err.message);
    return { ok: false, error: `Stripe error: ${err.message}` };
  }

  console.log('[reconcile] session retrieved | payment_status:', session.payment_status,
    '| amount_total:', session.amount_total,
    '| metadata:', JSON.stringify(session.metadata));

  // 3. Check payment (100% coupon → amount_total 0 → still paid)
  const isPaid =
    session.payment_status === 'paid' ||
    session.payment_status === 'no_payment_required' ||
    session.amount_total === 0;

  if (!isPaid) {
    console.log('[reconcile] not paid — payment_status:', session.payment_status);
    return { ok: false, paid: false, paymentStatus: session.payment_status };
  }

  // 4. Update CustomRequest — idempotent (WHERE paidAt IS NULL)
  const nowISO = new Date().toISOString();
  let updateRowCount = 0;
  try {
    const result = await pool.query(
      `UPDATE "CustomRequest"
       SET "paymentStatus"           = 'paid',
           "paidAt"                  = $1::timestamptz,
           "quoteAcceptedAt"         = $2::timestamp,
           "stripeSessionId"         = $3::text,
           "stripeCheckoutSessionId" = $3::text,
           status                    = 'in_progress'
       WHERE id = $4::text AND "paidAt" IS NULL`,
      [nowISO, nowISO, stripeSessionId, customRequestId]
    );
    updateRowCount = result.rowCount;
    console.log('[reconcile] CustomRequest update rowCount:', updateRowCount, '| alreadyPaid:', alreadyPaid);
  } catch (err) {
    console.error('[reconcile] CustomRequest UPDATE error:', err.message);
    return { ok: false, error: `DB update error: ${err.message}` };
  }

  // 5. Upsert Purchase — primary idempotency key is customRequestId, not stripeSessionId.
  //    Resend Quote creates a new Stripe session for the same CustomRequest, so
  //    ON CONFLICT ("stripeSessionId") DO NOTHING would silently create a duplicate.
  //    We always want exactly one Purchase per CustomRequest.
  try {
    const grossAmount    = (cr.quoteAmount ?? 0) / 100;
    const netAmount      = (session.amount_total ?? 0) / 100;
    const discountAmount = session.total_details?.amount_discount != null
      ? session.total_details.amount_discount / 100
      : Math.max(0, grossAmount - netAmount);

    if (alreadyPaid) {
      console.log('[reconcile] CustomRequest already paid — ensuring Purchase exists — requestId:', customRequestId);
    }

    // Check if a Purchase already exists for this CustomRequest
    const { rows: existingPurchase } = await pool.query(
      `SELECT id FROM "Purchase" WHERE "customRequestId" = $1::text LIMIT 1`,
      [cr.id]
    );

    const currency = session.currency || 'eur';

    if (existingPurchase.length > 0) {
      // UPDATE — sync latest session data, never create a duplicate
      await pool.query(
        `UPDATE "Purchase" SET
           "stripeSessionId"       = $1,
           "stripePaymentIntentId" = $2,
           amount                  = $3,
           "grossAmount"           = $4,
           "netAmount"             = $5,
           "discountAmount"        = $6,
           currency                = $7,
           status                  = 'paid',
           "purchasedAt"           = COALESCE("purchasedAt", NOW())
         WHERE "customRequestId" = $8::text`,
        [
          session.id,
          session.payment_intent || null,
          netAmount, grossAmount, netAmount, discountAmount,
          currency,
          cr.id,
        ]
      );
      console.log('[reconcile] Purchase updated — requestId:', customRequestId, '| sessionId:', stripeSessionId);
    } else {
      // INSERT — protected against race conditions by unique index on customRequestId
      try {
        await pool.query(
          `INSERT INTO "Purchase"
             (id, "userId", "itineraryId", "customRequestId", "stripeSessionId", "stripePaymentIntentId",
              amount, "grossAmount", "netAmount", "discountAmount",
              currency, "designerUserId", status, "purchasedAt", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'paid', NOW(), NOW())`,
          [
            cr.userId      || null,
            cr.itineraryId || null,
            cr.id,
            session.id,
            session.payment_intent || null,
            netAmount, grossAmount, netAmount, discountAmount,
            currency,
            cr.designerId  || null,
          ]
        );
        console.log('[reconcile] Purchase created — requestId:', customRequestId, '| sessionId:', stripeSessionId);
      } catch (insertErr) {
        if (insertErr.code === '23505') {
          // Race condition: another process inserted between our SELECT and INSERT — update instead
          console.log('[reconcile] Purchase race condition resolved — updating — requestId:', customRequestId);
          await pool.query(
            `UPDATE "Purchase" SET
               "stripeSessionId"       = $1,
               "stripePaymentIntentId" = $2,
               amount                  = $3,
               "grossAmount"           = $4,
               "netAmount"             = $5,
               "discountAmount"        = $6,
               currency                = $7,
               status                  = 'paid',
               "purchasedAt"           = COALESCE("purchasedAt", NOW())
             WHERE "customRequestId" = $8::text`,
            [
              session.id,
              session.payment_intent || null,
              netAmount, grossAmount, netAmount, discountAmount,
              currency,
              cr.id,
            ]
          );
        } else {
          throw insertErr;
        }
      }
    }
  } catch (err) {
    console.error('[reconcile] Purchase upsert failed (non-fatal):', err.message);
  }

  // 6. Emails — only on first reconciliation (alreadyPaid=false), non-fatal
  if (!alreadyPaid && process.env.RESEND_API_KEY) {
    const amount    = (session.amount_total ?? 0) / 100;
    const amountFmt = `€${amount.toFixed(2)}`;
    const dest      = cr.destination || 'your destination';
    const firstName = cr.fullName?.split(' ')[0] ?? 'there';

    let designerEmail = null;
    let designerName  = null;
    if (cr.designerId) {
      try {
        const { rows: dRows } = await pool.query(
          `SELECT email AS "designerEmail", name AS "designerName"
           FROM "User" WHERE id = $1::text LIMIT 1`,
          [cr.designerId]
        );
        if (dRows[0]) {
          designerEmail = dRows[0].designerEmail;
          designerName  = dRows[0].designerName;
        }
      } catch { /* non-fatal */ }
    }

    const { Resend } = await import('resend');
    const resend      = new Resend(process.env.RESEND_API_KEY);
    const FROM        = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
    const FALLBACK    = 'contact@hiddenatlas.travel';
    const senderLabel = designerName ?? 'The HiddenAtlas Team';

    // Notify designer / admin
    try {
      await resend.emails.send({
        from:    FROM,
        replyTo: cr.email,
        to:      designerEmail ?? FALLBACK,
        ...(designerEmail ? { bcc: [FALLBACK] } : {}),
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
      console.error('[reconcile] designer email error:', err.message);
    }

    // Confirm to client
    try {
      await resend.emails.send({
        from:    FROM,
        replyTo: designerEmail ?? FALLBACK,
        to:      cr.email,
        subject: `Payment confirmed — your HiddenAtlas journey to ${esc(dest)}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;">Hi ${esc(firstName)},</h2>
            <p style="font-size:15px;line-height:1.7;">Your payment of <strong>${amountFmt}</strong> has been received. ${designerName ? esc(designerName) : 'Your travel designer'} will now start building your bespoke itinerary for <strong>${esc(dest)}</strong>.</p>
            <p style="font-size:15px;line-height:1.7;">You'll receive your itinerary once it's ready. If you have any questions in the meantime, just reply to this email.</p>
            <p style="font-size:14px;color:#8C8070;margin-top:24px;">— ${esc(senderLabel)}, HiddenAtlas</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
            <p style="color:#B5AA99;font-size:11px;">You are receiving this because you purchased a custom trip planning service on hiddenatlas.travel.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('[reconcile] client email error:', err.message);
    }
  }

  return {
    ok:          true,
    paid:        true,
    alreadyPaid,
    synced:      updateRowCount > 0,
    requestId:   customRequestId,
    sessionId:   stripeSessionId,
    amount:      (session.amount_total ?? 0) / 100,
  };
}
