import pg from 'pg';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

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
      res.status(500).json({ error: 'Internal server error', detail: err.message });
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

  const { action, period = '7d', page = '1', q = '', id, status, from } = req.query;
  const cutoff = parseCutoff(from, period);
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * 50;

  try {
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
          return res.status(502).json({ error: 'Email delivery failed', detail: JSON.stringify(result.error) });
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
          return res.status(502).json({ error: `Stripe error: ${stripeErr.message}` });
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
        safe('kpis',           () => getDashboardKPIs(pool, cutoff),    KPI_ZERO),
        safe('chart',          () => getChartData(pool, cutoff),         []),
        safe('funnel',         () => getFunnelData(pool, cutoff),        FUNNEL_ZERO),
        safe('topItineraries', () => getTopItineraries(pool, cutoff),    []),
        safe('sources',        () => getTrafficSources(pool, cutoff),    []),
        safe('activity',       () => getRecentActivity(pool, cutoff),    []),
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
    if (action === 'sales')     return res.status(200).json(await getSales(pool, cutoff, offset));
    if (action === 'downloads') return res.status(200).json(await getDownloads(pool, cutoff, offset));
    if (action === 'custom-requests') return res.status(200).json(await getCustomRequests(pool, status, offset, req.query.all === 'true', adminCtx));

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
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    try { await pool.end(); } catch {}
  }
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
async function getDashboardKPIs(pool, cutoff) {
  // ── Core query: uses only legacy columns — always safe ───────────────────
  const [visitors, pageViews, newUsers, itinViews, downloads, sales] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "User" WHERE "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1`, [cutoff]),
    // Revenue: COALESCE(netAmount, amount, 0) handles legacy rows (netAmount NULL) and new rows
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
  ]);

  // ── Discount breakdown: uses new columns — fails gracefully if not migrated yet ──
  const discountRow = await pool.query(`
    SELECT
      COALESCE(SUM(COALESCE("grossAmount", amount, 0)),0)    AS gross_revenue,
      COALESCE(SUM(COALESCE("netAmount",   amount, 0)),0)    AS net_revenue,
      COALESCE(SUM(COALESCE("discountAmount", 0)),0)         AS total_discount
    FROM "Purchase" WHERE "purchasedAt" >= $1
  `, [cutoff]).then(r => r.rows[0]).catch(() => ({ gross_revenue: 0, net_revenue: 0, total_discount: 0 }));

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
async function getChartData(pool, cutoff) {
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
      -- Uses only legacy amount column - always safe regardless of migration state
      SELECT DATE("purchasedAt") AS day,
        COUNT(*)               AS sales,
        COALESCE(SUM(amount),0) AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= $1
      GROUP BY DATE("purchasedAt")
    ),
    dl AS (
      SELECT DATE("createdAt") AS day, COUNT(*) AS downloads
      FROM "TripEvent"
      WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
      GROUP BY DATE("createdAt")
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

// ── Funnel ────────────────────────────────────────────────────────────────────
async function getFunnelData(pool, cutoff) {
  const [v, iv, dl, p] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
  ]);
  return {
    visitors:       parseInt(v.rows[0].n, 10)  || 0,
    itineraryViews: parseInt(iv.rows[0].n, 10) || 0,
    downloads:      parseInt(dl.rows[0].n, 10) || 0,
    purchases:      parseInt(p.rows[0].n, 10)  || 0,
  };
}

