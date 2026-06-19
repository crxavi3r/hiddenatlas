import pg from 'pg';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';
import { reconcileCustomRequestPayment } from './_lib/reconcileCustomRequestPayment.js';

const { Pool } = pg;

// Returns a Date object representing the start of the requested period.
// Prefers the `from` timestamp sent by the browser (which uses the local
// calendar timezone for 'today'). Falls back to UTC-based intervals if
// `from` is absent or unparseable (e.g. direct API calls).
function parseCutoff(from, period) {
  if (from) {
    const d = new Date(from);
    if (!isNaN(d)) return d;
  }
  const now = new Date();
  if (period === '7d')  return new Date(now - 7  * 24 * 60 * 60 * 1000);
  if (period === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  // 'today' fallback (UTC midnight — only used if browser did not send `from`)
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

// Actions accessible by designers (in addition to admins).
const DESIGNER_ACCESSIBLE_ACTIONS = new Set([
  'custom-requests',
  'custom-request-status',
  'custom-request-assign',
  'custom-request-reply',
  'create-itinerary-from-request',
  'send-quote',
  'sync-payment',
  'dashboard',
  'sales',
  'downloads',
]);

// ── Auth guard ────────────────────────────────────────────────────────────────
// Returns ctx. Allows designers for DESIGNER_ACCESSIBLE_ACTIONS; requires admin
// for everything else.
async function verifyAccess(req, pool) {
  const authHeader = req.headers.authorization;

  console.log('[api/admin] incoming request:', {
    action:        req.query?.action,
    hasAuthHeader: !!authHeader,
    authPrefix:    authHeader ? authHeader.slice(0, 14) + '...' : 'missing',
    origin:        req.headers.origin  ?? 'none',
    host:          req.headers.host    ?? 'none',
    CLERK_SECRET_KEY_SET: !!process.env.CLERK_SECRET_KEY,
    DATABASE_URL_SET:     !!process.env.DATABASE_URL,
    VERCEL_URL:    process.env.VERCEL_URL ?? 'not set',
  });

  const ctx = await resolveUserCtx(authHeader, pool);
  if (!ctx) {
    console.warn('[api/admin] verifyAccess — UNAUTHORIZED');
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }

  console.log(`[api/admin] verifyAccess — userId=${ctx.userId} email=${ctx.email} isAdmin=${ctx.isAdmin} isDesigner=${ctx.isDesigner} role=${ctx.role}`);

  const action = req.query?.action;
  if (DESIGNER_ACCESSIBLE_ACTIONS.has(action)) {
    if (!ctx.isAdmin && !ctx.isDesigner) {
      console.warn(`[api/admin] verifyAccess — FORBIDDEN for designer action: email=${ctx.email}`);
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
  } else {
    if (!ctx.isAdmin) {
      console.warn(`[api/admin] verifyAccess — FORBIDDEN (admin only): email=${ctx.email} role=${ctx.role}`);
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
  }

  return ctx;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Top-level safety net: guarantee JSON is always returned.
  // The pool.on('error') below handles unhandled pool events, but any remaining
  // synchronous throw (e.g. import-time issues on cold start) hits this catch.
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[api/admin] TOP-LEVEL UNHANDLED:', err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

async function _handler(req, res) {
  if (!['GET', 'PATCH', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000,
    max: 3,
  });
  // Prevent unhandled 'error' event crashes. pg emits 'error' on the Pool when
  // an idle client is dropped by the server (Neon aggressively closes idle
  // connections in serverless). Without this listener, Node.js throws an
  // uncaught exception → Vercel FUNCTION_INVOCATION_FAILED.
  pool.on('error', (err) => {
    console.error('[api/admin] idle pool client error (non-fatal):', err.message);
  });

  let adminCtx;
  try {
    adminCtx = await verifyAccess(req, pool);
  } catch (err) {
    try { await pool.end(); } catch {}
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const { action, period = '7d', page = '1', q = '', id, status, from, creatorId: qCreatorId } = req.query;
  const cutoff = parseCutoff(from, period);
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * 50;
  // Admin can pass creatorId to scope data to a specific designer; designers always see their own.
  const filterCreatorId = adminCtx.isAdmin ? (qCreatorId || null) : (adminCtx.creatorId || null);

  try {
    // ── Creator Acquisition CRM — unified POST body router ───────────────
    // All CRM actions: POST /api/admin with body { action: "namespace.verb", payload: {...} }
    if (req.method === 'POST' && typeof (req.body ?? {}).action === 'string' && req.body.action.includes('.')) {
      const { action: crmAction, payload = {} } = req.body;
      console.log(`[api/admin] CRM action=${crmAction}`);
      try {
        const data = await dispatchCrmAction(pool, crmAction, payload, adminCtx);
        return res.json({ success: true, data });
      } catch (err) {
        console.error(`[api/admin] CRM action=${crmAction} FAILED stage=${err.stage ?? 'unknown'}:`, err.message);
        if (err.stack) console.error(err.stack);
        const isClient = err.status != null && err.status < 500;
        // pg error codes: 22P02 = invalid_text_representation, 23502 = not_null_violation,
        // 23503 = foreign_key_violation, 23505 = unique_violation, 42703 = undefined_column
        const isPgError = typeof err.code === 'string' && /^[0-9]/.test(err.code);
        const isTransparent = isClient
          || err.message?.includes('does not exist')
          || err.code === 'PROVIDER_ERROR'
          || err.code === 'PROVIDER_NOT_CONFIGURED'
          || err.code === 'SCORING_ERROR'
          || isPgError;
        const userMsg = isTransparent
          ? (err.message?.includes('does not exist')
              ? `DB schema error: ${err.message}`
              : isPgError ? `DB error (${err.code}): ${err.message}` : err.message)
          : 'Internal error — see server logs';
        return res.status(err.status ?? 500).json({
          success: false,
          error: { message: userMsg, code: err.code ?? 'INTERNAL_ERROR', stage: err.stage ?? null },
        });
      }
    }

    // ── POST: designer application review ────────────────────────────────
    if (req.method === 'POST') {
      if (action === 'approve-designer-application') {
        if (!id) return res.status(400).json({ error: 'id is required' });

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows: appRows } = await client.query(
            `SELECT id, "userId", status FROM "DesignerApplication" WHERE id = $1 FOR UPDATE`,
            [id]
          );
          const app = appRows[0];
          if (!app) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Application not found' });
          }
          if (app.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Application is not pending' });
          }

          const now = new Date();
          await client.query(
            `UPDATE "DesignerApplication"
             SET status = 'approved', "reviewedBy" = $1, "reviewedAt" = $2, "updatedAt" = $2
             WHERE id = $3`,
            [adminCtx.userId, now, id]
          );
          await client.query(
            `UPDATE "User" SET role = 'designer', "updatedAt" = $1 WHERE id = $2`,
            [now, app.userId]
          );

          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }

        // Optional approval notification — non-fatal
        try {
          const { rows: applicantRows } = await pool.query(
            `SELECT "fullName", email FROM "DesignerApplication" WHERE id = $1`, [id]
          );
          const applicant = applicantRows[0];
          if (applicant) await sendApplicantEmail(applicant.email, applicant.fullName, 'approved');
        } catch (emailErr) {
          console.error('[api/admin] approval email failed:', emailErr.message);
        }

        return res.status(200).json({ ok: true });
      }

      if (action === 'reject-designer-application') {
        if (!id) return res.status(400).json({ error: 'id is required' });
        const { adminNote } = req.body ?? {};

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows: appRows } = await client.query(
            `SELECT id, "userId", "fullName", email, status FROM "DesignerApplication" WHERE id = $1 FOR UPDATE`,
            [id]
          );
          const app = appRows[0];
          if (!app) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Application not found' });
          }
          if (app.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Application is not pending' });
          }

          const now = new Date();
          await client.query(
            `UPDATE "DesignerApplication"
             SET status = 'rejected', "adminNote" = $1, "reviewedBy" = $2, "reviewedAt" = $3, "updatedAt" = $3
             WHERE id = $4`,
            [adminNote?.trim() || null, adminCtx.userId, now, id]
          );

          await client.query('COMMIT');

          // Optional rejection notification — non-fatal
          try {
            await sendApplicantEmail(app.email, app.fullName, 'rejected');
          } catch (emailErr) {
            console.error('[api/admin] rejection email failed:', emailErr.message);
          }
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }

        return res.status(200).json({ ok: true });
      }

      // ── Reply to client from a custom request (admin or assigned designer) ─
      if (action === 'custom-request-reply') {
        const { id: bodyId, message: replyMessage } = req.body ?? {};
        const requestId = bodyId || id;
        if (!requestId || !replyMessage?.trim()) {
          return res.status(400).json({ error: 'id and message are required' });
        }

        const { rows: reqRows } = await pool.query(
          `SELECT cr.email, cr."fullName", cr."designerId", d.name AS "designerName", d.email AS "designerEmail"
           FROM "CustomRequest" cr
           LEFT JOIN "User" d ON d.id = cr."designerId"
           WHERE cr.id = $1 LIMIT 1`,
          [requestId]
        );
        if (!reqRows.length) return res.status(404).json({ error: 'Request not found' });
        const reqData = reqRows[0];

        if (!adminCtx.isAdmin && adminCtx.userId !== reqData.designerId) {
          return res.status(403).json({ error: 'Not your request' });
        }
        if (!process.env.RESEND_API_KEY) {
          return res.status(503).json({ error: 'Email service not configured' });
        }

        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const FROM = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
        const senderLabel  = reqData.designerName ?? 'The HiddenAtlas Team';
        const firstName    = reqData.fullName?.split(' ')[0] ?? 'there';
        // Reply-To: assigned designer > authenticated sender (always a real address the client can reply to)
        const replyToEmail = (reqData.designerEmail || adminCtx.email || '').trim().toLowerCase() || null;

        console.log(`[api/admin] custom-request-reply — to: ${reqData.email} | replyTo: ${replyToEmail} | sender: ${adminCtx.email}`);

        const result = await resend.emails.send({
          from:    FROM,
          replyTo: replyToEmail ?? undefined,
          to:      reqData.email,
          subject: `A message from ${senderLabel} — HiddenAtlas`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
              <h2 style="color:#1B6B65;">Hi ${esc(firstName)},</h2>
              <p style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${esc(replyMessage.trim())}</p>
              ${replyToEmail ? `<p style="font-size:13px;color:#8C8070;margin-top:20px;">You can reply directly to this email to contact ${esc(senderLabel)}.</p>` : ''}
              <p style="font-size:14px;color:#8C8070;margin-top:12px;">— ${esc(senderLabel)}, HiddenAtlas</p>
              <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
              <p style="color:#B5AA99;font-size:11px;">You are receiving this about your custom trip request on hiddenatlas.travel.</p>
            </div>
          `,
        });

        if (result.error) {
          console.error('[api/admin] custom-request-reply email error:', JSON.stringify(result.error));
          return res.status(502).json({ error: 'Email delivery failed' });
        }
        console.log('[api/admin] custom-request-reply sent — to:', reqData.email, '| id:', result.data?.id);
        return res.status(200).json({ ok: true, messageId: result.data?.id });
      }

      // ── Send a custom price quote to the client ──────────────────────────
      if (action === 'send-quote') {
        const { id: bodyId, amount: bodyAmount, message: bodyMessage } = req.body ?? {};
        const requestId  = bodyId || id;
        const amountFloat = parseFloat(bodyAmount);
        if (!requestId)                          return res.status(400).json({ error: 'id is required' });
        if (!amountFloat || amountFloat <= 0)    return res.status(400).json({ error: 'amount must be greater than 0' });
        if (!process.env.STRIPE_SECRET_KEY)      return res.status(500).json({ error: 'Stripe not configured' });

        const { rows: crRows } = await pool.query(
          `SELECT cr.id, cr."fullName", cr.email, cr.destination, cr.dates,
                  cr."designerId", cr."userId", cr."paidAt", cr."quoteSentAt",
                  d.name AS "designerName", d.email AS "designerEmail"
           FROM "CustomRequest" cr
           LEFT JOIN "User" d ON d.id = cr."designerId"
           WHERE cr.id = $1 LIMIT 1`,
          [requestId]
        );
        if (!crRows.length) return res.status(404).json({ error: 'Request not found' });
        const crData = crRows[0];

        if (!adminCtx.isAdmin && adminCtx.userId !== crData.designerId) {
          return res.status(403).json({ error: 'Not your request' });
        }
        if (crData.paidAt) {
          return res.status(409).json({ error: 'Request already paid' });
        }

        const amountCents = Math.round(amountFloat * 100);
        const quoteMessage = bodyMessage?.trim() || null;
        const dest = crData.destination || 'your destination';
        const origin = req.headers.origin || 'https://hiddenatlas.travel';

        // Create Stripe Checkout Session with a dynamic price
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        let stripeSession;
        try {
          stripeSession = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{
              price_data: {
                currency: 'eur',
                product_data: {
                  name: `HiddenAtlas Custom Trip Planning — ${dest}`,
                  ...(quoteMessage ? { description: quoteMessage } : {}),
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            }],
            customer_email:        crData.email,
            allow_promotion_codes: true,
            success_url: `${origin}/custom-request/${requestId}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:  `${origin}/custom-request/${requestId}/payment-cancelled`,
            metadata: {
              type:            'custom_request_quote',
              customRequestId: requestId,
              designerId:      crData.designerId || '',
              userId:          crData.userId     || '',
            },
          });
        } catch (stripeErr) {
          console.error('[api/admin] send-quote Stripe error:', stripeErr.message);
          return res.status(502).json({ error: 'Quote could not be created. Please try again.' });
        }

        // Persist quote data
        await pool.query(
          `UPDATE "CustomRequest"
           SET "quoteAmount" = $1, "quoteCurrency" = 'eur', "quoteMessage" = $2,
               "quoteSentAt" = NOW(), "stripeCheckoutSessionId" = $3, "stripePaymentUrl" = $4
           WHERE id = $5`,
          [amountCents, quoteMessage, stripeSession.id, stripeSession.url, requestId]
        );

        // Email client with payment link (non-fatal)
        if (process.env.RESEND_API_KEY) {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const FROM         = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
          const replyToEmail = (crData.designerEmail || adminCtx.email || '').trim().toLowerCase() || null;
          const senderLabel  = crData.designerName ?? 'The HiddenAtlas Team';
          const firstName    = crData.fullName?.split(' ')[0] ?? 'there';
          const amountFmt    = `€${(amountCents / 100).toFixed(2)}`;
          try {
            const emailResult = await resend.emails.send({
              from:    FROM,
              replyTo: replyToEmail ?? undefined,
              to:      crData.email,
              subject: `Your custom trip quote — ${amountFmt}`,
              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
                  <h2 style="color:#1B6B65;">Hi ${esc(firstName)},</h2>
                  <p style="font-size:15px;line-height:1.7;">We've reviewed your request and prepared a personalised quote for your journey to <strong>${esc(dest)}</strong>.</p>
                  ${quoteMessage ? `<div style="background:#F8F6F2;border-left:3px solid #1B6B65;padding:14px 18px;border-radius:0 6px 6px 0;margin:20px 0;"><p style="font-size:14px;line-height:1.7;margin:0;white-space:pre-wrap;">${esc(quoteMessage)}</p></div>` : ''}
                  <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;">
                    ${crData.destination ? `<tr><td style="padding:6px 0;color:#8C8070;width:120px;">Destination</td><td style="padding:6px 0;font-weight:600;">${esc(crData.destination)}</td></tr>` : ''}
                    ${crData.dates ? `<tr><td style="padding:6px 0;color:#8C8070;">Dates</td><td style="padding:6px 0;">${esc(crData.dates)}</td></tr>` : ''}
                    <tr><td style="padding:6px 0;color:#8C8070;">Quote amount</td><td style="padding:6px 0;font-weight:700;color:#1B6B65;font-size:16px;">${amountFmt}</td></tr>
                  </table>
                  <p style="margin:28px 0 8px;"><a href="${stripeSession.url}" style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">Accept quote and pay →</a></p>
                  ${replyToEmail ? `<p style="font-size:13px;color:#8C8070;margin-top:20px;">You can reply directly to this email to contact ${esc(senderLabel)}.</p>` : ''}
                  <p style="font-size:14px;color:#8C8070;margin-top:12px;">— ${esc(senderLabel)}, HiddenAtlas</p>
                  <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
                  <p style="color:#B5AA99;font-size:11px;">You are receiving this because you submitted a custom trip request on hiddenatlas.travel. Payment is handled securely by Stripe.</p>
                </div>
              `,
            });
            if (emailResult.error) console.error('[api/admin] send-quote email error:', JSON.stringify(emailResult.error));
            else console.log('[api/admin] send-quote email sent — to:', crData.email, '| Resend id:', emailResult.data?.id);
          } catch (emailErr) {
            console.error('[api/admin] send-quote email exception:', emailErr.message);
          }
        }

        console.log('[api/admin] send-quote done — requestId:', requestId, '| amountCents:', amountCents, '| sessionId:', stripeSession.id);
        return res.status(200).json({ ok: true, stripePaymentUrl: stripeSession.url, sessionId: stripeSession.id });
      }

      // ── Manually sync payment status from Stripe ─────────────────────────
      if (action === 'sync-payment') {
        const { id: bodyId } = req.body ?? {};
        const requestId = bodyId || id;
        if (!requestId)                     return res.status(400).json({ error: 'id is required' });
        if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });

        // Fetch just enough to do auth check and validate preconditions
        const { rows: crRows } = await pool.query(
          `SELECT id, "paidAt", "stripeCheckoutSessionId", "designerId"
           FROM "CustomRequest" WHERE id = $1::text LIMIT 1`,
          [requestId]
        );
        if (!crRows.length) return res.status(404).json({ error: 'Request not found' });
        const crData = crRows[0];

        if (!adminCtx.isAdmin && adminCtx.userId !== crData.designerId) {
          return res.status(403).json({ error: 'Not your request' });
        }
        if (crData.paidAt) {
          return res.status(200).json({ ok: true, alreadyPaid: true, message: 'Already marked as paid' });
        }
        if (!crData.stripeCheckoutSessionId) {
          return res.status(400).json({ error: 'No Stripe session ID on record — send a quote first' });
        }

        console.log('[api/admin] sync-payment — delegating to reconcileCustomRequestPayment',
          '| requestId:', requestId,
          '| stripeCheckoutSessionId:', crData.stripeCheckoutSessionId);

        const result = await reconcileCustomRequestPayment(pool, requestId, crData.stripeCheckoutSessionId);

        if (!result.ok) {
          if (result.paid === false) {
            return res.status(200).json({ ok: false, alreadyPaid: false, paymentStatus: result.paymentStatus, message: 'Stripe session not yet paid' });
          }
          return res.status(502).json({ error: result.error || 'Reconciliation failed' });
        }

        return res.status(200).json({
          ok:         true,
          alreadyPaid: result.alreadyPaid,
          synced:      result.synced,
          message:     result.synced ? 'Payment synced successfully' : 'Already up to date',
        });
      }

      // ── Create an itinerary from a custom request ────────────────────────
      if (action === 'create-itinerary-from-request') {
        const { id: bodyId } = req.body ?? {};
        const requestId = bodyId || id;
        if (!requestId) return res.status(400).json({ error: 'id is required' });

        // Fetch request data
        const { rows: crRows } = await pool.query(
          `SELECT id, "fullName", email, destination, dates, duration, "groupSize",
                  "groupType", budget, style, notes, "designerId", "itineraryId", "userId"
           FROM "CustomRequest" WHERE id = $1 LIMIT 1`,
          [requestId]
        );
        if (!crRows.length) return res.status(404).json({ error: 'Request not found' });
        const crData = crRows[0];

        // Auth: admin or assigned designer only
        if (!adminCtx.isAdmin && adminCtx.userId !== crData.designerId) {
          return res.status(403).json({ error: 'Not your request' });
        }

        // Idempotency: return existing itinerary if already linked
        if (crData.itineraryId) {
          return res.status(200).json({ itineraryId: crData.itineraryId, isNew: false });
        }

        // Resolve Creator profile for the designer (so itinerary appears under their profile)
        let creatorId = null;
        if (crData.designerId) {
          try {
            const { rows: crtrRows } = await pool.query(
              `SELECT id FROM "Creator" WHERE user_id = $1 AND is_active = true LIMIT 1`,
              [crData.designerId]
            );
            creatorId = crtrRows[0]?.id ?? null;
          } catch { /* non-fatal */ }
        }

        // Build initial content from request fields
        const dest        = crData.destination || '';
        const dur         = crData.duration    || '';
        const title       = dest ? `${dest} — Custom Journey` : 'Custom Journey';
        const subtitle    = dur;
        const durDays     = dur ? (parseInt((dur.match(/(\d+)/) || [])[1], 10) || null) : null;
        let   styleArr    = [];
        try { styleArr = Array.isArray(crData.style) ? crData.style : JSON.parse(crData.style || '[]'); } catch {}
        const styleStr    = styleArr.length ? styleArr.join(', ') : null;
        const shortDesc   = [
          dest     ? `A custom journey to ${dest}` : null,
          crData.dates  ? `in ${crData.dates}`     : null,
          dur      ? `for ${dur}`                  : null,
        ].filter(Boolean).join(', ') + (dest || crData.dates || dur ? '.' : '');

        const slug = `custom-req-${requestId.slice(0, 8).toLowerCase()}-${Date.now().toString(36)}`;

        const content = {
          hero:    { title, subtitle, tagline: dest ? `A tailor-made journey to ${dest}` : 'A tailor-made journey', coverImage: '' },
          summary: { shortDescription: shortDesc || title, whySpecial: crData.notes || '', routeOverview: dest, highlights: [], included: [] },
          tripFacts: {
            groupSize: crData.groupSize ? String(crData.groupSize) : '',
            difficulty: 'Moderate',
            bestFor: crData.groupType ? [crData.groupType] : [],
            category: 'Custom Journey',
          },
          days: [],
          sections: {
            hotels: [],
            practicalNotes: [
              crData.budget    ? `Budget: ${crData.budget}` : null,
              styleStr         ? `Travel style: ${styleStr}` : null,
              crData.groupType ? `Group type: ${crData.groupType}` : null,
              crData.notes     ? `Notes: ${crData.notes}` : null,
            ].filter(Boolean).join('\n'),
            faq: [],
          },
          pdfConfig: { showRouteMap: true, showHotels: true },
          seo: { metaTitle: title, metaDescription: '' },
        };

        // Insert Itinerary — note: creator_id is snake_case in the DB (renamed via migration)
        const { rows: itinInsert } = await pool.query(
          `INSERT INTO "Itinerary"
             (id, slug, title, subtitle, destination, description, price,
              "durationDays", "coverImage", content,
              type, status, "userId", creator_id, "isPrivate", "isPublished", "createdAt")
           VALUES
             (gen_random_uuid(), $1, $2, $3, $4, $5, 0,
              $6, '', $7::jsonb,
              'custom', 'draft', $8, $9, true, false, NOW())
           RETURNING id`,
          [
            slug, title, subtitle, dest, shortDesc || title,
            durDays, JSON.stringify(content),
            crData.designerId || null,
            creatorId,
          ]
        );
        const newItinId = itinInsert[0]?.id;
        if (!newItinId) return res.status(500).json({ error: 'Itinerary insert failed' });

        // Link itinerary back to the custom request
        await pool.query(
          `UPDATE "CustomRequest" SET "itineraryId" = $1 WHERE id = $2`,
          [newItinId, requestId]
        );

        console.log('[api/admin] create-itinerary-from-request — requestId:', requestId, '| itineraryId:', newItinId);
        return res.status(200).json({ itineraryId: newItinId, isNew: true, title });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── PATCH: status and assignment updates ─────────────────────────────
    if (req.method === 'PATCH') {
      if (action === 'custom-request-status') {
        const { id: bodyId, status: bodyStatus, confirm: confirmPublish } = req.body ?? {};
        const requestId = bodyId     || id;
        const newStatus = bodyStatus || status;
        const VALID_STATUS = ['open', 'in_progress', 'done'];
        if (!requestId) return res.status(400).json({ error: 'id is required' });
        if (!VALID_STATUS.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });

        // Designers can only update requests assigned to them.
        if (!adminCtx.isAdmin) {
          const { rows: ownerRows } = await pool.query(
            `SELECT "designerId" FROM "CustomRequest" WHERE id = $1 LIMIT 1`,
            [requestId]
          );
          if (!ownerRows.length || ownerRows[0].designerId !== adminCtx.userId) {
            return res.status(403).json({ error: 'Not your request' });
          }
        }

        // When marking done: check whether the linked itinerary is published.
        // If it's still a draft and the caller hasn't confirmed, return a flag
        // so the UI can show a confirmation dialog before auto-publishing.
        if (newStatus === 'done') {
          const { rows: linkRows } = await pool.query(
            `SELECT i.id, i.status FROM "Itinerary" i
             JOIN "CustomRequest" cr ON cr."itineraryId" = i.id
             WHERE cr.id = $1`,
            [requestId]
          );
          const linked = linkRows[0] ?? null;
          if (linked && linked.status !== 'published') {
            if (!confirmPublish) {
              return res.status(200).json({ needsConfirm: true, itineraryStatus: linked.status });
            }
            await pool.query(
              `UPDATE "Itinerary" SET status = 'published', "isPublished" = true WHERE id = $1`,
              [linked.id]
            );
          }
        }

        const { rowCount } = await pool.query(
          `UPDATE "CustomRequest" SET status = $1 WHERE id = $2`,
          [newStatus, requestId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Request not found' });
        return res.status(200).json({ ok: true });
      }

      // ── Assign designer to a custom request (admin only) ────────────────
      if (action === 'custom-request-assign') {
        if (!adminCtx.isAdmin) return res.status(403).json({ error: 'Admin only' });
        const { id: bodyId, designerId: newDesignerId } = req.body ?? {};
        const requestId = bodyId || id;
        if (!requestId) return res.status(400).json({ error: 'id is required' });

        const { rowCount } = await pool.query(
          `UPDATE "CustomRequest" SET "designerId" = $1 WHERE id = $2`,
          [newDesignerId || null, requestId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Request not found' });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── GET actions ───────────────────────────────────────────────────────
    if (action === 'dashboard') {
      // Each sub-query runs independently — one failure returns a safe default
      // instead of killing the entire dashboard payload.
      async function safe(name, fn, fallback) {
        try { return await fn(); }
        catch (e) {
          console.error(`[api/admin] dashboard sub-query "${name}" failed: ${e.message}`);
          return fallback;
        }
      }

      const KPI_ZERO = { visitors: 0, newUsers: 0, itineraryViews: 0, downloads: 0, sales: 0, revenue: 0, conversionRate: 0 };
      const FUNNEL_ZERO = { visitors: 0, itineraryViews: 0, downloads: 0, purchases: 0 };

      const [kpis, chart, funnel, topItineraries, sources, activity] = await Promise.all([
        safe('kpis',           () => getDashboardKPIs(pool, cutoff, filterCreatorId),    KPI_ZERO),
        safe('chart',          () => getChartData(pool, cutoff, filterCreatorId),         []),
        safe('funnel',         () => getFunnelData(pool, cutoff, filterCreatorId),        FUNNEL_ZERO),
        safe('topItineraries', () => getTopItineraries(pool, cutoff, filterCreatorId),    []),
        safe('sources',        () => getTrafficSources(pool, cutoff),    []),
        safe('activity',       () => getRecentActivity(pool, cutoff, filterCreatorId),    []),
      ]);
      return res.status(200).json({ kpis, chart, funnel, topItineraries, sources, activity });
    }

    if (action === 'users')    return res.status(200).json(await getUsersList(pool, q, offset));
    if (action === 'user')     {
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = await getUserDetail(pool, id);
      if (!data) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(data);
    }
    if (action === 'sales')     return res.status(200).json(await getSales(pool, cutoff, offset, filterCreatorId));
    if (action === 'downloads') return res.status(200).json(await getDownloads(pool, cutoff, offset, filterCreatorId));
    if (action === 'custom-requests') return res.status(200).json(await getCustomRequests(pool, status, offset, req.query.all === 'true', adminCtx));

    if (action === 'webhook-logs') {
      const { rows } = await pool.query(
        `SELECT "createdAt", "eventId", "eventType", status, "customRequestId",
                "stripeSessionId", "errorMessage", "rawSummary", metadata, "httpStatus", provider, endpoint
         FROM "WebhookLog"
         ORDER BY "createdAt" DESC
         LIMIT 50`
      );
      return res.status(200).json({ logs: rows });
    }

    if (action === 'designer-applications') {
      const filterStatus = status || 'all';
      const { rows } = await pool.query(
        `SELECT
           da.id,
           da."fullName",
           da.email,
           da.bio,
           da."websiteUrl",
           da."instagramUrl",
           da."expertiseRegions",
           da.message,
           da.status,
           da."adminNote",
           da."createdAt",
           da."reviewedAt",
           da."updatedAt",
           u.id        AS "userId",
           u.email     AS "userEmail",
           u.name      AS "userName",
           u.role      AS "userRole",
           rv.name     AS "reviewedByName"
         FROM "DesignerApplication" da
         JOIN "User" u  ON u.id  = da."userId"
         LEFT JOIN "User" rv ON rv.id = da."reviewedBy"
         WHERE ($1 = 'all' OR da.status = $1)
         ORDER BY da."createdAt" DESC`,
        [filterStatus]
      );
      return res.status(200).json(rows);
    }

    // ── One-time backfill: populate null new columns from legacy `amount` ─────
    if (action === 'backfill-purchases') {
      const { rowCount } = await pool.query(`
        UPDATE "Purchase"
        SET
          "grossAmount"    = COALESCE("grossAmount",    amount),
          "netAmount"      = COALESCE("netAmount",      amount),
          "discountAmount" = COALESCE("discountAmount", 0)
        WHERE
          "grossAmount" IS NULL
          OR "netAmount" IS NULL
          OR "discountAmount" IS NULL
      `);
      return res.status(200).json({ ok: true, rowsUpdated: rowCount });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(`[api/admin] action=${action} error: ${err.message}`, err.stack);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    try { await pool.end(); } catch {}
  }
}

// ── Shared download counting SQL ─────────────────────────────────────────────
// Counts both authenticated downloads (TripEvent.DOWNLOADED) and anonymous
// downloads tracked via the Event table (Event.ITINERARY_DOWNLOAD).
// All usages must stay in sync with getDownloads().
//
// countAllDownloads(cutoff)              → scalar n
// countDownloadsByCreator(cutoff, cId)   → scalar n
// downloadsByDayCTE(cutoff)              → subquery: (day, downloads)
// downloadsByDayCreatorCTE(cutoff, cId)  → subquery: (day, downloads)
// downloadsBySlugCTE(cutoff)             → subquery: (itinerarySlug, downloads)
// downloadsBySlugCreatorCTE(cutoff, cId) → subquery: (itinerarySlug, downloads)
//
// These are plain SQL strings — interpolate into larger queries.

const DOWNLOAD_COUNT_SQL = (cutoff_param, creator_param = null) =>
  creator_param
    ? `(
        SELECT COUNT(*) AS n FROM "TripEvent" te
        LEFT JOIN "Trip" t ON t.id = te."tripId"
        JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
        WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= ${cutoff_param} AND i.creator_id = ${creator_param}
       ) UNION ALL (
        SELECT COUNT(*) AS n FROM "Event" e
        JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
        WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= ${cutoff_param} AND i.creator_id = ${creator_param}
       )`
    : `(SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= ${cutoff_param})
       UNION ALL
       (SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_DOWNLOAD' AND "createdAt" >= ${cutoff_param})`;

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
async function getDashboardKPIs(pool, cutoff, creatorId = null) {
  // Site-wide metrics (not filterable by individual designer)
  const [visitors, pageViews, newUsers] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "User" WHERE "createdAt" >= $1`, [cutoff]),
  ]);

  // Itinerary-scoped metrics — filtered by creator when set
  let itinViews, downloads, sales, discountRow;
  if (creatorId) {
    [itinViews, downloads, sales] = await Promise.all([
      pool.query(`
        SELECT COUNT(*) AS n FROM "Event" e
        JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
        WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1 AND i.creator_id = $2
      `, [cutoff, creatorId]),
      pool.query(`
        SELECT COALESCE(SUM(n),0) AS n FROM (
          SELECT COUNT(*) AS n FROM "TripEvent" te
          LEFT JOIN "Trip" t ON t.id = te."tripId"
          JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
          WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $2
          UNION ALL
          SELECT COUNT(*) AS n FROM "Event" e
          JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
          WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $2
        ) counts
      `, [cutoff, creatorId]),
      pool.query(`
        SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
        FROM "Purchase" p
        JOIN "Itinerary" i ON i.id = p."itineraryId"
        WHERE p."purchasedAt" >= $1 AND i.creator_id = $2
      `, [cutoff, creatorId]),
    ]);
    discountRow = await pool.query(`
      SELECT
        COALESCE(SUM(COALESCE("grossAmount", amount, 0)),0) AS gross_revenue,
        COALESCE(SUM(COALESCE("netAmount",   amount, 0)),0) AS net_revenue,
        COALESCE(SUM(COALESCE("discountAmount", 0)),0)      AS total_discount
      FROM "Purchase" p
      JOIN "Itinerary" i ON i.id = p."itineraryId"
      WHERE p."purchasedAt" >= $1 AND i.creator_id = $2
    `, [cutoff, creatorId]).then(r => r.rows[0]).catch(() => ({ gross_revenue: 0, net_revenue: 0, total_discount: 0 }));
  } else {
    [itinViews, downloads, sales] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
      pool.query(`
        SELECT COALESCE(SUM(n),0) AS n FROM (
          SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
          UNION ALL
          SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_DOWNLOAD' AND "createdAt" >= $1
        ) counts
      `, [cutoff]),
      pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
    ]);
    discountRow = await pool.query(`
      SELECT
        COALESCE(SUM(COALESCE("grossAmount", amount, 0)),0)    AS gross_revenue,
        COALESCE(SUM(COALESCE("netAmount",   amount, 0)),0)    AS net_revenue,
        COALESCE(SUM(COALESCE("discountAmount", 0)),0)         AS total_discount
      FROM "Purchase" WHERE "purchasedAt" >= $1
    `, [cutoff]).then(r => r.rows[0]).catch(() => ({ gross_revenue: 0, net_revenue: 0, total_discount: 0 }));
  }

  const v = parseInt(visitors.rows[0].n, 10) || 0;
  const s = parseInt(sales.rows[0].n, 10) || 0;
  return {
    visitors:       v,
    pageViews:      parseInt(pageViews.rows[0].n, 10) || 0,
    newUsers:       parseInt(newUsers.rows[0].n, 10) || 0,
    itineraryViews: parseInt(itinViews.rows[0].n, 10) || 0,
    downloads:      parseInt(downloads.rows[0].n, 10) || 0,
    sales:          s,
    revenue:        parseFloat(sales.rows[0].revenue) || 0,
    grossRevenue:   parseFloat(discountRow.gross_revenue) || 0,
    netRevenue:     parseFloat(discountRow.net_revenue) || 0,
    totalDiscount:  parseFloat(discountRow.total_discount) || 0,
    conversionRate: v > 0 ? +((s / v) * 100).toFixed(1) : 0,
  };
}

// ── Daily chart data ──────────────────────────────────────────────────────────
async function getChartData(pool, cutoff, creatorId = null) {
  if (!creatorId) {
    const { rows } = await pool.query(`
      WITH d AS (
        SELECT generate_series(
          DATE_TRUNC('day', $1::timestamptz),
          DATE_TRUNC('day', NOW()),
          '1 day'
        )::date AS day
      ),
      ev AS (
        SELECT DATE("createdAt") AS day,
          COUNT(DISTINCT COALESCE("userId", "sessionId")) FILTER (WHERE "eventType"='PAGE_VIEW') AS visitors,
          COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW')  AS itinerary_views
        FROM "Event" WHERE "createdAt" >= $1
        GROUP BY DATE("createdAt")
      ),
      sl AS (
        SELECT DATE("purchasedAt") AS day,
          COUNT(*)               AS sales,
          COALESCE(SUM(amount),0) AS revenue
        FROM "Purchase" WHERE "purchasedAt" >= $1
        GROUP BY DATE("purchasedAt")
      ),
      dl AS (
        SELECT day, SUM(cnt) AS downloads FROM (
          SELECT DATE("createdAt") AS day, COUNT(*) AS cnt
          FROM "TripEvent"
          WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
          GROUP BY DATE("createdAt")
          UNION ALL
          SELECT DATE("createdAt") AS day, COUNT(*) AS cnt
          FROM "Event"
          WHERE "eventType"='ITINERARY_DOWNLOAD' AND "createdAt" >= $1
          GROUP BY DATE("createdAt")
        ) raw GROUP BY day
      )
      SELECT
        d.day::text,
        COALESCE(ev.visitors,0)::int        AS visitors,
        COALESCE(ev.itinerary_views,0)::int AS itinerary_views,
        COALESCE(sl.sales,0)::int           AS sales,
        COALESCE(sl.revenue,0)::float       AS revenue,
        COALESCE(dl.downloads,0)::int       AS downloads
      FROM d
      LEFT JOIN ev ON ev.day = d.day
      LEFT JOIN sl ON sl.day = d.day
      LEFT JOIN dl ON dl.day = d.day
      ORDER BY d.day
    `, [cutoff]);
    return rows;
  }

  // Creator-filtered chart: filter sales and downloads by creator's itineraries
  const { rows } = await pool.query(`
    WITH d AS (
      SELECT generate_series(
        DATE_TRUNC('day', $1::timestamptz),
        DATE_TRUNC('day', NOW()),
        '1 day'
      )::date AS day
    ),
    ev AS (
      SELECT DATE(e."createdAt") AS day, COUNT(*) AS itinerary_views
      FROM "Event" e
      JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1 AND i.creator_id = $2
      GROUP BY DATE(e."createdAt")
    ),
    sl AS (
      SELECT DATE(p."purchasedAt") AS day,
        COUNT(*) AS sales,
        COALESCE(SUM(COALESCE(p."netAmount", p.amount, 0)),0) AS revenue
      FROM "Purchase" p
      JOIN "Itinerary" i ON i.id = p."itineraryId"
      WHERE p."purchasedAt" >= $1 AND i.creator_id = $2
      GROUP BY DATE(p."purchasedAt")
    ),
    dl AS (
      SELECT day, SUM(cnt) AS downloads FROM (
        SELECT DATE(te."createdAt") AS day, COUNT(*) AS cnt
        FROM "TripEvent" te
        LEFT JOIN "Trip" t ON t.id = te."tripId"
        JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
        WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $2
        GROUP BY DATE(te."createdAt")
        UNION ALL
        SELECT DATE(e."createdAt") AS day, COUNT(*) AS cnt
        FROM "Event" e
        JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
        WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $2
        GROUP BY DATE(e."createdAt")
      ) raw GROUP BY day
    )
    SELECT
      d.day::text,
      0::int                              AS visitors,
      COALESCE(ev.itinerary_views,0)::int AS itinerary_views,
      COALESCE(sl.sales,0)::int           AS sales,
      COALESCE(sl.revenue,0)::float       AS revenue,
      COALESCE(dl.downloads,0)::int       AS downloads
    FROM d
    LEFT JOIN ev ON ev.day = d.day
    LEFT JOIN sl ON sl.day = d.day
    LEFT JOIN dl ON dl.day = d.day
    ORDER BY d.day
  `, [cutoff, creatorId]);
  return rows;
}

// ── Funnel ────────────────────────────────────────────────────────────────────
async function getFunnelData(pool, cutoff, creatorId = null) {
  if (!creatorId) {
    const [v, iv, dl, p] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
      pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
      pool.query(`
        SELECT COALESCE(SUM(n),0) AS n FROM (
          SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
          UNION ALL
          SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_DOWNLOAD' AND "createdAt" >= $1
        ) counts
      `, [cutoff]),
      pool.query(`SELECT COUNT(*) AS n FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
    ]);
    return {
      visitors:       parseInt(v.rows[0].n, 10)  || 0,
      itineraryViews: parseInt(iv.rows[0].n, 10) || 0,
      downloads:      parseInt(dl.rows[0].n, 10) || 0,
      purchases:      parseInt(p.rows[0].n, 10)  || 0,
    };
  }

  const [v, iv, dl, p] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`
      SELECT COUNT(*) AS n FROM "Event" e
      JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1 AND i.creator_id = $2
    `, [cutoff, creatorId]),
    pool.query(`
      SELECT COALESCE(SUM(n),0) AS n FROM (
        SELECT COUNT(*) AS n FROM "TripEvent" te
        LEFT JOIN "Trip" t ON t.id = te."tripId"
        JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
        WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $2
        UNION ALL
        SELECT COUNT(*) AS n FROM "Event" e
        JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
        WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $2
      ) counts
    `, [cutoff, creatorId]),
    pool.query(`
      SELECT COUNT(*) AS n FROM "Purchase" p
      JOIN "Itinerary" i ON i.id = p."itineraryId"
      WHERE p."purchasedAt" >= $1 AND i.creator_id = $2
    `, [cutoff, creatorId]),
  ]);
  return {
    visitors:       parseInt(v.rows[0].n, 10)  || 0,
    itineraryViews: parseInt(iv.rows[0].n, 10) || 0,
    downloads:      parseInt(dl.rows[0].n, 10) || 0,
    purchases:      parseInt(p.rows[0].n, 10)  || 0,
  };
}

// ── Top itineraries ───────────────────────────────────────────────────────────
async function getTopItineraries(pool, cutoff, creatorId = null) {
  const params = [cutoff];
  if (creatorId) params.push(creatorId);
  const creatorWhere = creatorId ? `AND i.creator_id = $2` : '';

  const { rows } = await pool.query(`
    SELECT
      i.slug, i.title, i.price,
      COALESCE(v.views,0)     AS views,
      COALESCE(d.downloads,0) AS downloads,
      COALESCE(s.sales,0)     AS sales,
      COALESCE(s.revenue,0)   AS revenue
    FROM "Itinerary" i
    LEFT JOIN (
      SELECT "itinerarySlug", COUNT(*) AS views
      FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1
      GROUP BY "itinerarySlug"
    ) v ON v."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT slug, SUM(cnt) AS downloads FROM (
        -- Authenticated downloads (TripEvent → Trip → itinerarySlug)
        SELECT t."itinerarySlug" AS slug, COUNT(*) AS cnt
        FROM "TripEvent" te
        JOIN "Trip" t ON t.id = te."tripId"
        WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
          AND t."itinerarySlug" IS NOT NULL
        GROUP BY t."itinerarySlug"
        UNION ALL
        -- Anonymous downloads (Event → itinerarySlug)
        SELECT "itinerarySlug" AS slug, COUNT(*) AS cnt
        FROM "Event"
        WHERE "eventType"='ITINERARY_DOWNLOAD' AND "createdAt" >= $1
          AND "itinerarySlug" IS NOT NULL
        GROUP BY "itinerarySlug"
      ) raw GROUP BY slug
    ) d ON d.slug = i.slug
    LEFT JOIN (
      SELECT "itineraryId",
        COUNT(*) AS sales,
        COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= $1
      GROUP BY "itineraryId"
    ) s ON s."itineraryId" = i.id
    WHERE 1=1 ${creatorWhere}
    ORDER BY COALESCE(s.sales,0) DESC, COALESCE(d.downloads,0) DESC, COALESCE(v.views,0) DESC
    LIMIT 20
  `, params);
  return rows.map(r => ({
    ...r,
    conversionRate: r.views > 0 ? +((r.sales / r.views) * 100).toFixed(1) : 0,
  }));
}

// ── Traffic sources ───────────────────────────────────────────────────────────
async function getTrafficSources(pool, cutoff) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(source), ''), 'direct') AS source,
      COUNT(*) FILTER (WHERE "eventType"='PAGE_VIEW')      AS visitors,
      COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW') AS itinerary_views,
      COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL) AS users
    FROM "Event"
    WHERE "createdAt" >= $1
    GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'direct')
    ORDER BY visitors DESC
    LIMIT 10
  `, [cutoff]);
  return rows;
}

// ── Recent activity ───────────────────────────────────────────────────────────
async function getRecentActivity(pool, cutoff, creatorId = null) {
  if (!creatorId) {
    const { rows } = await pool.query(`
      (
        SELECT 'signup' AS type, u.email, u.name, NULL::text AS country, NULL::text AS detail, u."createdAt" AS ts
        FROM "User" u
        WHERE u."createdAt" >= $1
        ORDER BY ts DESC LIMIT 15
      ) UNION ALL (
        SELECT 'download' AS type,
          u.email,
          u.name,
          NULL::text AS country,
          COALESCE(te.metadata->>'title', te.metadata->>'destination', 'trip') AS detail,
          te."createdAt" AS ts
        FROM "TripEvent" te
        LEFT JOIN "User" u ON u.id = te."userId"
        WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
        ORDER BY ts DESC LIMIT 15
      ) UNION ALL (
        SELECT 'download' AS type,
          NULL::text AS email,
          NULL::text AS name,
          NULL::text AS country,
          COALESCE(e.metadata->>'title', e.metadata->>'destination', e."itinerarySlug", 'itinerary') AS detail,
          e."createdAt" AS ts
        FROM "Event" e
        WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= $1
        ORDER BY ts DESC LIMIT 15
      ) UNION ALL (
        SELECT 'purchase' AS type,
          COALESCE(u.email, '') AS email,
          COALESCE(u.name,  '') AS name,
          NULL::text AS country,
          COALESCE(i.title,
            'Custom trip planning' ||
            CASE WHEN cr.destination IS NOT NULL AND cr.destination <> ''
                 THEN ' — ' || cr.destination ELSE '' END
          ) AS detail,
          p."purchasedAt" AS ts
        FROM "Purchase" p
        LEFT JOIN "User"          u  ON u.id  = p."userId"
        LEFT JOIN "Itinerary"     i  ON i.id  = p."itineraryId"
        LEFT JOIN "CustomRequest" cr ON cr.id = p."customRequestId"
        WHERE p."purchasedAt" >= $1
        ORDER BY ts DESC LIMIT 15
      ) UNION ALL (
        SELECT 'itinerary_view' AS type, u.email, u.name, e.country, e."itinerarySlug" AS detail, e."createdAt" AS ts
        FROM "Event" e
        LEFT JOIN "User" u ON u.id = e."userId"
        WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1
        ORDER BY ts DESC LIMIT 15
      )
      ORDER BY ts DESC LIMIT 50
    `, [cutoff]);
    return rows;
  }

  // Creator-filtered activity: downloads and purchases for their itineraries; global signups
  const { rows } = await pool.query(`
    (
      SELECT 'signup' AS type, u.email, u.name, NULL::text AS country, NULL::text AS detail, u."createdAt" AS ts
      FROM "User" u
      WHERE u."createdAt" >= $1
      ORDER BY ts DESC LIMIT 10
    ) UNION ALL (
      SELECT 'download' AS type,
        u.email, u.name, NULL::text AS country,
        COALESCE(te.metadata->>'title', te.metadata->>'destination', 'trip') AS detail,
        te."createdAt" AS ts
      FROM "TripEvent" te
      LEFT JOIN "User" u ON u.id = te."userId"
      LEFT JOIN "Trip" t ON t.id = te."tripId"
      JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $2
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'download' AS type,
        NULL::text AS email, NULL::text AS name, NULL::text AS country,
        COALESCE(e.metadata->>'title', e.metadata->>'destination', e."itinerarySlug", 'itinerary') AS detail,
        e."createdAt" AS ts
      FROM "Event" e
      JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      WHERE e."eventType"='ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $2
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'purchase' AS type,
        COALESCE(u.email, '') AS email,
        COALESCE(u.name,  '') AS name,
        NULL::text AS country,
        i.title AS detail,
        p."purchasedAt" AS ts
      FROM "Purchase" p
      JOIN "Itinerary" i ON i.id = p."itineraryId"
      LEFT JOIN "User" u ON u.id = p."userId"
      WHERE p."purchasedAt" >= $1 AND i.creator_id = $2
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'itinerary_view' AS type, u.email, u.name, e.country, e."itinerarySlug" AS detail, e."createdAt" AS ts
      FROM "Event" e
      JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      LEFT JOIN "User" u ON u.id = e."userId"
      WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1 AND i.creator_id = $2
      ORDER BY ts DESC LIMIT 15
    )
    ORDER BY ts DESC LIMIT 50
  `, [cutoff, creatorId]);
  return rows;
}

// ── Users list ────────────────────────────────────────────────────────────────
async function getUsersList(pool, q, offset) {
  const like = `%${q}%`;
  const { rows: users } = await pool.query(`
    SELECT
      u.id, u.email, u.name, u."createdAt",
      COALESCE(dl.downloads, 0)    AS downloads,
      COALESCE(pu.purchases, 0)    AS purchases,
      COALESCE(pu.revenue, 0)      AS revenue,
      GREATEST(u."createdAt", dl.last_download, pu.last_purchase) AS last_activity
    FROM "User" u
    LEFT JOIN (
      SELECT "userId", COUNT(*) AS downloads, MAX("createdAt") AS last_download
      FROM "TripEvent" WHERE "eventType"='DOWNLOADED'
      GROUP BY "userId"
    ) dl ON dl."userId" = u.id
    LEFT JOIN (
      SELECT "userId",
        COUNT(*) AS purchases,
        COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue,
        MAX("purchasedAt") AS last_purchase
      FROM "Purchase"
      GROUP BY "userId"
    ) pu ON pu."userId" = u.id
    WHERE u.email ILIKE $1 OR u.name ILIKE $1
    ORDER BY u."createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [like, offset]);

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*) AS total FROM "User" WHERE email ILIKE $1 OR name ILIKE $1`, [like]
  );
  return { users, total: parseInt(total, 10) };
}

// ── User detail ───────────────────────────────────────────────────────────────
async function getUserDetail(pool, id) {
  const [userRes, purchasesRes, eventsRes, tripEventsRes] = await Promise.all([
    pool.query(`
      SELECT u.id, u.email, u.name, u."createdAt", u."clerkId",
        COALESCE(pu.purchases, 0) AS purchases,
        COALESCE(dl.downloads, 0) AS downloads,
        COALESCE(pu.revenue, 0)   AS revenue
      FROM "User" u
      LEFT JOIN (
        SELECT "userId",
          COUNT(*) AS purchases,
          COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
        FROM "Purchase" GROUP BY "userId"
      ) pu ON pu."userId" = u.id
      LEFT JOIN (
        SELECT "userId", COUNT(*) AS downloads
        FROM "TripEvent" WHERE "eventType"='DOWNLOADED' GROUP BY "userId"
      ) dl ON dl."userId" = u.id
      WHERE u.id = $1
    `, [id]),
    pool.query(`
      SELECT p."purchasedAt", p.amount, p.status, i.title, i.slug
      FROM "Purchase" p JOIN "Itinerary" i ON i.id=p."itineraryId"
      WHERE p."userId"=$1 ORDER BY p."purchasedAt" DESC
    `, [id]),
    pool.query(`
      SELECT id, "eventType", "pagePath", "itinerarySlug", source, "deviceType", "createdAt"
      FROM "Event" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 100
    `, [id]),
    pool.query(`
      SELECT te.id, te."eventType", te.metadata, te."createdAt",
        t.title, t.destination, t.source AS trip_source, t."itinerarySlug"
      FROM "TripEvent" te LEFT JOIN "Trip" t ON t.id=te."tripId"
      WHERE te."userId"=$1 ORDER BY te."createdAt" DESC
    `, [id]),
  ]);

  const user = userRes.rows[0];
  if (!user) return null;

  // Build chronological journey
  const journey = [
    { type: 'signup',   ts: user.createdAt, detail: 'Account created' },
    ...purchasesRes.rows.map(p => ({
      type: 'purchase', ts: p.purchasedAt, detail: p.title, amount: p.amount, slug: p.slug,
    })),
    ...tripEventsRes.rows.map(te => ({
      type:    te.eventType === 'DOWNLOADED' ? 'download' : te.eventType === 'SAVED' ? 'saved' : 'deleted',
      ts:      te.createdAt,
      detail:  te.title || te.metadata?.title || te.destination || 'trip',
      slug:    te.itinerarySlug,
      source:  te.trip_source,
    })),
    ...eventsRes.rows.map(e => ({
      type:   e.eventType === 'ITINERARY_VIEW' ? 'itinerary_view' : 'page_view',
      ts:     e.createdAt,
      detail: e.itinerarySlug || e.pagePath || '',
      source: e.source,
      device: e.deviceType,
    })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return { user, purchases: purchasesRes.rows, journey };
}

// ── Sales ─────────────────────────────────────────────────────────────────────
async function getSales(pool, cutoff, offset, creatorId = null) {
  const creatorJoin  = creatorId ? `JOIN "Itinerary" ci ON ci.id = p."itineraryId" AND ci.creator_id = $3` : '';
  const creatorParam = creatorId ? [cutoff, offset, creatorId] : [cutoff, offset];

  // ── Sales rows ────────────────────────────────────────────────────────────
  let sales;
  try {
    const { rows } = await pool.query(`
      SELECT p."purchasedAt",
             COALESCE(u.email, '') AS email,
             COALESCE(u.name,  '') AS name,
             COALESCE(i.title,
               'Custom trip planning' ||
               CASE WHEN cr.destination IS NOT NULL AND cr.destination <> ''
                    THEN ' — ' || cr.destination ELSE '' END
             ) AS itinerary,
             i.slug,
             p.amount,
             COALESCE(p."grossAmount", p.amount)  AS "grossAmount",
             COALESCE(p."discountAmount", 0)       AS "discountAmount",
             p."couponCode",
             p.status
      FROM "Purchase" p
      ${creatorJoin}
      LEFT JOIN "User"          u  ON u.id  = p."userId"
      LEFT JOIN "Itinerary"     i  ON i.id  = p."itineraryId"
      LEFT JOIN "CustomRequest" cr ON cr.id = p."customRequestId"
      WHERE p."purchasedAt" >= $1
      ORDER BY p."purchasedAt" DESC
      LIMIT 50 OFFSET $2
    `, creatorParam);
    sales = rows;
  } catch (err) {
    if (!err.message.toLowerCase().includes('column')) throw err;
    const { rows } = await pool.query(`
      SELECT p."purchasedAt",
             COALESCE(u.email, '') AS email,
             COALESCE(u.name,  '') AS name,
             COALESCE(i.title, 'Custom trip planning') AS itinerary,
             i.slug,
             p.amount, p.amount AS "grossAmount", 0 AS "discountAmount",
             NULL::text AS "couponCode", p.status
      FROM "Purchase" p
      ${creatorJoin}
      LEFT JOIN "User"      u ON u.id = p."userId"
      LEFT JOIN "Itinerary" i ON i.id = p."itineraryId"
      WHERE p."purchasedAt" >= $1
      ORDER BY p."purchasedAt" DESC
      LIMIT 50 OFFSET $2
    `, creatorParam);
    sales = rows;
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalsCreatorJoin  = creatorId ? `JOIN "Itinerary" ci ON ci.id = p."itineraryId" AND ci.creator_id = $2` : '';
  const totalsCreatorParam = creatorId ? [cutoff, creatorId] : [cutoff];

  const { rows: [{ total, revenue }] } = await pool.query(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
    FROM "Purchase" p ${totalsCreatorJoin} WHERE p."purchasedAt" >= $1
  `, totalsCreatorParam);

  const discountTotals = await pool.query(`
    SELECT COALESCE(SUM(COALESCE("discountAmount", 0)),0) AS total_discount
    FROM "Purchase" p ${totalsCreatorJoin} WHERE p."purchasedAt" >= $1
  `, totalsCreatorParam).then(r => r.rows[0]).catch(() => ({ total_discount: 0 }));

  // All-time totals (also scoped to creator when filter active)
  const allTimeCreatorJoin  = creatorId ? `JOIN "Itinerary" ci ON ci.id = p."itineraryId" AND ci.creator_id = $1` : '';
  const allTimeCreatorParam = creatorId ? [creatorId] : [];

  const { rows: [allTime] } = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue FROM "Purchase" p ${allTimeCreatorJoin}`,
    allTimeCreatorParam
  );
  const allTimeDiscount = await pool.query(
    `SELECT COALESCE(SUM(COALESCE("discountAmount", 0)),0) AS total_discount FROM "Purchase" p ${allTimeCreatorJoin}`,
    allTimeCreatorParam
  ).then(r => parseFloat(r.rows[0].total_discount) || 0).catch(() => 0);

  return {
    sales,
    total:           parseInt(total, 10),
    revenue:         parseFloat(revenue),
    totalDiscount:   parseFloat(discountTotals.total_discount) || 0,
    allTimeRevenue:  parseFloat(allTime.revenue),
    allTimeDiscount,
    avgOrderValue:   total > 0 ? +(parseFloat(revenue) / parseInt(total,10)).toFixed(2) : 0,
  };
}

// ── Custom Requests ───────────────────────────────────────────────────────────
// noLimit=true: fetch all rows (used by admin/designer table with client-side filtering).
// ctx drives role-based filtering: designer sees only their own requests.
// No server-side status/payment/itinerary filtering — all filtering is client-side.
async function getCustomRequests(pool, statusParam, offset, noLimit = false, ctx = null) {
  const isAdmin        = ctx?.isAdmin ?? true;
  const designerUserId = !isAdmin ? (ctx?.userId ?? null) : null;

  console.log('[getCustomRequests] START | userId:', ctx?.userId,
    '| role:', ctx?.role, '| isAdmin:', isAdmin, '| designerUserId:', designerUserId);

  // Build WHERE — admin sees ALL rows (no filters), designer sees only their own.
  const conditions = [];
  const params     = [];

  if (designerUserId) {
    params.push(designerUserId);
    conditions.push(`cr."designerId" = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  console.log('[getCustomRequests] whereClause:', whereClause || '(none — returning all rows)');

  let limitClause = '';
  if (!noLimit) {
    params.push(offset);
    limitClause = `LIMIT 50 OFFSET $${params.length}`;
  }

  const designerSelect = isAdmin
    ? `, d.name AS "designerName", d.email AS "designerEmail"`
    : '';
  const designerJoin = isAdmin
    ? `LEFT JOIN "User" d ON d.id = cr."designerId"`
    : '';

  // Two variants of the paid-exists subquery:
  // FULL uses Purchase.customRequestId added in migration 20260504 — may not exist in prod yet.
  // SAFE falls back to itineraryId-only check for pre-migration databases.
  const PAID_EXISTS_FULL = `
    EXISTS (
      SELECT 1 FROM "Purchase" p
      WHERE (p."customRequestId" = cr.id
             OR (cr."itineraryId" IS NOT NULL AND p."itineraryId" = cr."itineraryId"))
        AND (p.status IS NULL OR p.status NOT IN ('refunded', 'cancelled', 'chargebacked'))
    )`;

  const PAID_EXISTS_SAFE = `
    EXISTS (
      SELECT 1 FROM "Purchase" p
      WHERE cr."itineraryId" IS NOT NULL AND p."itineraryId" = cr."itineraryId"
    )`;

  async function runQuery(paidExists, paxCols) {
    return pool.query(
      `SELECT
         cr.id, cr."fullName", cr.email, cr.phone, cr.destination, cr.dates, cr.duration,
         cr."groupSize", ${paxCols}
         cr."groupType", cr.budget, cr.style, cr.notes, cr.status,
         cr."itineraryId", cr."designerId", cr."createdAt",
         cr."paidAt", cr."quoteSentAt", cr."quoteAmount", cr."stripePaymentUrl",
         CASE
           WHEN cr."paidAt" IS NOT NULL THEN 'paid'
           WHEN cr."quoteSentAt" IS NOT NULL THEN 'quote_sent'
           ELSE 'unpaid'
         END AS "paymentStatus",
         itin.slug   AS "linkedItinerarySlug",
         itin.status AS "linkedItineraryStatus",
         itin.title  AS "linkedItineraryTitle",
         (cr."paidAt" IS NOT NULL OR ${paidExists}) AS "isPaid"
         ${designerSelect}
       FROM "CustomRequest" cr
       LEFT JOIN "Itinerary" itin ON itin.id = cr."itineraryId"
       ${designerJoin}
       ${whereClause}
       ORDER BY cr."createdAt" DESC
       ${limitClause}`,
      params
    );
  }

  // Try full query (with new columns from migration); fall back on column-not-found (code 42703)
  let requests;
  try {
    const { rows } = await runQuery(PAID_EXISTS_FULL, `cr."paxMin", cr."paxMax",`);
    requests = rows;
    console.log('[getCustomRequests] full query OK | rows:', rows.length);
  } catch (err) {
    if (err.code !== '42703' && !err.message.toLowerCase().includes('column')) throw err;
    console.warn('[getCustomRequests] column missing (code:', err.code, '):', err.message,
      '— migration not yet applied, retrying with safe fallback');
    const { rows } = await runQuery(
      PAID_EXISTS_SAFE,
      `NULL::integer AS "paxMin", NULL::integer AS "paxMax",`
    );
    requests = rows;
    console.log('[getCustomRequests] safe fallback query OK | rows:', rows.length);
  }

  console.log('[getCustomRequests] returning', requests.length, 'rows | first 3:',
    JSON.stringify(requests.slice(0, 3).map(r => ({
      id: r.id, fullName: r.fullName, email: r.email,
      destination: r.destination, dates: r.dates,
      groupSize: r.groupSize, designerId: r.designerId, paymentStatus: r.paymentStatus,
    }))));

  // Count queries scoped to the same designer filter.
  const countParams = designerUserId ? [designerUserId] : [];
  const countWhere  = designerUserId ? `WHERE "designerId" = $1` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*) AS total FROM "CustomRequest" ${countWhere}`,
    countParams
  );
  const total = parseInt(countRes.rows[0].total, 10);

  const countsRes = await pool.query(
    `SELECT status, COUNT(*) AS n FROM "CustomRequest" ${countWhere} GROUP BY status`,
    countParams
  );
  const counts = { open: 0, in_progress: 0, done: 0, all: 0 };
  for (const row of countsRes.rows) {
    if (['open', 'in_progress', 'done'].includes(row.status)) {
      counts[row.status] = parseInt(row.n, 10);
    }
    counts.all += parseInt(row.n, 10);
  }

  // Payment counts — use paidAt/quoteSentAt directly; no dependency on Purchase.customRequestId.
  // Designers list — admin only.
  let paymentCounts = { paid: 0, quote_sent: 0, unpaid: 0 };
  let designers     = [];

  if (isAdmin) {
    const paymentRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE "paidAt" IS NOT NULL) AS paid,
         COUNT(*) FILTER (WHERE "quoteSentAt" IS NOT NULL AND "paidAt" IS NULL) AS quote_sent,
         COUNT(*) FILTER (WHERE "quoteSentAt" IS NULL AND "paidAt" IS NULL) AS unpaid
       FROM "CustomRequest"`
    );
    paymentCounts = {
      paid:       parseInt(paymentRes.rows[0].paid,       10) || 0,
      quote_sent: parseInt(paymentRes.rows[0].quote_sent, 10) || 0,
      unpaid:     parseInt(paymentRes.rows[0].unpaid,     10) || 0,
    };

    const { rows: designerRows } = await pool.query(
      `SELECT id, name, email FROM "User" WHERE role = 'designer' ORDER BY name ASC`
    );
    designers = designerRows;
  }

  return { requests, total, counts, paymentCounts, designers };
}

// ── Downloads ─────────────────────────────────────────────────────────────────
// getDownloads — returns all download events including anonymous.
// Two sources:
//   TripEvent with eventType='DOWNLOADED'      → authenticated user downloads (userId required by schema)
//   Event      with eventType='ITINERARY_DOWNLOAD' → anonymous downloads (userId nullable)
// Both queries use LEFT JOIN on User so null userId rows are never dropped.
async function getDownloads(pool, cutoff, offset, creatorId = null) {
  if (!creatorId) {
    const { rows: downloads } = await pool.query(`
      -- Authenticated downloads (TripEvent)
      SELECT
        te."createdAt",
        u.email,
        u.name,
        COALESCE(t.title, te.metadata->>'title', te.metadata->>'destination') AS title,
        COALESCE(t."itinerarySlug", te.metadata->>'itinerarySlug')             AS "itinerarySlug",
        COALESCE(t.source, te.metadata->>'source')                             AS trip_source,
        COALESCE(t.destination, te.metadata->>'destination')                   AS destination
      FROM "TripEvent" te
      LEFT JOIN "User" u ON u.id = te."userId"
      LEFT JOIN "Trip" t ON t.id = te."tripId"
      WHERE te."eventType" = 'DOWNLOADED' AND te."createdAt" >= $1

      UNION ALL

      -- Anonymous / tracked downloads (Event table)
      SELECT
        e."createdAt",
        u.email,
        u.name,
        COALESCE(i.title, e.metadata->>'title', e.metadata->>'destination') AS title,
        e."itinerarySlug",
        COALESCE(e.metadata->>'source', i.type)                             AS trip_source,
        COALESCE(i.destination, e.metadata->>'destination')                 AS destination
      FROM "Event" e
      LEFT JOIN "User" u ON u.id = e."userId"
      LEFT JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      WHERE e."eventType" = 'ITINERARY_DOWNLOAD' AND e."createdAt" >= $1

      ORDER BY "createdAt" DESC
      LIMIT 50 OFFSET $2
    `, [cutoff, offset]);

    const { rows: [{ total }] } = await pool.query(`
      SELECT COUNT(*) AS total FROM (
        SELECT id FROM "TripEvent"
        WHERE "eventType" = 'DOWNLOADED' AND "createdAt" >= $1
        UNION ALL
        SELECT id FROM "Event"
        WHERE "eventType" = 'ITINERARY_DOWNLOAD' AND "createdAt" >= $1
      ) combined
    `, [cutoff]);

    return { downloads, total: parseInt(total, 10) };
  }

  // Creator-filtered: show downloads for that creator's itineraries only
  const { rows: downloads } = await pool.query(`
    -- Authenticated downloads for creator's itineraries
    SELECT
      te."createdAt",
      u.email,
      u.name,
      COALESCE(t.title, i.title, te.metadata->>'title') AS title,
      COALESCE(t."itinerarySlug", i.slug)               AS "itinerarySlug",
      COALESCE(t.source, te.metadata->>'source')        AS trip_source,
      COALESCE(t.destination, i.destination, te.metadata->>'destination') AS destination
    FROM "TripEvent" te
    LEFT JOIN "User" u ON u.id = te."userId"
    LEFT JOIN "Trip" t ON t.id = te."tripId"
    LEFT JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
    WHERE te."eventType" = 'DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $3

    UNION ALL

    -- Anonymous downloads for creator's itineraries
    SELECT
      e."createdAt",
      u.email,
      u.name,
      i.title,
      e."itinerarySlug",
      i.type AS trip_source,
      i.destination
    FROM "Event" e
    LEFT JOIN "User" u ON u.id = e."userId"
    JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
    WHERE e."eventType" = 'ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $3

    ORDER BY "createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [cutoff, offset, creatorId]);

  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*) AS total FROM (
      SELECT te.id FROM "TripEvent" te
      LEFT JOIN "Trip" t ON t.id = te."tripId"
      JOIN "Itinerary" i ON i.slug = t."itinerarySlug"
      WHERE te."eventType" = 'DOWNLOADED' AND te."createdAt" >= $1 AND i.creator_id = $2
      UNION ALL
      SELECT e.id FROM "Event" e
      JOIN "Itinerary" i ON i.slug = e."itinerarySlug"
      WHERE e."eventType" = 'ITINERARY_DOWNLOAD' AND e."createdAt" >= $1 AND i.creator_id = $2
    ) combined
  `, [cutoff, creatorId]);

  return { downloads, total: parseInt(total, 10) };
}