// ── Top itineraries ───────────────────────────────────────────────────────────
async function getTopItineraries(pool, cutoff) {
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
      SELECT t."itinerarySlug", COUNT(*) AS downloads
      FROM "TripEvent" te JOIN "Trip" t ON t.id = te."tripId"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
        AND t."itinerarySlug" IS NOT NULL
      GROUP BY t."itinerarySlug"
    ) d ON d."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT "itineraryId",
        COUNT(*) AS sales,
        COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= $1
      GROUP BY "itineraryId"
    ) s ON s."itineraryId" = i.id
    ORDER BY COALESCE(s.sales,0) DESC, COALESCE(d.downloads,0) DESC, COALESCE(v.views,0) DESC
    LIMIT 20
  `, [cutoff]);
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
async function getRecentActivity(pool, cutoff) {
  const { rows } = await pool.query(`
    (
      SELECT 'signup' AS type, u.email, u.name, NULL::text AS country, NULL::text AS detail, u."createdAt" AS ts
      FROM "User" u
      WHERE u."createdAt" >= $1
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'download' AS type, u.email, u.name, NULL::text AS country,
        COALESCE(te.metadata->>'title', te.metadata->>'destination', 'trip') AS detail,
        te."createdAt" AS ts
      FROM "TripEvent" te JOIN "User" u ON u.id=te."userId"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'purchase' AS type, u.email, u.name, NULL::text AS country,
        COALESCE(i.title, p."itineraryId") AS detail,
        p."purchasedAt" AS ts
      FROM "Purchase" p
      JOIN "User" u ON u.id=p."userId"
      LEFT JOIN "Itinerary" i ON i.id=p."itineraryId"
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
async function getSales(pool, cutoff, offset) {
  // ── Sales rows ────────────────────────────────────────────────────────────
  // Try with discount columns; fall back to legacy-only if migration not yet applied.
  let sales;
  try {
    const { rows } = await pool.query(`
      SELECT p."purchasedAt", u.email, u.name, i.title AS itinerary, i.slug,
             p.amount,
             COALESCE(p."grossAmount", p.amount)  AS "grossAmount",
             COALESCE(p."discountAmount", 0)       AS "discountAmount",
             p."couponCode",
             p.status
      FROM "Purchase" p
      JOIN "User" u ON u.id=p."userId"
      JOIN "Itinerary" i ON i.id=p."itineraryId"
      WHERE p."purchasedAt" >= $1
      ORDER BY p."purchasedAt" DESC
      LIMIT 50 OFFSET $2
    `, [cutoff, offset]);
    sales = rows;
  } catch (err) {
    if (!err.message.toLowerCase().includes('column')) throw err;
    // Discount columns not yet added — serve legacy data with safe defaults
    const { rows } = await pool.query(`
      SELECT p."purchasedAt", u.email, u.name, i.title AS itinerary, i.slug,
             p.amount, p.amount AS "grossAmount", 0 AS "discountAmount",
             NULL::text AS "couponCode", p.status
      FROM "Purchase" p
      JOIN "User" u ON u.id=p."userId"
      JOIN "Itinerary" i ON i.id=p."itineraryId"
      WHERE p."purchasedAt" >= $1
      ORDER BY p."purchasedAt" DESC
      LIMIT 50 OFFSET $2
    `, [cutoff, offset]);
    sales = rows;
  }

  // ── Totals: COALESCE(netAmount, amount, 0) handles legacy rows ────────────
  const { rows: [{ total, revenue }] } = await pool.query(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue
    FROM "Purchase" WHERE "purchasedAt" >= $1
  `, [cutoff]);

  // Discount totals — fail gracefully if columns not yet present
  const discountTotals = await pool.query(`
    SELECT COALESCE(SUM(COALESCE("discountAmount", 0)),0) AS total_discount
    FROM "Purchase" WHERE "purchasedAt" >= $1
  `, [cutoff]).then(r => r.rows[0]).catch(() => ({ total_discount: 0 }));

  const { rows: [allTime] } = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(COALESCE("netAmount", amount, 0)),0) AS revenue FROM "Purchase"`
  );
  const allTimeDiscount = await pool.query(
    `SELECT COALESCE(SUM(COALESCE("discountAmount", 0)),0) AS total_discount FROM "Purchase"`
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
async function getCustomRequests(pool, statusParam, offset, noLimit = false, ctx = null) {
  const isAdmin        = ctx?.isAdmin ?? true;
  const designerUserId = !isAdmin ? (ctx?.userId ?? null) : null;

  const VALID = ['open', 'in_progress', 'done'];
  const statuses = (!noLimit && statusParam)
    ? statusParam.split(',').map(s => s.trim()).filter(s => VALID.includes(s))
    : [];

  const PAID_EXISTS = `
    EXISTS (
      SELECT 1 FROM "Purchase" p
      WHERE p."itineraryId" = cr."itineraryId"
        AND (p.status IS NULL OR p.status NOT IN ('refunded', 'cancelled', 'chargebacked'))
    )`;

  // Build WHERE conditions and params dynamically.
  const conditions = [];
  const params     = [];

  if (!noLimit && statuses.length > 0) {
    params.push(statuses);
    conditions.push(`cr.status = ANY($${params.length}::text[])`);
  }
  if (designerUserId) {
    params.push(designerUserId);
    conditions.push(`cr."designerId" = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let limitClause = '';
  if (!noLimit) {
    params.push(offset);
    limitClause = `LIMIT 50 OFFSET $${params.length}`;
  }

  // Join designer user for admin display
  const designerSelect = isAdmin
    ? `, d.name AS "designerName", d.email AS "designerEmail"`
    : '';
  const designerJoin = isAdmin
    ? `LEFT JOIN "User" d ON d.id = cr."designerId"`
    : '';

  const { rows: requests } = await pool.query(
    `SELECT
       cr.id, cr."fullName", cr.email, cr.phone, cr.destination, cr.dates, cr.duration,
       cr."groupSize", cr."groupType", cr.budget, cr.style, cr.notes, cr.status,
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
       (cr."paidAt" IS NOT NULL OR (cr."itineraryId" IS NOT NULL AND ${PAID_EXISTS})) AS "isPaid"
       ${designerSelect}
     FROM "CustomRequest" cr
     LEFT JOIN "Itinerary" itin ON itin.id = cr."itineraryId"
     ${designerJoin}
     ${whereClause}
     ORDER BY cr."createdAt" DESC
     ${limitClause}`,
    params
  );

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

  // Payment counts and designers list — admin only (expensive / not needed by designer).
  let paymentCounts = { paid: 0, unpaid: 0 };
  let designers     = [];

  if (isAdmin) {
    const paymentRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE cr."paidAt" IS NOT NULL OR (cr."itineraryId" IS NOT NULL AND ${PAID_EXISTS})) AS paid,
         COUNT(*) FILTER (WHERE cr."quoteSentAt" IS NOT NULL AND cr."paidAt" IS NULL AND (cr."itineraryId" IS NULL OR NOT ${PAID_EXISTS})) AS quote_sent,
         COUNT(*) FILTER (WHERE cr."quoteSentAt" IS NULL AND cr."paidAt" IS NULL AND (cr."itineraryId" IS NULL OR NOT ${PAID_EXISTS})) AS unpaid
       FROM "CustomRequest" cr`
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
async function getDownloads(pool, cutoff, offset) {
  const { rows: downloads } = await pool.query(`
    SELECT
      te."createdAt", u.email, u.name,
      COALESCE(t.title, te.metadata->>'title', te.metadata->>'destination') AS title,
      t."itinerarySlug", t.source AS trip_source, t.destination
    FROM "TripEvent" te
    JOIN "User" u ON u.id=te."userId"
    LEFT JOIN "Trip" t ON t.id=te."tripId"
    WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
    ORDER BY te."createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [cutoff, offset]);

  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*) AS total FROM "TripEvent"
    WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
  `, [cutoff]);

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