// ── Designer application emails ───────────────────────────────────────────────
async function sendApplicantEmail(email, fullName, verdict) {
  if (!process.env.RESEND_API_KEY) return;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const isApproved = verdict === 'approved';
  const subject = isApproved
    ? 'Your HiddenAtlas designer application has been approved'
    : 'Update on your HiddenAtlas designer application';

  const bodyHtml = isApproved
    ? `<p>Hi ${esc(fullName)},</p>
       <p>We are pleased to let you know that your application to become a HiddenAtlas travel designer has been approved. Your designer profile is now active.</p>
       <p>You can access your designer portal at <a href="https://hiddenatlas.travel/admin" style="color:#1B6B65;">hiddenatlas.travel/admin</a>.</p>
       <p>Welcome to the team.</p>`
    : `<p>Hi ${esc(fullName)},</p>
       <p>Thank you for applying to become a HiddenAtlas travel designer. After careful review, we are not able to move forward with your application at this time.</p>
       <p>You are welcome to submit a new application in the future if you would like us to review it again.</p>
       <p>Thank you for your interest in HiddenAtlas.</p>`;

  await resend.emails.send({
    from:    process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>',
    to:      [email],
    subject,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;line-height:1.7;">${bodyHtml}<p style="margin-top:32px;color:#8C8070;font-size:13px;">The HiddenAtlas Team</p></div>`,
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Creator Acquisition CRM ───────────────────────────────────────────────────

const PIPELINE_STATUSES = [
  'identified','qualified','message_prepared','contacted','replied',
  'interested','proposal_sent','demo_scheduled','accepted','onboarding',
  'itinerary_in_creation','active','rejected','follow_up_later','blocked','not_fit',
];

// ── CRM action dispatcher ─────────────────────────────────────────────────────
async function dispatchCrmAction(pool, action, payload, ctx) {
  switch (action) {
    case 'dashboard.stats':            return crmDashboard(pool);
    case 'discovery.listRuns':         return crmListRuns(pool);
    case 'discovery.getRun':           return crmGetRun(pool, payload.id);
    case 'discovery.createRun':        return crmCreateRun(pool, payload, ctx);
    case 'discovery.importResults':    return crmImportResults(pool, payload, ctx);
    case 'discovery.addToCrm':         return crmAddToCrm(pool, payload, ctx);
    case 'discovery.setResultStatus':  return crmSetResultStatus(pool, payload.id, payload.status);
    case 'discovery.addResultToCrm':  return crmAddToCrm(pool, { resultId: payload.id ?? payload.resultId }, ctx);
    case 'discovery.ignoreResult':    return crmSetResultStatus(pool, payload.id, 'ignored');
    case 'discovery.blockResult':     return crmSetResultStatus(pool, payload.id, 'blocked');
    case 'discovery.markCompleted':   return crmMarkRunCompleted(pool, payload.id);
    case 'discovery.aiSearchProfiles':  return crmAiSearchProfiles(pool, payload, ctx);
    case 'discovery.metaValidateConfig': return crmMetaValidateConfig(pool, payload);
    case 'discovery.metaBusinessDiscovery': return crmMetaBusinessDiscovery(pool, payload, ctx);
    case 'discovery.verifyProfile':      return crmVerifyProfile(pool, payload, ctx);
    case 'discovery.verifyAllProfiles':  return crmVerifyAllProfiles(pool, payload, ctx);
    case 'leads.list':                 return crmListLeads(pool, payload);
    case 'leads.get':                  return crmGetLead(pool, payload.id);
    case 'leads.update':               return crmUpdateLead(pool, payload.id, payload, ctx);
    case 'leads.changeStatus':         return crmChangeStatus(pool, payload.id, payload, ctx);
    case 'leads.addNote':              return crmAddNote(pool, payload.id, payload, ctx);
    case 'leads.createTask':           return crmCreateTask(pool, payload.id, payload, ctx);
    case 'leads.updateTask':           return crmUpdateTask(pool, payload.taskId, payload, ctx);
    case 'leads.refreshInstagram':    return crmRefreshInstagram(pool, payload, ctx);
    case 'leads.bulkChangeStatus':    return crmBulkChangeStatus(pool, payload, ctx);
    case 'leads.create':              return crmCreateLead(pool, payload, ctx);
    case 'leads.importInstagram':     return crmImportInstagramLead(pool, payload, ctx);
    case 'debug.metaDiscovery':       return debugMetaDiscovery(payload, ctx);
    case 'messages.listTemplates':     return crmListTemplates(pool, payload.platform, payload.language);
    case 'messages.createTemplate':    return crmCreateTemplate(pool, payload, ctx);
    case 'messages.updateTemplate':    return crmUpdateTemplate(pool, payload.id, payload);
    case 'messages.generateForLead':   return crmGenerateMessage(pool, payload.id, payload);
    case 'messages.saveForLead':       return crmSaveMessage(pool, payload.id, payload, ctx);
    case 'messages.markCopied':        return crmMarkCopied(pool, payload.msgId);
    case 'messages.markSent':          return crmMarkSent(pool, payload.msgId, ctx);
    default:
      throw Object.assign(new Error(`Unknown CRM action: ${action}`), { status: 400 });
  }
}

// ── Admin debug: Meta Discovery connection test ───────────────────────────────
async function debugMetaDiscovery(payload, ctx) {
  if (!ctx.isAdmin) throw Object.assign(new Error('Admin only'), { status: 403 });

  const version   = process.env.META_GRAPH_API_VERSION || 'v25.0';
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  const pageTok   = process.env.META_PAGE_ACCESS_TOKEN;
  const graphTok  = process.env.META_GRAPH_ACCESS_TOKEN;
  const igTok     = process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const token     = pageTok || graphTok || igTok;
  const tokenVar  = pageTok ? 'META_PAGE_ACCESS_TOKEN'
                  : graphTok ? 'META_GRAPH_ACCESS_TOKEN'
                  : igTok ? 'META_INSTAGRAM_ACCESS_TOKEN'
                  : null;

  const envInfo = {
    NODE_ENV:                         process.env.NODE_ENV ?? null,
    VERCEL_ENV:                       process.env.VERCEL_ENV ?? null,
    VERCEL_URL:                       process.env.VERCEL_URL ?? null,
    VERCEL_GIT_COMMIT_SHA:            (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 8) || null,
    'META_INSTAGRAM_ACCOUNT_ID':      accountId ?? null,
    'META_PAGE_ACCESS_TOKEN exists':  Boolean(pageTok),
    'META_GRAPH_ACCESS_TOKEN exists': Boolean(graphTok),
    tokenSourceSelected:              tokenVar ?? '(none — no token env var found)',
    tokenLength:                      token?.length ?? 0,
    tokenPrefix:                      token ? token.slice(0, 8) : null,
    tokenSuffix:                      token ? token.slice(-4)   : null,
    graphEndpoint:                    `graph.facebook.com/${version}`,
  };

  if (!token || !accountId) {
    return { ok: false, envInfo, error: 'Token or accountId missing — see envInfo above' };
  }

  const BASE = `https://graph.facebook.com/${version}`;

  // Test 1: GET /me (verifies token is valid at all)
  let meTest = null;
  try {
    const url = `${BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const d   = await r.json();
    meTest = d.error
      ? { ok: false, httpStatus: r.status, errorCode: d.error.code, errorSubcode: d.error.error_subcode, errorMsg: d.error.message }
      : { ok: true,  httpStatus: r.status, id: d.id, name: d.name };
  } catch (e) {
    meTest = { ok: false, threw: e.message };
  }

  // Test 2: Business Discovery for a known public profile
  const testUsername = payload?.username || 'rotasdabruna';
  const fieldset = 'id,username,name,biography,followers_count,media_count,profile_picture_url,website';
  let discoveryTest = null;
  try {
    const fields    = `business_discovery.username(${testUsername}){${fieldset}}`;
    const safeUrl   = `${BASE}/${accountId}?fields=${encodeURIComponent(fields)}`;
    const fullUrl   = `${safeUrl}&access_token=${encodeURIComponent(token)}`;
    const r         = await fetch(fullUrl, { signal: AbortSignal.timeout(15_000) });
    const d         = await r.json();
    discoveryTest = d.error
      ? { ok: false, httpStatus: r.status, errorCode: d.error.code, errorSubcode: d.error.error_subcode, errorMsg: d.error.message, endpointWithoutToken: safeUrl }
      : { ok: true,  httpStatus: r.status, profile: d?.[accountId]?.business_discovery ?? d?.business_discovery ?? d, endpointWithoutToken: safeUrl };
  } catch (e) {
    discoveryTest = { ok: false, threw: e.message };
  }

  console.info('[MetaDiscovery] debugMetaDiscovery result:', {
    envInfo, meTest, discoveryTest: { ...discoveryTest, profile: discoveryTest?.ok ? '(see response)' : undefined },
  });

  return { ok: meTest?.ok && discoveryTest?.ok, envInfo, meTest, discoveryTest };
}

async function crmDashboard(pool) {
  const [statsRows, overdueRows, avgRows, recentTasks] = await Promise.all([
    pool.query(`
      SELECT status, COUNT(*) AS count
      FROM "CreatorLead"
      GROUP BY status
    `),
    pool.query(`
      SELECT COUNT(*) AS count FROM "CreatorLead"
      WHERE "nextFollowUpAt" < NOW()
        AND status NOT IN ('rejected','blocked','not_fit','active')
    `),
    pool.query(`SELECT ROUND(AVG(score)::numeric, 1) AS avg_score FROM "CreatorLead" WHERE score IS NOT NULL`),
    pool.query(`
      SELECT t.*, l."displayName", l.username, l.platform
      FROM "CreatorLeadTask" t
      JOIN "CreatorLead" l ON l.id = t."leadId"
      WHERE t.status = 'open'
      ORDER BY t."dueAt" ASC NULLS LAST
      LIMIT 10
    `),
  ]);

  const byStatus = {};
  let totalLeads = 0;
  for (const row of statsRows.rows) {
    byStatus[row.status] = parseInt(row.count, 10);
    totalLeads += parseInt(row.count, 10);
  }

  return {
    totalLeads,
    byStatus,
    overdueFollowUps: parseInt(overdueRows.rows[0]?.count ?? 0, 10),
    avgScore: parseFloat(avgRows.rows[0]?.avg_score ?? 0) || 0,
    upcomingTasks: recentTasks.rows,
  };
}

async function crmListRuns(pool) {
  const { rows } = await pool.query(`
    SELECT r.*,
      COUNT(res.id)                                         AS "resultCount",
      COUNT(CASE WHEN res.status = 'added_to_crm' THEN 1 END) AS "addedCount"
    FROM "CreatorDiscoveryRun" r
    LEFT JOIN "CreatorDiscoveryResult" res ON res."runId" = r.id
    GROUP BY r.id
    ORDER BY r."createdAt" DESC
  `);
  return { runs: rows };
}

async function crmGetRun(pool, id) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { rows: runRows } = await pool.query(
    `SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!runRows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  const { rows: results } = await pool.query(`
    SELECT res.*,
      l.status AS lead_status,
      l.id     AS lead_id
    FROM "CreatorDiscoveryResult" res
    LEFT JOIN "CreatorLead" l ON l.id = res."leadId"
    WHERE res."runId" = $1
    ORDER BY COALESCE(res.score, 0) DESC, res."createdAt" DESC
  `, [id]);

  console.log('[Discovery] crmGetRun', { runId: id, resultsReturned: results.length, runStatus: runRows[0]?.status, runResultsCount: runRows[0]?.resultsCount });

  return { run: runRows[0], results };
}

async function crmListLeads(pool, query) {
  const {
    status, country, language, platform, minScore, minFollowers,
    assignedTo, overdueOnly, hasBeenContacted, destination, niche,
    page = '1', q = '',
    sortBy = '', sortDir = '',
  } = query;

  const conditions = [];
  const params = [];
  let p = 1;

  if (status)          { conditions.push(`l.status = $${p++}`); params.push(status); }
  if (country)         { conditions.push(`l.country ILIKE $${p++}`); params.push(`%${country}%`); }
  if (language)        { conditions.push(`l.language = $${p++}`); params.push(language); }
  if (platform)        { conditions.push(`l.platform = $${p++}`); params.push(platform); }
  if (minScore)        { conditions.push(`l.score >= $${p++}`); params.push(parseFloat(minScore)); }
  if (minFollowers)    { conditions.push(`l."followersCount" >= $${p++}`); params.push(parseInt(minFollowers, 10)); }
  if (assignedTo)      { conditions.push(`l."assignedTo" = $${p++}`); params.push(assignedTo); }
  if (overdueOnly === 'true') {
    conditions.push(`l."nextFollowUpAt" < NOW() AND l.status NOT IN ('rejected','blocked','not_fit','active')`);
  }
  if (hasBeenContacted === 'true') {
    conditions.push(`l."lastContactedAt" IS NOT NULL`);
  } else if (hasBeenContacted === 'false') {
    conditions.push(`l."lastContactedAt" IS NULL`);
  }
  if (destination) { conditions.push(`l.destinations::text ILIKE $${p++}`); params.push(`%${destination}%`); }
  if (niche)       { conditions.push(`l.niches::text ILIKE $${p++}`); params.push(`%${niche}%`); }
  if (q)           {
    conditions.push(`(l.username ILIKE $${p} OR l."displayName" ILIKE $${p} OR l.email ILIKE $${p})`);
    params.push(`%${q}%`); p++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageNum = Math.max(1, parseInt(page, 10));
  const limit = 50;
  const offsetVal = (pageNum - 1) * limit;

  // Whitelist of sortable columns → SQL expressions
  const SORT_EXPRS = {
    creator:     `COALESCE(l."displayName", l.username)`,
    followers:   `l."followersCount"`,
    engagement:  `l."engagementRate"`,
    country:     `l.country`,
    score:       `l.score`,
    priority:    `l.priority`,
    status:      `l.status`,
    lastContact: `l."lastContactedAt"`,
    followUp:    `l."nextFollowUpAt"`,
  };
  const NULLABLE_SORT_COLS = new Set(['followers', 'engagement', 'score', 'priority', 'lastContact', 'followUp']);

  // Rejected/blocked/not_fit always go to the bottom (unless user sorts by status)
  const statusWeightExpr = `CASE WHEN l.status IN ('rejected','blocked','not_fit') THEN 1 ELSE 0 END`;
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

  let orderByClause;
  if (sortBy && SORT_EXPRS[sortBy]) {
    const colExpr = SORT_EXPRS[sortBy];
    const nulls = NULLABLE_SORT_COLS.has(sortBy) ? 'NULLS LAST' : '';
    if (sortBy === 'status') {
      orderByClause = `${colExpr} ${dir}`;
    } else {
      orderByClause = `${statusWeightExpr} ASC, ${colExpr} ${dir} ${nulls}`;
    }
  } else {
    orderByClause = `
      ${statusWeightExpr} ASC,
      l.priority DESC NULLS LAST,
      l."followersCount" DESC NULLS LAST,
      COALESCE(l.score, 0) DESC,
      l."updatedAt" DESC
    `;
  }

  const { rows } = await pool.query(`
    SELECT l.*,
      (SELECT COUNT(*) FROM "CreatorLeadMessage" m WHERE m."leadId" = l.id) AS message_count,
      (SELECT COUNT(*) FROM "CreatorLeadTask" t WHERE t."leadId" = l.id AND t.status = 'open') AS pending_tasks
    FROM "CreatorLead" l
    ${where}
    ORDER BY ${orderByClause}
    LIMIT ${limit} OFFSET ${offsetVal}
  `, params);

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM "CreatorLead" l ${where}`, params
  );

  return { leads: rows, total: parseInt(countRows[0]?.total ?? 0, 10) };
}

async function crmGetLead(pool, id) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });

  const { rows: leadRows } = await pool.query(
    `SELECT * FROM "CreatorLead" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!leadRows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  const [messages, activities, tasks] = await Promise.all([
    pool.query(`
      SELECT m.*, t.name AS template_name
      FROM "CreatorLeadMessage" m
      LEFT JOIN "CreatorMessageTemplate" t ON t.id = m."templateId"
      WHERE m."leadId" = $1
      ORDER BY m."createdAt" DESC
    `, [id]),
    pool.query(`
      SELECT * FROM "CreatorLeadActivity"
      WHERE "leadId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 50
    `, [id]),
    pool.query(`
      SELECT * FROM "CreatorLeadTask"
      WHERE "leadId" = $1
      ORDER BY "dueAt" ASC NULLS LAST, "createdAt" DESC
    `, [id]),
  ]);

  return {
    lead: leadRows[0],
    messages: messages.rows,
    activities: activities.rows,
    tasks: tasks.rows,
  };
}

async function crmRefreshInstagram(pool, body, ctx) {
  const { id } = body;
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });

  const { rows } = await pool.query(`SELECT * FROM "CreatorLead" WHERE id = $1 LIMIT 1`, [id]);
  if (!rows.length) throw Object.assign(new Error('Lead not found'), { status: 404 });
  const lead = rows[0];

  if (!lead.username) throw Object.assign(new Error('Lead has no username'), { status: 400 });

  const { verifyInstagramCreatorProfile } = await import('./_lib/creatorDiscoveryProviders.js');
  const { getMetaDiscoveryConnection }    = await import('./_lib/instagramToken.js');

  // Business Discovery uses the server-level Meta connection (env vars), NOT the
  // per-creator publishing token. The creator token is for their own account; the
  // discovery token is for the HiddenAtlas business account (META_INSTAGRAM_ACCOUNT_ID).
  const conn = getMetaDiscoveryConnection();

  console.info('[MetaDiscovery] CRM refresh request:', {
    igBusinessAccountId: conn.accountId ?? null,
    tokenSource:         conn.status === 'OK' ? 'env' : 'none',
    tokenTail:           conn.tokenTail ?? null,
    graphEndpoint:       conn.status === 'OK' ? `graph.facebook.com/${conn.version}` : null,
    usernameToDiscover:  lead.username,
    leadId:              id,
  });

  if (conn.status === 'NOT_CONFIGURED') {
    return {
      refreshed: false, configError: true, missing: conn.missing,
      error: `Meta Discovery not configured. Set: ${conn.missing.join(', ')}`,
    };
  }

  const v = await verifyInstagramCreatorProfile(lead.username, {
    token:     conn.token,
    accountId: conn.accountId,
  });

  if (!v.verified) {
    const isServerTokenExpired = v.errorCategory === 'token';
    const isProfileError       = v.errorCategory === 'profile_not_found';

    console.warn('[MetaDiscovery] Business Discovery failed:', {
      usernameToDiscover:  lead.username,
      igBusinessAccountId: conn.accountId,
      tokenSource:         'env',
      metaErrorCode:       v.metaCode        ?? null,
      metaErrorSubcode:    v.metaSubcode      ?? null,
      metaErrorType:       v.metaType         ?? null,
      metaErrorMessage:    v.metaRawMessage   ?? null,
      errorCategory:       v.errorCategory    ?? null,
      isServerTokenExpired,
      isProfileError,
    });
    return {
      refreshed:           false,
      error:               v.error,
      errorCategory:       v.errorCategory    || null,
      metaCode:            v.metaCode         || null,
      metaSubcode:         v.metaSubcode       || null,
      metaType:            v.metaType          || null,
      isTokenExpired:      isServerTokenExpired,
      isServerTokenExpired,
      isProfileError,
      reconnectSlug:       null,
    };
  }

  console.info('[MetaDiscovery] Business Discovery success:', {
    igBusinessAccountId: conn.accountId,
    tokenSource:         'env',
    usernameToDiscover:  lead.username,
    followersCount:      v.followersCount,
    postsCount:          v.postsCount,
  });

  const now = new Date().toISOString();
  const currentAiAnalysis = (typeof lead.aiAnalysis === 'object' && lead.aiAnalysis) ? lead.aiAnalysis : {};
  const cleanedAnalysis = { ...currentAiAnalysis };
  delete cleanedAnalysis.enrichmentWarning;
  const newAiAnalysis = JSON.stringify({
    ...cleanedAnalysis,
    lastInstagramRefresh: {
      refreshedAt: now,
      followersCount: v.followersCount,
      postsCount: v.postsCount,
      source: 'meta_business_discovery',
    },
    metaBusinessDiscovery: v.rawMetaProfile || null,
  });

  const { rows: updated } = await pool.query(`
    UPDATE "CreatorLead"
    SET "followersCount" = COALESCE($1, "followersCount"),
        "postsCount"     = COALESCE($2, "postsCount"),
        bio              = COALESCE($3, bio),
        "avatarUrl"      = COALESCE($4, "avatarUrl"),
        "displayName"    = COALESCE($5, "displayName"),
        "profileUrl"     = COALESCE($6, "profileUrl"),
        "websiteUrl"     = COALESCE($7, "websiteUrl"),
        "aiAnalysis"     = $8::jsonb,
        "updatedAt"      = NOW()
    WHERE id = $9
    RETURNING *
  `, [
    v.followersCount ?? null, v.postsCount ?? null,
    v.bio || null, v.avatarUrl || null, v.displayName || null, v.profileUrl || null, v.website || null,
    newAiAnalysis, id,
  ]);

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;
  try {
    await pool.query(`
      INSERT INTO "CreatorLeadActivity" (id, "leadId", type, body, metadata, "createdById", "createdAt")
      VALUES (gen_random_uuid(), $1, 'system', $2, $3::jsonb, $4, NOW())
    `, [
      id,
      `Instagram refreshed: ${v.followersCount?.toLocaleString() ?? '?'} followers, ${v.postsCount ?? '?'} posts`,
      JSON.stringify({ followersCount: v.followersCount, postsCount: v.postsCount, refreshedAt: now }),
      createdById,
    ]);
  } catch (actErr) {
    console.warn('[refreshInstagram] activity log failed (non-blocking):', actErr.message);
  }

  return { refreshed: true, lead: updated[0] };
}

async function crmCreateLead(pool, body, ctx) {
  const {
    platform = 'instagram',
    username: rawUsername = '',
    displayName: rawDisplayName = '',
    profileUrl: rawProfileUrl = '',
    email = '',
    country = '',
    bio = '',
    websiteUrl = '',
    followerCount,
    engagementRate,
    score,
    status = 'identified',
    notes = '',
  } = body;

  let username = rawUsername.trim().toLowerCase().replace(/^@/, '').replace(/\/$/, '');
  let profileUrl = rawProfileUrl.trim() || null;
  const displayName = rawDisplayName.trim() || null;

  // Extract username from Instagram URL if not provided
  if (!username && profileUrl && platform === 'instagram') {
    const m = profileUrl.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
    if (m) username = m[1].toLowerCase();
  }

  if (!username && !displayName) {
    throw Object.assign(new Error('Name or username is required'), { status: 400 });
  }

  // Generate a stable username from displayName if none
  if (!username) {
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 24);
    username = `${slug}_${Date.now().toString().slice(-6)}`;
  }

  if (profileUrl) {
    try { new URL(profileUrl); } catch {
      throw Object.assign(new Error('Profile URL is not valid'), { status: 400 });
    }
  }
  if (!profileUrl && platform === 'instagram') {
    profileUrl = `https://www.instagram.com/${username}/`;
  }

  // Dedup: platform + username
  const { rows: dupUser } = await pool.query(
    `SELECT id FROM "CreatorLead" WHERE platform = $1 AND lower(username) = lower($2) LIMIT 1`,
    [platform, username]
  );
  if (dupUser.length) return { duplicate: true, existingId: dupUser[0].id };

  // Dedup: profileUrl
  if (profileUrl) {
    const { rows: dupUrl } = await pool.query(
      `SELECT id FROM "CreatorLead" WHERE "profileUrl" = $1 LIMIT 1`,
      [profileUrl]
    );
    if (dupUrl.length) return { duplicate: true, existingId: dupUrl[0].id };
  }

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;
  const followersInt = followerCount != null && followerCount !== '' ? parseInt(followerCount, 10) || null : null;
  const engFloat     = engagementRate != null && engagementRate !== '' ? parseFloat(engagementRate) || null : null;
  const scoreFloat   = score != null && score !== '' ? parseFloat(score) || null : null;

  // Explicit whitelist — only known real DB columns; priority = 0 (integer default)
  let lead;
  try {
    const { rows: inserted } = await pool.query(`
      INSERT INTO "CreatorLead" (
        id, platform, username, "displayName", "profileUrl",
        email, bio, "websiteUrl", country,
        "followersCount", "engagementRate", score,
        status, priority, source,
        niches, destinations, hashtags, mentions, "routeIdeas",
        "createdById", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11,
        $12, 0, 'manual',
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        $13, NOW(), NOW()
      )
      RETURNING *
    `, [
      platform, username, displayName, profileUrl,
      email.trim() || null, bio.trim() || null, websiteUrl.trim() || null, country.trim() || null,
      followersInt, engFloat, scoreFloat,
      status,
      createdById,
    ]);
    lead = inserted[0];
  } catch (dbErr) {
    console.error('[crmCreateLead] INSERT failed:', {
      username, platform,
      error: dbErr.message,
      pgCode: dbErr.code,
      detail: dbErr.detail,
    });
    throw dbErr;
  }

  const actNote = notes.trim()
    ? `Added manually. Notes: ${notes.trim()}`
    : 'Added manually to CRM';
  try {
    await pool.query(`
      INSERT INTO "CreatorLeadActivity" (id, "leadId", type, body, metadata, "createdById", "createdAt")
      VALUES (gen_random_uuid(), $1, 'system', $2, '{}'::jsonb, $3, NOW())
    `, [lead.id, actNote, createdById]);
  } catch (actErr) {
    console.warn('[crmCreateLead] activity log failed (non-blocking):', actErr.message);
  }

  return { lead, duplicate: false };
}

async function crmImportInstagramLead(pool, body, ctx) {
  const { instagramUrl } = body;
  if (!instagramUrl?.trim()) {
    throw Object.assign(new Error('Instagram URL is required'), { status: 400 });
  }

  const rawInput = instagramUrl.trim();

  if (/instagram\.com\/(p|reel|reels|stories|tv)\//i.test(rawInput)) {
    throw Object.assign(
      new Error('Please add a profile URL, not a post or reel URL.'),
      { status: 400, code: 'INVALID_INSTAGRAM_URL' }
    );
  }

  const { normalizeUsername, verifyInstagramCreatorProfile } = await import('./_lib/creatorDiscoveryProviders.js');
  const username = normalizeUsername(rawInput);

  if (!username || !/^[a-zA-Z0-9_.]+$/.test(username)) {
    throw Object.assign(
      new Error('Could not extract a valid Instagram username from this URL'),
      { status: 400, code: 'INVALID_INSTAGRAM_URL' }
    );
  }

  const profileUrl = `https://www.instagram.com/${username}/`;

  // Dedup check
  const { rows: dupRows } = await pool.query(
    `SELECT id FROM "CreatorLead" WHERE platform = 'instagram' AND lower(username) = lower($1) LIMIT 1`,
    [username]
  );
  if (dupRows.length) return { duplicate: true, existingId: dupRows[0].id };

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  // ── Instagram enrichment — best effort, never blocks lead creation ────────
  const { getMetaDiscoveryConnection: _getConn } = await import('./_lib/instagramToken.js');

  // Discovery uses the server-level env var connection, not the creator's publishing token.
  const importConn = _getConn();

  let enrichOpts     = {};
  let skipEnrichment = false;

  if (importConn.status === 'NOT_CONFIGURED') {
    skipEnrichment = true;
    console.warn('[CreatorLeadImport] Meta Discovery not configured — skipping enrichment:', {
      username, missing: importConn.missing,
    });
  } else {
    enrichOpts = { token: importConn.token, accountId: importConn.accountId };
    console.info('[CreatorLeadImport] Discovery connection ready:', {
      igBusinessAccountId: importConn.accountId,
      tokenTail: importConn.tokenTail,
      usernameToDiscover: username,
    });
  }

  let v = null;
  if (!skipEnrichment) {
    try {
      v = await verifyInstagramCreatorProfile(username, enrichOpts);
    } catch (enrichErr) {
      console.warn('[CreatorLeadImport] Unexpected enrichment error (non-blocking):', {
        username, error: enrichErr.message,
      });
    }
  }

  const dataFetched = v?.verified === true;
  let warning = null;
  let warningCode = null;

  if (!dataFetched) {
    if (skipEnrichment) {
      warningCode = 'META_NOT_CONFIGURED';
      warning = 'Lead created. Instagram enrichment is not configured on this server (META_INSTAGRAM_ACCOUNT_ID / META_GRAPH_ACCESS_TOKEN missing).';
    } else {
      const metaCode = v?.metaCode ?? null;
      if (!v) {
        warningCode = 'META_ENRICHMENT_FAILED';
        warning = 'Lead created. Instagram data could not be fetched.';
      } else if (metaCode === 190 || metaCode === 102 || metaCode === 467) {
        warningCode = 'META_TOKEN_EXPIRED';
        warning = 'Lead created, but Instagram enrichment was skipped because your Meta connection has expired. Reconnect Instagram to enable automatic enrichment.';
        console.warn('[CreatorLeadImport] Meta token expired during enrichment:', { username, metaCode });
      } else if (metaCode === 4 || metaCode === 17 || metaCode === 32 || metaCode === 613) {
        warningCode = 'META_RATE_LIMITED';
        warning = 'Lead created. Instagram enrichment was skipped due to Meta API rate limiting — try again later.';
      } else {
        warningCode = 'META_ENRICHMENT_FAILED';
        warning = 'Lead created. Some Instagram data could not be fetched automatically.';
      }
      console.info('[CreatorLeadImport] Creating minimal lead for @' + username, { warningCode, metaCode });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Explicit whitelist — only known real DB columns; priority = 0 (integer default)
  const aiAnalysis = dataFetched
    ? { source: 'instagram_url_import', metaBusinessDiscovery: v.rawMetaProfile || null }
    : { enrichmentWarning: warningCode ?? 'META_ENRICHMENT_FAILED' };

  let lead;
  try {
    const { rows: inserted } = await pool.query(`
      INSERT INTO "CreatorLead" (
        id, platform, username, "displayName", "profileUrl",
        "avatarUrl", bio, "websiteUrl",
        "followersCount", "postsCount",
        "aiAnalysis", source, status, priority,
        niches, destinations, hashtags, mentions, "routeIdeas",
        "createdById", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), 'instagram', $1, $2, $3,
        $4, $5, $6,
        $7, $8,
        $9::jsonb, 'instagram_url', 'identified', 0,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        $10, NOW(), NOW()
      )
      RETURNING *
    `, [
      username,
      dataFetched ? (v.displayName || null) : null,
      profileUrl,
      dataFetched ? (v.avatarUrl || null) : null,
      dataFetched ? (v.bio || null) : null,
      dataFetched ? (v.website ?? null) : null,
      dataFetched ? (v.followersCount ?? null) : null,
      dataFetched ? (v.postsCount ?? null) : null,
      JSON.stringify(aiAnalysis),
      createdById,
    ]);
    lead = inserted[0];
  } catch (dbErr) {
    console.error('[CreatorLeadImport] INSERT failed:', {
      username, profileUrl, dataFetched, warningCode,
      error: dbErr.message,
      pgCode: dbErr.code,
      detail: dbErr.detail,
    });
    throw dbErr;
  }

  const actNote = dataFetched
    ? `Added via Instagram URL import. @${username} — ${v.followersCount?.toLocaleString() ?? '?'} followers.`
    : `Added via Instagram URL import. @${username}. Instagram enrichment skipped (${warningCode}).`;

  try {
    await pool.query(`
      INSERT INTO "CreatorLeadActivity" (id, "leadId", type, body, metadata, "createdById", "createdAt")
      VALUES (gen_random_uuid(), $1, 'system', $2, '{}'::jsonb, $3, NOW())
    `, [lead.id, actNote, createdById]);
  } catch (actErr) {
    console.warn('[CreatorLeadImport] activity log failed (non-blocking):', actErr.message);
  }

  return { lead, duplicate: false, dataFetched, warning, warningCode };
}

async function crmListTemplates(pool, platform, language) {
  const conditions = ['"isActive" = true'];
  const params = [];
  let p = 1;
  if (platform) { conditions.push(`platform = $${p++}`); params.push(platform); }
  if (language) { conditions.push(`language = $${p++}`); params.push(language); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await pool.query(`SELECT * FROM "CreatorMessageTemplate" ${where} ORDER BY name`, params);
  return { templates: rows };
}

async function crmCreateRun(pool, body, ctx) {
  const {
    name, platform = 'instagram', searchType = 'manual',
    destination, country, language, hashtags = [], bioKeywords,
    minFollowers, maxFollowers, minEngagementRate, category, assignedToId, notes,
  } = body;
  const autoName = [
    (platform || 'instagram').charAt(0).toUpperCase() + (platform || 'instagram').slice(1),
    destination?.trim() || null,
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  ].filter(Boolean).join(' · ');
  const runName = name?.trim() || autoName;

  const targetDestinations = destination ? [destination.trim()] : [];
  const targetCountries = country ? [country.trim()] : [];
  const targetLanguages = language ? language.split(',').map(s => s.trim()).filter(Boolean) : [];
  const categories = category ? category.split(',').map(s => s.trim()).filter(Boolean) : [];
  const runParams = JSON.stringify({ notes: notes || null });

  const { rows } = await pool.query(`
    INSERT INTO "CreatorDiscoveryRun"
      (id, name, platform, "searchType", "targetDestinations", "targetCountries", "targetLanguages", hashtags,
       "bioKeywords", "minFollowers", "maxFollowers", "minEngagementRate", categories,
       "assignedToId", params, "createdById", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb,
       $8, $9, $10, $11, $12::jsonb,
       $13, $14::jsonb, $15, NOW(), NOW())
    RETURNING *
  `, [
    runName, platform, searchType,
    JSON.stringify(targetDestinations), JSON.stringify(targetCountries), JSON.stringify(targetLanguages),
    JSON.stringify(Array.isArray(hashtags) ? hashtags : []),
    bioKeywords || null, minFollowers ? parseInt(minFollowers, 10) : null,
    maxFollowers ? parseInt(maxFollowers, 10) : null,
    minEngagementRate ? parseFloat(minEngagementRate) : null,
    JSON.stringify(categories), assignedToId || null, runParams,
    (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null),
  ]);
  return { run: rows[0] };
}

async function crmImportResults(pool, body, ctx) {
  const { runId, results } = body;
  if (!runId) throw Object.assign(new Error('runId is required'), { status: 400 });
  if (!Array.isArray(results) || !results.length) {
    throw Object.assign(new Error('results must be a non-empty array'), { status: 400 });
  }

  const { rows: runCheck } = await pool.query(
    `SELECT id FROM "CreatorDiscoveryRun" WHERE id = $1 LIMIT 1`, [runId]
  );
  if (!runCheck.length) throw Object.assign(new Error('Run not found'), { status: 404 });

  let inserted = 0;
  for (const r of results) {
    const { username, platform = 'instagram' } = r;
    if (!username) continue;
    const cleanUsername = String(username).trim().replace(/^@/, '').toLowerCase();
    if (!cleanUsername) continue;
    try {
      await pool.query(`
        INSERT INTO "CreatorDiscoveryResult"
          ("runId", platform, username, "displayName", "profileUrl", "avatarUrl",
           "followersCount", "postsCount", "engagementRate",
           bio, country, language, category,
           score, "fitSummary", "routeIdeas", "rawData",
           selected, status, "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12, $13,
           $14, $15, $16::jsonb, $17::jsonb,
           false, 'new', NOW())
        ON CONFLICT DO NOTHING
      `, [
        runId, platform, cleanUsername,
        r.displayName || null,
        r.profileUrl || `https://www.instagram.com/${cleanUsername}/`,
        r.avatarUrl || null,
        r.followersCount ?? r.followerCount ?? null,
        r.postsCount     ?? r.postCount     ?? null,
        r.engagementRate ?? null,
        r.bio || null, r.country || null, r.language || null, r.category || null,
        r.score ?? null,
        r.fitSummary || null,
        JSON.stringify(Array.isArray(r.routeIdeas) ? r.routeIdeas : []),
        JSON.stringify(r.rawData || r.metadata || { source: 'manual_import' }),
      ]);
      inserted++;
    } catch (e) {
      console.error(`[crmImportResults] INSERT failed for @${cleanUsername}:`, e.message);
    }
  }

  await pool.query(
    `UPDATE "CreatorDiscoveryRun" SET "resultsCount" = (SELECT COUNT(*) FROM "CreatorDiscoveryResult" WHERE "runId" = $1), "updatedAt" = NOW() WHERE id = $1`,
    [runId]
  );

  return { inserted };
}

async function crmAddToCrm(pool, body, ctx) {
  const { resultId } = body;
  if (!resultId) throw Object.assign(new Error('resultId is required'), { status: 400 });

  const { rows: rRows } = await pool.query(
    `SELECT * FROM "CreatorDiscoveryResult" WHERE id = $1 LIMIT 1`, [resultId]
  );
  if (!rRows.length) throw Object.assign(new Error('Result not found'), { status: 404 });
  const result = rRows[0];
  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  // Fetch run to get destinations
  const { rows: runRows } = await pool.query(
    `SELECT "targetDestinations", params FROM "CreatorDiscoveryRun" WHERE id = $1 LIMIT 1`,
    [result.runId]
  );
  const run = runRows[0];
  const runTargetDests = Array.isArray(run?.targetDestinations) ? run.targetDestinations : [];
  const runParamDest   = run?.params?.destinationTheme ? [run.params.destinationTheme] : [];
  const destinations   = runTargetDests.length > 0 ? runTargetDests : runParamDest;

  const niches     = result.category ? [result.category] : [];
  const routeIdeas = Array.isArray(result.routeIdeas) ? result.routeIdeas : [];
  const aiAnalysis = JSON.stringify({
    source:                   'creator_discovery',
    discoveryResultId:        result.id,
    runId:                    result.runId,
    rawData:                  result.rawData || {},
    verificationStatus:       result.rawData?.verificationStatus || 'unverified',
    needsManualVerification:  true,
  });

  // Expression index lower(username) means ON CONFLICT won't work directly —
  // use manual SELECT + UPDATE/INSERT
  const { rows: existingRows } = await pool.query(
    `SELECT id FROM "CreatorLead" WHERE platform = $1 AND lower(username) = lower($2) LIMIT 1`,
    [result.platform, result.username]
  );

  let lead;
  let isNew = false;

  if (existingRows.length) {
    const leadId = existingRows[0].id;
    const { rows: updated } = await pool.query(`
      UPDATE "CreatorLead"
      SET "displayName"    = COALESCE($1,  "displayName"),
          "profileUrl"     = COALESCE($2,  "profileUrl"),
          "avatarUrl"      = COALESCE($3,  "avatarUrl"),
          bio              = COALESCE($4,  bio),
          "followersCount" = COALESCE($5,  "followersCount"),
          "postsCount"     = COALESCE($6,  "postsCount"),
          "engagementRate" = COALESCE($7,  "engagementRate"),
          country          = COALESCE($8,  country),
          language         = COALESCE($9,  language),
          category         = COALESCE($10, category),
          score            = COALESCE($11, score),
          "fitSummary"     = COALESCE($12, "fitSummary"),
          "routeIdeas"     = COALESCE($13::jsonb, "routeIdeas"),
          "aiAnalysis"     = COALESCE("aiAnalysis", '{}'::jsonb) || $14::jsonb,
          "sourceRunId"    = COALESCE("sourceRunId", $15),
          "updatedAt"      = NOW()
      WHERE id = $16
      RETURNING *
    `, [
      result.displayName, result.profileUrl, result.avatarUrl,
      result.bio, result.followersCount, result.postsCount, result.engagementRate,
      result.country, result.language, result.category,
      result.score, result.fitSummary,
      routeIdeas.length ? JSON.stringify(routeIdeas) : null,
      aiAnalysis, result.runId,
      leadId,
    ]);
    lead = updated[0];
  } else {
    isNew = true;
    const resultSource = result.rawData?.verificationStatus === 'verified' ? 'meta_business_discovery' : 'ai_discovery';
    const { rows: inserted } = await pool.query(`
      INSERT INTO "CreatorLead" (
        platform, username, "displayName", "profileUrl", "avatarUrl",
        bio, "followersCount", "postsCount", "engagementRate",
        country, language, category,
        niches, destinations, hashtags, mentions,
        score, priority, "fitSummary", "routeIdeas",
        "aiAnalysis", source, "sourceRunId", status,
        "createdById", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12,
        $13::jsonb, $14::jsonb, '[]'::jsonb, '[]'::jsonb,
        $15, 0, $16, $17::jsonb,
        $18::jsonb, $19, $20, 'identified',
        $21, NOW(), NOW()
      )
      RETURNING *
    `, [
      result.platform, result.username, result.displayName, result.profileUrl, result.avatarUrl,
      result.bio, result.followersCount, result.postsCount, result.engagementRate,
      result.country, result.language, result.category,
      JSON.stringify(niches), JSON.stringify(destinations),
      result.score, result.fitSummary,
      JSON.stringify(routeIdeas), aiAnalysis, resultSource, result.runId,
      createdById,
    ]);
    lead = inserted[0];
  }

  // Mark result as added + link lead + mark selected
  await pool.query(
    `UPDATE "CreatorDiscoveryResult" SET status = 'added_to_crm', "leadId" = $1, selected = true WHERE id = $2`,
    [lead.id, resultId]
  );

  // Recalculate selectedCount on the run
  await pool.query(`
    UPDATE "CreatorDiscoveryRun"
    SET "selectedCount" = (
      SELECT COUNT(*) FROM "CreatorDiscoveryResult"
      WHERE "runId" = $1 AND status = 'added_to_crm'
    ), "updatedAt" = NOW()
    WHERE id = $1
  `, [result.runId]);

  // Log activity
  await pool.query(`
    INSERT INTO "CreatorLeadActivity" (id, "leadId", type, body, metadata, "createdById", "createdAt")
    VALUES (gen_random_uuid(), $1, 'system', $2, '{}'::jsonb, $3, NOW())
  `, [lead.id, 'Added from discovery run', createdById]);

  return { lead, isNew };
}

async function crmSetResultStatus(pool, id, status) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { rows } = await pool.query(
    `UPDATE "CreatorDiscoveryResult" SET status = $1 WHERE id = $2 RETURNING id, status`,
    [status, id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { result: rows[0] };
}

async function crmAiSearchProfiles(pool, payload, ctx) {
  const {
    runId: existingRunId,
    platform        = 'instagram',
    creatorProfile,
    destinationTheme,
    creatorCountry,
    language,
    niche,
    minFollowers,
    maxFollowers,
    targetCount     = 20,
    notes,
  } = payload;

  if (!creatorProfile?.trim()) {
    throw Object.assign(new Error('creatorProfile is required'), { status: 400 });
  }

  const limit = Math.min(parseInt(targetCount, 10) || 20, 50);

  // Fail fast if no provider is configured (saves a DB write)
  const { detectProvider, runAiDiscovery } = await import('./_lib/creatorDiscoveryProviders.js');
  const providerName = detectProvider();
  if (!providerName) {
    throw Object.assign(
      new Error(
        'AI Search provider is not configured. ' +
        'Add ANTHROPIC_API_KEY to enable AI Search, or TAVILY_API_KEY + ANTHROPIC_API_KEY for web-augmented search.'
      ),
      { status: 503, code: 'PROVIDER_NOT_CONFIGURED' }
    );
  }

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  // ── Stage: create_run ─────────────────────────────────────────────────────
  console.log(`[ai_search] stage=create_run provider=${providerName}`);
  let run;
  if (!existingRunId) {
    const profileLabel = creatorProfile.trim().slice(0, 45) + (creatorProfile.trim().length > 45 ? '…' : '');
    const autoName = [
      'AI · ' + platform.charAt(0).toUpperCase() + platform.slice(1),
      destinationTheme?.trim() || profileLabel,
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    ].join(' · ');

    const runParams = JSON.stringify({
      creatorProfile: creatorProfile.trim(),
      destinationTheme: destinationTheme?.trim() || null,
      notes: notes || null,
      targetCount: limit,
    });

    const targetDestinations = destinationTheme?.trim() ? [destinationTheme.trim()] : [];
    const targetCountries = creatorCountry ? [creatorCountry.trim()] : [];
    const targetLanguages = language ? language.split(',').map(s => s.trim()).filter(Boolean) : [];
    const categories = niche ? niche.split(',').map(s => s.trim()).filter(Boolean) : [];

    const { rows } = await pool.query(`
      INSERT INTO "CreatorDiscoveryRun"
        (id, name, platform, "searchType", "targetDestinations", "targetCountries", "targetLanguages", categories,
         "minFollowers", "maxFollowers", status, provider, params,
         "createdById", "startedAt", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid(), $1, $2, 'keyword', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb,
         $7, $8, 'running', $9, $10::jsonb,
         $11, NOW(), NOW(), NOW())
      RETURNING *
    `, [
      autoName, platform,
      JSON.stringify(targetDestinations), JSON.stringify(targetCountries),
      JSON.stringify(targetLanguages), JSON.stringify(categories),
      minFollowers ? parseInt(minFollowers, 10) : null,
      maxFollowers ? parseInt(maxFollowers, 10) : null,
      providerName,
      runParams,
      createdById,
    ]);
    run = rows[0];
  } else {
    const { rows } = await pool.query(`SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1 LIMIT 1`, [existingRunId]);
    if (!rows.length) throw Object.assign(new Error('Run not found'), { status: 404 });
    run = rows[0];
    await pool.query(`UPDATE "CreatorDiscoveryRun" SET status = 'running', "updatedAt" = NOW() WHERE id = $1`, [existingRunId]);
  }

  const runId = run.id;

  // ── Stage: ai_provider ────────────────────────────────────────────────────
  console.log(`[ai_search] stage=ai_provider runId=${runId}`);
  let discoveryResult;
  try {
    discoveryResult = await runAiDiscovery({
      creatorProfile: creatorProfile.trim(),
      destinationTheme: destinationTheme?.trim() || undefined,
      creatorCountry,
      language,
      niche,
      minFollowers: minFollowers ? parseInt(minFollowers, 10) : undefined,
      maxFollowers: maxFollowers ? parseInt(maxFollowers, 10) : undefined,
      targetCount: limit,
      notes,
    });
  } catch (err) {
    console.error(`[ai_search] stage=ai_provider runId=${runId} FAILED:`, err.message);
    await pool.query(
      `UPDATE "CreatorDiscoveryRun" SET status = 'failed', "errorMessage" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [runId, `[ai_provider] ${err.message}`]
    );
    err.stage = 'ai_provider';
    throw err;
  }

  const { creators, provider, providerMeta } = discoveryResult;

  // Log parse debug info if provider returned it
  if (providerMeta?.parseError) {
    console.warn(`[ai_search] runId=${runId} parse warning: ${providerMeta.parseError}`);
    if (providerMeta.rawPreview) console.warn(`[ai_search] raw preview: ${providerMeta.rawPreview}`);
  }

  console.log(`[ai_search] stage=saving provider=${provider} profiles=${creators.length} runId=${runId}`);

  if (creators.length === 0) {
    const debugNote = providerMeta?.parseError ? ` Parse error: ${providerMeta.parseError}.` : '';
    const emptyMsg = `AI provider returned no usable profile suggestions.${debugNote} Try a broader creator profile or lower filters.`;
    await pool.query(
      `UPDATE "CreatorDiscoveryRun" SET status = 'completed', "resultsCount" = 0, "selectedCount" = 0, "completedAt" = NOW(), "errorMessage" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [runId, emptyMsg]
    );
    const { rows: finalRun } = await pool.query(`SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1`, [runId]);
    return {
      run: finalRun[0], results: [], inserted: 0, skipped: 0,
      providerStatus: { provider, ...providerMeta },
      warning: providerMeta?.parseError ? `AI response could not be fully parsed: ${providerMeta.parseError}` : null,
    };
  }

  const insertedResults = [];
  const insertSkipped   = [];
  const insertFailed    = [];
  const seenUsernames   = new Set();

  console.log(`[ai_search] inserting up to ${Math.min(creators.length, limit)} profiles`);
  if (creators[0]) console.log('[ai_search] first profile sample:', JSON.stringify(creators[0]).slice(0, 400));

  for (const c of creators.slice(0, limit)) {
    const username = c.username;
    if (seenUsernames.has(username)) {
      insertSkipped.push({ username, reason: 'duplicate_in_batch' });
      continue;
    }
    seenUsernames.add(username);

    try {
      const { rows: leadRows } = await pool.query(
        `SELECT id, status FROM "CreatorLead" WHERE platform = $1 AND username = $2 LIMIT 1`,
        [platform, username]
      );
      const existingLead = leadRows[0] || null;
      const resultStatus = existingLead ? 'added_to_crm' : 'new';

      const rawDataJson = JSON.stringify({
        ...(c.rawData || {}),
        provider,
        providerMeta,
        existingLeadId: existingLead?.id || null,
        existingLeadStatus: existingLead?.status || null,
      });

      const { rows: resRows } = await pool.query(`
        INSERT INTO "CreatorDiscoveryResult"
          ("runId", platform, username, "displayName", "profileUrl", "avatarUrl",
           "followersCount", "postsCount", "engagementRate",
           bio, country, language, category,
           score, "fitSummary", "routeIdeas", "rawData",
           selected, status, "createdAt")
        VALUES
          ($1, $2, $3, $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12, $13,
           $14, $15, $16::jsonb, $17::jsonb,
           false, $18, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id, username
      `, [
        runId, platform, username, c.displayName, c.profileUrl, c.avatarUrl,
        c.followersCount, c.postsCount, c.engagementRate,
        c.bio, c.country, c.language, c.category,
        c.score, c.fitSummary,
        JSON.stringify(c.routeIdeas),
        rawDataJson,
        resultStatus,
      ]);

      if (resRows.length) {
        insertedResults.push(resRows[0]);
      } else {
        insertSkipped.push({ username, reason: 'duplicate_in_run' });
      }
    } catch (e) {
      console.error(`[AI Discovery] INSERT failed for @${username}:`, e.message);
      insertFailed.push({ username, error: e.message });
    }
  }

  console.log('[AI Discovery] insert summary', {
    rawCount: creators.length,
    insertedCount: insertedResults.length,
    skippedCount: insertSkipped.length,
    failedCount: insertFailed.length,
    skippedReasons: insertSkipped.map(s => s.reason),
    failedErrors: insertFailed.map(f => f.error),
  });

  const inserted = insertedResults.length;

  // Finalize run
  let finalErrorMsg = null;
  if (inserted === 0 && creators.length > 0) {
    const firstSkip = insertSkipped[0]?.reason || null;
    const firstFail = insertFailed[0]?.error   || null;
    finalErrorMsg = `AI returned ${creators.length} profile${creators.length !== 1 ? 's' : ''} but none were inserted.` +
      (insertFailed.length   > 0 ? ` ${insertFailed.length} failed: ${firstFail}.` : '') +
      (insertSkipped.length  > 0 ? ` ${insertSkipped.length} skipped (${firstSkip}).` : '');
  }

  await pool.query(
    `UPDATE "CreatorDiscoveryRun" SET status = 'completed', "resultsCount" = $2, "selectedCount" = 0, "completedAt" = NOW(), "errorMessage" = $3, "updatedAt" = NOW() WHERE id = $1`,
    [runId, inserted, finalErrorMsg]
  );

  // Auto-verify first 5 inserted results if Meta is configured
  let autoVerified = 0, autoFailed = 0;
  if (insertedResults.length > 0) {
    const { validateMetaConfig } = await import('./_lib/creatorDiscoveryProviders.js');
    const metaConfig = validateMetaConfig();
    if (metaConfig.configured) {
      console.log(`[AI Discovery] auto-verifying up to 5 profiles via Meta`);
      for (const row of insertedResults.slice(0, 5)) {
        try {
          const vResult = await crmVerifyProfile(pool, { resultId: row.id }, ctx);
          if (vResult.verified) autoVerified++;
          else autoFailed++;
        } catch (e) {
          console.error(`[AI Discovery] auto-verify error for @${row.username}:`, e.message);
          autoFailed++;
        }
        await new Promise(r => setTimeout(r, 400));
      }
      console.log(`[AI Discovery] auto-verify done: ${autoVerified} verified, ${autoFailed} failed`);
    }
  }

  const { rows: finalRun } = await pool.query(`SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1`, [runId]);
  return { run: finalRun[0], results: insertedResults, inserted, skipped: insertSkipped.length, autoVerified, autoFailed, providerStatus: { provider, ...providerMeta } };
}

async function crmMetaValidateConfig(pool, payload) {
  const { validateMetaConfig } = await import('./_lib/creatorDiscoveryProviders.js');
  const config = validateMetaConfig();

  if (!config.configured) {
    return {
      configured: false,
      missing: config.missing,
      provider: 'meta_instagram',
      message: config.missing.length
        ? `Missing env vars: ${config.missing.join(', ')}`
        : 'META_PROVIDER_ENABLED is set to false',
    };
  }

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res;
    try {
      const url = new URL(`https://graph.facebook.com/${config.version}/${config.accountId}`);
      url.searchParams.set('fields', 'id,name');
      url.searchParams.set('access_token', config.token);
      res = await fetch(url.toString(), { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json();
    if (data.error) {
      const msg = data.error.code === 190
        ? 'Meta token is invalid or expired.'
        : (data.error.message || 'Meta API error');
      return { configured: true, missing: [], valid: false, provider: 'meta_instagram', message: msg };
    }
    return {
      configured: true, missing: [], valid: true, provider: 'meta_instagram',
      message: `Connected${data.name ? ` · ${data.name}` : ''}`,
      accountId: data.id, accountName: data.name || null,
    };
  } catch (e) {
    return { configured: true, missing: [], valid: false, provider: 'meta_instagram', message: `Connection test failed: ${e.message}` };
  }
}

async function crmMetaBusinessDiscovery(pool, payload, ctx) {
  const {
    enrichInstagramProfilesByUsername, validateMetaConfig, normalizeUsername,
  } = await import('./_lib/creatorDiscoveryProviders.js');

  const {
    runId: existingRunId, usernames: rawUsernames,
    destinationTheme, niche, creatorCountry, language, minFollowers, maxFollowers,
  } = payload;

  const config = validateMetaConfig();
  if (!config.configured) {
    throw Object.assign(
      new Error(`Meta provider not configured. Missing: ${config.missing.join(', ')}`),
      { status: 503, code: 'META_NOT_CONFIGURED' }
    );
  }

  const rawList = Array.isArray(rawUsernames)
    ? rawUsernames
    : typeof rawUsernames === 'string' ? rawUsernames.split(/[\n,]+/) : [];

  const normalized = [
    ...new Set(
      rawList.map(u => normalizeUsername(u))
        .filter(u => u && u.length >= 1 && u.length <= 30 && /^[a-zA-Z0-9_.]+$/.test(u))
    ),
  ].slice(0, 50);

  if (!normalized.length) throw Object.assign(new Error('No valid usernames provided'), { status: 400 });

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  let run;
  if (!existingRunId) {
    const profileLabel = destinationTheme?.trim() || `${normalized.length} profile${normalized.length !== 1 ? 's' : ''}`;
    const autoName = [
      'Meta · Instagram',
      profileLabel,
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    ].join(' · ');

    const runParams = JSON.stringify({
      provider: 'meta_instagram_business_discovery',
      usernames: normalized,
      destinationTheme: destinationTheme || null, niche: niche || null,
      creatorCountry: creatorCountry || null, language: language || null,
      minFollowers: minFollowers || null, maxFollowers: maxFollowers || null,
    });

    const targetDestinations = destinationTheme ? [destinationTheme.trim()] : [];
    const targetCountries = creatorCountry ? [creatorCountry.trim()] : [];
    const targetLanguages = language ? language.split(',').map(s => s.trim()).filter(Boolean) : [];
    const metaCategories = niche ? niche.split(',').map(s => s.trim()).filter(Boolean) : [];

    const { rows } = await pool.query(`
      INSERT INTO "CreatorDiscoveryRun"
        (id, name, platform, "searchType", "targetDestinations", "targetCountries", "targetLanguages", categories,
         "minFollowers", "maxFollowers", status, provider, params,
         "createdById", "createdAt", "updatedAt")
      VALUES
        (gen_random_uuid(), $1, 'instagram', 'provider_import', $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb,
         $6, $7, 'running', 'meta_instagram_business_discovery', $8::jsonb,
         $9, NOW(), NOW())
      RETURNING *
    `, [
      autoName,
      JSON.stringify(targetDestinations), JSON.stringify(targetCountries),
      JSON.stringify(targetLanguages), JSON.stringify(metaCategories),
      minFollowers ? parseInt(minFollowers, 10) : null,
      maxFollowers ? parseInt(maxFollowers, 10) : null,
      runParams, createdById,
    ]);
    run = rows[0];
  } else {
    const { rows } = await pool.query(`SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1 LIMIT 1`, [existingRunId]);
    if (!rows.length) throw Object.assign(new Error('Run not found'), { status: 404 });
    run = rows[0];
    await pool.query(`UPDATE "CreatorDiscoveryRun" SET status = 'running', "updatedAt" = NOW() WHERE id = $1`, [existingRunId]);
  }

  const runId    = run.id;
  const criteria = { destinationTheme, niche, creatorCountry, language, minFollowers, maxFollowers };

  let enrichResult;
  try {
    enrichResult = await enrichInstagramProfilesByUsername(normalized, criteria);
  } catch (err) {
    await pool.query(
      `UPDATE "CreatorDiscoveryRun" SET status = 'failed', "errorMessage" = $2, "updatedAt" = NOW() WHERE id = $1`,
      [runId, `Error: ${err.message}`]
    );
    throw err;
  }

  const { results: profiles, errors } = enrichResult;

  const { rows: existing } = await pool.query(
    `SELECT username FROM "CreatorDiscoveryResult" WHERE "runId" = $1`, [runId]
  );
  const existingUsernames = new Set(existing.map(r => r.username.toLowerCase()));

  let inserted = 0; let skipped = 0;
  const insertedResults = [];

  for (const p of profiles) {
    const username = (p.username || '').toLowerCase();
    if (existingUsernames.has(username)) { skipped++; continue; }
    existingUsernames.add(username);

    try {
      const { rows: leadRows } = await pool.query(
        `SELECT id, status FROM "CreatorLead" WHERE platform = 'instagram' AND username = $1 LIMIT 1`, [username]
      );
      const existingLead = leadRows[0] || null;
      const resultStatus = existingLead ? 'added_to_crm' : 'new';

      const { rows: resRows } = await pool.query(`
        INSERT INTO "CreatorDiscoveryResult"
          ("runId", platform, username, "displayName", "profileUrl", "avatarUrl",
           "followersCount", "postsCount", "engagementRate",
           bio, country, language, category,
           score, "fitSummary", "routeIdeas", "rawData",
           selected, status, "createdAt")
        VALUES
          ($1, 'instagram', $2, $3, $4, $5,
           $6, $7, null,
           $8, $9, $10, $11,
           $12, $13, $14::jsonb, $15::jsonb,
           false, $16, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id, username
      `, [
        runId, username, p.displayName, p.profileUrl, p.avatarUrl,
        p.followerCount ?? p.followersCount ?? null,
        p.postCount     ?? p.postsCount     ?? null,
        p.bio || null, p.country || null, p.language || null, p.category || 'travel',
        p.score ?? null,
        p.fitSummary || null,
        JSON.stringify(Array.isArray(p.routeIdeas) ? p.routeIdeas : []),
        JSON.stringify({
          source: 'meta_instagram_business_discovery',
          provider: 'meta_instagram',
          verificationStatus: 'verified',
          website: p.website || null,
          followsCount: p.followsCount ?? null,
          media: p.rawData?.media || [],
          existingLeadId: existingLead?.id || null,
          existingLeadStatus: existingLead?.status || null,
        }),
        resultStatus,
      ]);

      if (resRows.length) {
        if (existingLead) resRows[0].lead_id = existingLead.id;
        insertedResults.push(resRows[0]);
        inserted++;
      }
    } catch (e) {
      console.warn(`[meta_discovery] insert failed for @${username}:`, e.message);
      skipped++;
    }
  }

  const errorSummary = Object.keys(errors).length > 0
    ? `Errors (${Object.keys(errors).length}): ${Object.entries(errors).map(([u, m]) => `@${u}: ${m}`).join('; ')}`
    : null;

  await pool.query(
    `UPDATE "CreatorDiscoveryRun" SET status = 'completed', "resultsCount" = $2, "errorMessage" = COALESCE("errorMessage", $3), "updatedAt" = NOW() WHERE id = $1`,
    [runId, inserted, errorSummary]
  );

  const { rows: finalRun } = await pool.query(`SELECT * FROM "CreatorDiscoveryRun" WHERE id = $1`, [runId]);
  return {
    run: finalRun[0], results: insertedResults, inserted, skipped, errors,
    errorsCount: Object.keys(errors).length,
    providerStatus: { provider: 'meta_instagram_business_discovery' },
  };
}

async function crmVerifyProfile(pool, body) {
  const { resultId } = body;
  if (!resultId) throw Object.assign(new Error('resultId required'), { status: 400 });

  const { rows } = await pool.query(
    `SELECT id, username, "rawData" FROM "CreatorDiscoveryResult" WHERE id = $1 LIMIT 1`,
    [resultId]
  );
  if (!rows.length) throw Object.assign(new Error('Result not found'), { status: 404 });
  const result = rows[0];

  const { verifyInstagramCreatorProfile } = await import('./_lib/creatorDiscoveryProviders.js');
  const v = await verifyInstagramCreatorProfile(result.username);
  console.log(`[Discovery] verifyProfile @${result.username}:`, { verified: v.verified, code: v.code || null, error: v.error || null });

  if (v.code === 'META_PROVIDER_NOT_CONFIGURED') {
    return {
      verified:    false,
      configError: true,
      missing:     v.missing,
      error:       v.error,
      result,
    };
  }

  const currentRaw = (typeof result.rawData === 'object' && result.rawData) ? result.rawData : {};
  const now        = new Date().toISOString();

  if (v.verified) {
    const newRaw = {
      ...currentRaw,
      verificationStatus:    'verified',
      metricsSource:         'meta_business_discovery',
      followersSource:       'meta_business_discovery',
      verifiedAt:            now,
      verificationError:     null,
      metaBusinessDiscovery: v.rawMetaProfile || null,
    };
    await pool.query(`
      UPDATE "CreatorDiscoveryResult"
      SET "followersCount" = $1,
          "postsCount"     = $2,
          bio              = COALESCE($3, bio),
          "avatarUrl"      = COALESCE($4, "avatarUrl"),
          "displayName"    = COALESCE($5, "displayName"),
          "profileUrl"     = COALESCE($6, "profileUrl"),
          "rawData"        = $7::jsonb
      WHERE id = $8
    `, [v.followersCount, v.postsCount, v.bio, v.avatarUrl, v.displayName, v.profileUrl, JSON.stringify(newRaw), resultId]);
  } else {
    const newRaw = {
      ...currentRaw,
      verificationStatus: 'unverified',
      metricsSource:      v.metricsSource || 'not_available',
      verificationError:  v.error,
      verifiedAt:         now,
    };
    await pool.query(
      `UPDATE "CreatorDiscoveryResult" SET "rawData" = $1::jsonb WHERE id = $2`,
      [JSON.stringify(newRaw), resultId]
    );
  }

  const { rows: updated } = await pool.query(
    `SELECT * FROM "CreatorDiscoveryResult" WHERE id = $1`, [resultId]
  );
  return { result: updated[0], verified: v.verified, error: v.error || null };
}

async function crmVerifyAllProfiles(pool, body) {
  const { runId, limit = 20 } = body;
  if (!runId) throw Object.assign(new Error('runId required'), { status: 400 });

  const { rows: toVerify } = await pool.query(`
    SELECT id, username, "rawData"
    FROM "CreatorDiscoveryResult"
    WHERE "runId" = $1
      AND ("rawData"->>'verificationStatus' IS NULL OR "rawData"->>'verificationStatus' = 'unverified')
    ORDER BY COALESCE(score, 0) DESC, "createdAt" DESC
    LIMIT $2
  `, [runId, Math.min(parseInt(limit, 10) || 20, 50)]);

  if (!toVerify.length) return { verified: 0, failed: 0, skipped: 0, total: 0 };

  const { validateMetaConfig, verifyInstagramCreatorProfile } = await import('./_lib/creatorDiscoveryProviders.js');
  const metaConfig = validateMetaConfig();
  if (!metaConfig.configured) {
    return {
      verified: 0, failed: 0, skipped: toVerify.length, total: toVerify.length,
      configError: true,
      missing: metaConfig.missing,
      error: `Meta provider not configured. Missing: ${metaConfig.missing.join(', ')}`,
    };
  }

  let verified = 0, failed = 0;

  for (const row of toVerify) {
    try {
      const v = await verifyInstagramCreatorProfile(row.username);
      const currentRaw = (typeof row.rawData === 'object' && row.rawData) ? row.rawData : {};
      const now = new Date().toISOString();

      if (v.verified) {
        const newRaw = {
          ...currentRaw,
          verificationStatus:    'verified',
          metricsSource:         'meta_business_discovery',
          followersSource:       'meta_business_discovery',
          verifiedAt:            now,
          verificationError:     null,
          metaBusinessDiscovery: v.rawMetaProfile || null,
        };
        await pool.query(`
          UPDATE "CreatorDiscoveryResult"
          SET "followersCount" = $1, "postsCount" = $2,
              bio = COALESCE($3, bio), "avatarUrl" = COALESCE($4, "avatarUrl"),
              "displayName" = COALESCE($5, "displayName"),
              "profileUrl"  = COALESCE($6, "profileUrl"),
              "rawData"     = $7::jsonb
          WHERE id = $8
        `, [v.followersCount, v.postsCount, v.bio, v.avatarUrl, v.displayName, v.profileUrl, JSON.stringify(newRaw), row.id]);
        verified++;
      } else {
        const newRaw = { ...currentRaw, verificationStatus: 'unverified', metricsSource: 'not_available', verificationError: v.error, verifiedAt: now };
        await pool.query(`UPDATE "CreatorDiscoveryResult" SET "rawData" = $1::jsonb WHERE id = $2`, [JSON.stringify(newRaw), row.id]);
        failed++;
      }
    } catch (e) {
      console.error(`[Discovery] verifyAll error for @${row.username}:`, e.message);
      failed++;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`[Discovery] verifyAllProfiles runId=${runId}: verified=${verified} failed=${failed} total=${toVerify.length}`);
  return { verified, failed, skipped: 0, total: toVerify.length };
}

async function crmMarkRunCompleted(pool, id) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { rows } = await pool.query(
    `UPDATE "CreatorDiscoveryRun" SET status = 'completed', "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { run: rows[0] };
}

async function crmUpdateLead(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });

  const allowed = [
    'displayName','firstName','email','websiteUrl','bio','country','language','category','platform',
    'niches','destinations','hashtags','mentions',
    'followersCount','postsCount',
    'engagementRate','score','priority','assignedTo',
    'status',
    'lastContactedAt','nextFollowUpAt',
    'fitSummary','routeIdeas','positiveSignals','risks','nextBestAction',
    'avatarUrl','profileUrl','username',
  ];

  // Validate status before processing
  if ('status' in body && body.status != null && body.status !== '') {
    if (!PIPELINE_STATUSES.includes(body.status)) {
      throw Object.assign(new Error(`Invalid status: ${body.status}`), { status: 400 });
    }
  }

  const jsonFields = new Set(['niches','destinations','hashtags','mentions','routeIdeas','positiveSignals','risks']);

  // Normalize and dedup-check username if being changed
  let updates = { ...body };
  if ('username' in updates && updates.username) {
    const normalized = String(updates.username).replace(/^@/, '').toLowerCase().trim();
    if (normalized) {
      const { rows: dup } = await pool.query(
        `SELECT id FROM "CreatorLead" WHERE lower(username) = $1 AND id != $2 LIMIT 1`,
        [normalized, id]
      );
      if (dup.length) {
        throw Object.assign(new Error(`@${normalized} already exists in CRM`), { status: 409 });
      }
      updates.username = normalized;
    } else {
      delete updates.username;
    }
  }

  const sets = [];
  const params = [];
  let p = 1;

  for (const key of allowed) {
    if (!(key in updates)) continue;
    const val = updates[key];

    if (jsonFields.has(key)) {
      sets.push(`"${key}" = $${p++}::jsonb`);
      params.push(JSON.stringify(Array.isArray(val) ? val : []));
    } else if (key === 'priority') {
      // DB column is INTEGER: map string labels or pass numeric value
      const pMap = { low: 0, medium: 1, high: 2 };
      const pVal = val === '' || val == null
        ? null
        : typeof val === 'string' && val in pMap
          ? pMap[val]
          : parseInt(val, 10);
      sets.push(`"priority" = $${p++}`);
      params.push(Number.isNaN(pVal) ? null : pVal);
    } else {
      sets.push(`"${key}" = $${p++}`);
      params.push(val === '' ? null : val);
    }
  }

  if (!sets.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  sets.push(`"updatedAt" = NOW()`);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE "CreatorLead" SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    params
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { lead: rows[0] };
}

async function crmChangeStatus(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { status, note } = body;
  if (!PIPELINE_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Invalid status. Valid values: ${PIPELINE_STATUSES.join(', ')}`), { status: 400 });
  }

  const { rows: prev } = await pool.query(
    `SELECT status FROM "CreatorLead" WHERE id = $1 LIMIT 1`, [id]
  );
  if (!prev.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const prevStatus = prev[0].status;

  const { rows } = await pool.query(
    `UPDATE "CreatorLead" SET status = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );

  await pool.query(`
    INSERT INTO "CreatorLeadActivity"
      (id, "leadId", type, body, metadata, "createdById", "createdAt")
    VALUES
      (gen_random_uuid(), $1, 'status_change', $2, $3::jsonb, $4, NOW())
  `, [
    id,
    note || `Status changed from ${prevStatus} to ${status}`,
    JSON.stringify({ from: prevStatus, to: status }),
    (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null),
  ]);

  return { lead: rows[0] };
}

async function crmBulkChangeStatus(pool, body, ctx) {
  const { leadIds, updates } = body;
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw Object.assign(new Error('leadIds must be a non-empty array'), { status: 400 });
  }
  if (leadIds.length > 200) {
    throw Object.assign(new Error('Max 200 leads per bulk update'), { status: 400 });
  }
  const { status } = updates ?? {};
  if (!status) throw Object.assign(new Error('updates.status is required'), { status: 400 });
  if (!PIPELINE_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Invalid status. Valid: ${PIPELINE_STATUSES.join(', ')}`), { status: 400 });
  }

  const placeholders = leadIds.map((_, i) => `$${i + 2}`).join(', ');
  const { rows: updated, rowCount } = await pool.query(
    `UPDATE "CreatorLead" SET status = $1, "updatedAt" = NOW()
     WHERE id IN (${placeholders}) RETURNING id`,
    [status, ...leadIds]
  );

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;
  if (updated.length > 0) {
    try {
      await pool.query(`
        INSERT INTO "CreatorLeadActivity"
          (id, "leadId", type, body, metadata, "createdById", "createdAt")
        SELECT gen_random_uuid(), unnest($1::uuid[]), 'status_change',
               $2, $3::jsonb, $4, NOW()
      `, [
        updated.map(r => r.id),
        `Bulk status set to ${status}`,
        JSON.stringify({ bulk: true, to: status }),
        createdById,
      ]);
    } catch (actErr) {
      console.warn('[bulkChangeStatus] activity log failed (non-blocking):', actErr.message);
    }
  }

  return { updated: rowCount, updatedIds: updated.map(r => r.id) };
}

async function crmAddNote(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { content } = body;
  if (!content?.trim()) throw Object.assign(new Error('content is required'), { status: 400 });

  const { rows } = await pool.query(`
    INSERT INTO "CreatorLeadActivity"
      (id, "leadId", type, body, metadata, "createdById", "createdAt")
    VALUES (gen_random_uuid(), $1, 'note', $2, '{}'::jsonb, $3, NOW())
    RETURNING *
  `, [id, content.trim(), (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null)]);

  return { activity: rows[0] };
}

const VALID_TASK_STATUSES = new Set(['open','done','cancelled','snoozed']);
const VALID_TASK_TYPES    = new Set(['follow_up','demo','prepare_proposal','review','other']);
function normalizeTaskStatus(s) {
  if (!s) return 'open';
  if (VALID_TASK_STATUSES.has(s)) return s;
  if (s === 'pending' || s === 'todo' || s === 'active' || s === 'scheduled' || s === 'new') return 'open';
  if (s === 'completed') return 'done';
  return 'open';
}
function normalizeTaskType(t) {
  if (!t) return 'follow_up';
  return VALID_TASK_TYPES.has(t) ? t : 'follow_up';
}

async function crmCreateTask(pool, id, body, ctx) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { title, description, dueAt, type } = body;
  if (!title?.trim()) throw Object.assign(new Error('title is required'), { status: 400 });

  const taskType = normalizeTaskType(type);
  const { rows } = await pool.query(`
    INSERT INTO "CreatorLeadTask"
      (id, "leadId", type, title, description, "dueAt", status, "createdById", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), $1, $2, $3, $4, $5, 'open', $6, NOW(), NOW())
    RETURNING *
  `, [id, taskType, title.trim(), description || null, dueAt || null, (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null)]);

  await pool.query(`
    INSERT INTO "CreatorLeadActivity"
      (id, "leadId", type, body, metadata, "createdById", "createdAt")
    VALUES (gen_random_uuid(), $1, 'task_created', $2, '{}'::jsonb, $3, NOW())
  `, [id, `Task created: ${title.trim()}`, (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null)]);

  return { task: rows[0] };
}

async function crmUpdateTask(pool, taskId, body, ctx) {
  if (!taskId) throw Object.assign(new Error('taskId required'), { status: 400 });
  const { status: rawStatus, completedAt, title, description, dueAt } = body;

  const sets = [];
  const params = [];
  let p = 1;

  if (title !== undefined)       { sets.push(`title = $${p++}`); params.push(title); }
  if (description !== undefined) { sets.push(`description = $${p++}`); params.push(description); }
  if (dueAt !== undefined)       { sets.push(`"dueAt" = $${p++}`); params.push(dueAt); }
  if (rawStatus !== undefined) {
    const normStatus = normalizeTaskStatus(rawStatus);
    sets.push(`status = $${p++}`); params.push(normStatus);
  }
  if (completedAt !== undefined) { sets.push(`"completedAt" = $${p++}`); params.push(completedAt); }

  if (!sets.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  sets.push(`"updatedAt" = NOW()`);
  params.push(taskId);

  const { rows } = await pool.query(
    `UPDATE "CreatorLeadTask" SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    params
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

  if (rows[0].status === 'done' && rawStatus !== undefined) {
    try {
      await pool.query(`
        INSERT INTO "CreatorLeadActivity"
          (id, "leadId", type, body, metadata, "createdById", "createdAt")
        VALUES (gen_random_uuid(), $1, 'task_completed', $2, '{}'::jsonb, $3, NOW())
      `, [rows[0].leadId, `Task completed: ${rows[0].title}`, (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null)]);
    } catch (actErr) {
      console.warn('[crmUpdateTask] activity log failed (non-blocking):', actErr.message);
    }
  }

  return { task: rows[0] };
}

async function crmCreateTemplate(pool, body, ctx) {
  const { name, platform = 'instagram', language = 'pt', subject, bodyText, variables = [] } = body;
  if (!name?.trim() || !bodyText?.trim()) {
    throw Object.assign(new Error('name and bodyText are required'), { status: 400 });
  }

  const { rows } = await pool.query(`
    INSERT INTO "CreatorMessageTemplate"
      (id, name, platform, language, subject, body, variables, "isActive", "createdById", "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, true, $7, NOW(), NOW())
    RETURNING *
  `, [
    name.trim(), platform, language,
    subject || null, bodyText.trim(),
    JSON.stringify(Array.isArray(variables) ? variables : []),
    (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null),
  ]);
  return { template: rows[0] };
}

async function crmUpdateTemplate(pool, id, body) {
  if (!id) throw Object.assign(new Error('id required'), { status: 400 });
  const { name, subject, bodyText, variables, isActive, platform, language } = body;

  const sets = [];
  const params = [];
  let p = 1;

  if (name !== undefined)      { sets.push(`name = $${p++}`); params.push(name); }
  if (platform !== undefined)  { sets.push(`platform = $${p++}`); params.push(platform); }
  if (language !== undefined)  { sets.push(`language = $${p++}`); params.push(language); }
  if (subject !== undefined)   { sets.push(`subject = $${p++}`); params.push(subject); }
  if (bodyText !== undefined)  { sets.push(`body = $${p++}`); params.push(bodyText); }
  if (variables !== undefined) { sets.push(`variables = $${p++}::jsonb`); params.push(JSON.stringify(variables)); }
  if (isActive !== undefined)  { sets.push(`"isActive" = $${p++}`); params.push(isActive); }

  if (!sets.length) throw Object.assign(new Error('Nothing to update'), { status: 400 });
  sets.push(`"updatedAt" = NOW()`);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE "CreatorMessageTemplate" SET ${sets.join(', ')} WHERE id = $${p} RETURNING *`,
    params
  );
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { template: rows[0] };
}

function crmPersonalizeTemplate(templateBody, lead) {
  const firstName = lead.firstName || lead.displayName?.split(' ')[0] || lead.username;
  const destinationOrTheme = (
    (Array.isArray(lead.destinations) ? lead.destinations : [])[0] ||
    (Array.isArray(lead.niches) ? lead.niches : [])[0] ||
    lead.category || 'travel'
  );
  return templateBody
    .replace(/\{\{firstName\}\}/g, firstName || '')
    .replace(/\{\{destinationOrTheme\}\}/g, destinationOrTheme || '')
    .replace(/\{\{username\}\}/g, lead.username || '')
    .replace(/\{\{language\}\}/g, lead.language || '');
}

async function crmGenerateMessage(pool, leadId, body) {
  if (!leadId) throw Object.assign(new Error('id (leadId) required'), { status: 400 });
  const { templateId } = body;

  const { rows: leadRows } = await pool.query(
    `SELECT * FROM "CreatorLead" WHERE id = $1 LIMIT 1`, [leadId]
  );
  if (!leadRows.length) throw Object.assign(new Error('Lead not found'), { status: 404 });
  const lead = leadRows[0];

  let template = null;
  if (templateId) {
    const { rows: tmplRows } = await pool.query(
      `SELECT * FROM "CreatorMessageTemplate" WHERE id = $1 LIMIT 1`, [templateId]
    );
    template = tmplRows[0] || null;
  } else {
    const { rows: tmplRows } = await pool.query(
      `SELECT * FROM "CreatorMessageTemplate" WHERE "isActive" = true AND platform = $1 ORDER BY "createdAt" LIMIT 1`,
      [lead.platform || 'instagram']
    );
    template = tmplRows[0] || null;
  }

  if (!template) {
    const fallback = `Hi ${lead.displayName?.split(' ')[0] || lead.username}, I came across your content and love what you create. I'd love to chat about collaborating with HiddenAtlas on a premium travel itinerary.`;
    return { personalizedBody: fallback, templateId: null, templateName: null };
  }

  const personalizedBody = crmPersonalizeTemplate(template.body, lead);
  return {
    personalizedBody,
    templateId: template.id,
    templateName: template.name,
    subject: template.subject,
  };
}

async function crmSaveMessage(pool, leadId, body, ctx) {
  if (!leadId) throw Object.assign(new Error('id (leadId) required'), { status: 400 });
  const { templateId, personalizedBody, channel = 'instagram', subject } = body;
  if (!personalizedBody?.trim()) throw Object.assign(new Error('personalizedBody is required'), { status: 400 });

  const createdById = ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null;

  const { rows: leadRows } = await pool.query(
    `SELECT username, "profileUrl", platform FROM "CreatorLead" WHERE id = $1 LIMIT 1`, [leadId]
  );
  const lead = leadRows[0];
  const resolvedChannel = channel || lead?.platform || 'instagram';
  const metadata = JSON.stringify({
    deliveryMode: 'manual',
    username: lead?.username || null,
    profileUrl: lead?.profileUrl || (lead?.username ? `https://www.instagram.com/${lead.username}/` : null),
    source: 'lead_message_draft',
  });

  const { rows } = await pool.query(`
    INSERT INTO "CreatorLeadMessage"
      (id, "leadId", "templateId", channel, direction, subject, body, status,
       "createdById", metadata, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), $1, $2, $3, 'outbound', $4, $5, 'draft',
       $6, $7::jsonb, NOW(), NOW())
    RETURNING *
  `, [leadId, templateId || null, resolvedChannel, subject || null, personalizedBody.trim(), createdById, metadata]);

  try {
    await pool.query(`
      INSERT INTO "CreatorLeadActivity"
        (id, "leadId", type, body, metadata, "createdById", "createdAt")
      VALUES (gen_random_uuid(), $1, 'message_prepared', 'Message saved as draft', '{}'::jsonb, $2, NOW())
    `, [leadId, createdById]);
  } catch (actErr) {
    console.warn('[crmSaveMessage] activity log failed (non-blocking):', actErr.message);
  }

  return { message: rows[0] };
}

async function crmMarkCopied(pool, msgId) {
  if (!msgId) throw Object.assign(new Error('msgId required'), { status: 400 });
  const { rows } = await pool.query(`
    UPDATE "CreatorLeadMessage"
    SET status = 'copied', "copiedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `, [msgId]);
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  return { message: rows[0] };
}

async function crmMarkSent(pool, msgId, ctx) {
  if (!msgId) throw Object.assign(new Error('msgId required'), { status: 400 });
  const { rows: msgRows } = await pool.query(
    `SELECT * FROM "CreatorLeadMessage" WHERE id = $1 LIMIT 1`, [msgId]
  );
  if (!msgRows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const msg = msgRows[0];

  const senderId = (ctx.userId && !ctx.userId.startsWith('user_') ? ctx.userId : null);
  await pool.query(`
    UPDATE "CreatorLeadMessage"
    SET status = 'sent',
        "sentAt" = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'deliveryMode', 'manual',
          'sentManually', true,
          'sentManuallyById', $2,
          'sentManuallyAt', NOW()::text
        ),
        "updatedAt" = NOW()
    WHERE id = $1
  `, [msgId, senderId]);

  try {
    await pool.query(`
      UPDATE "CreatorLead"
      SET "lastContactedAt" = NOW(), "updatedAt" = NOW(),
          status = CASE
            WHEN status IN ('identified','qualified','message_prepared') THEN 'contacted'
            ELSE status
          END
      WHERE id = $1
    `, [msg.leadId]);

    await pool.query(`
      INSERT INTO "CreatorLeadActivity"
        (id, "leadId", type, body, metadata, "createdById", "createdAt")
      VALUES (gen_random_uuid(), $1, 'message_sent', 'Message marked as sent manually', '{}'::jsonb, $2, NOW())
    `, [msg.leadId, senderId]);

    const dueAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const { rows: existingTasks } = await pool.query(`
      SELECT id FROM "CreatorLeadTask"
      WHERE "leadId" = $1 AND status = 'open' AND "dueAt" > NOW()
      LIMIT 1
    `, [msg.leadId]);

    if (!existingTasks.length) {
      await pool.query(`
        INSERT INTO "CreatorLeadTask"
          (id, "leadId", title, "dueAt", status, type, "createdById", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, 'Follow up on message', $2, 'open', 'follow_up', $3, NOW(), NOW())
      `, [msg.leadId, dueAt.toISOString(), senderId]);
    }
  } catch (err) {
    console.warn('[crmMarkSent] post-update side effects failed:', err.message);
  }

  return { ok: true };
}
