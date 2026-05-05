import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Parse group size strings like "1-2", "3-8", "13+" into [paxMin, paxMax].
// Returns [null, null] when input is absent or unparseable.
function parsePaxRange(str) {
  if (!str) return [null, null];
  const s = String(str).trim();
  const range = s.match(/^(\d+)-(\d+)$/);
  if (range) return [parseInt(range[1], 10), parseInt(range[2], 10)];
  const plus = s.match(/^(\d+)\+$/);
  if (plus) return [parseInt(plus[1], 10), null];
  const num = parseInt(s, 10);
  if (!isNaN(num)) return [num, num];
  return [null, null];
}

// POST /api/custom
//   Submit a custom trip planning request (was /api/custom-planning).
//   Optional auth — works for anonymous users too.
//
// GET /api/custom
//   Return the authenticated user's custom planning requests (was /api/custom-requests).
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ── GET /api/custom — list user's requests ───────────────────────────────
  if (req.method === 'GET') {
    if (!process.env.CLERK_SECRET_KEY) {
      return res.status(500).json({ error: 'Server misconfigured' });
    }
    let clerkId;
    try {
      clerkId = await verifyAuth(req.headers.authorization);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const userRes = await pool.query(
        `SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
      );
      const userId = userRes.rows[0]?.id;
      if (!userId) return res.status(200).json([]);

      const { rows } = await pool.query(`
        SELECT
          cr.id,
          cr.destination,
          cr.dates,
          cr.status,
          cr."createdAt",
          cr."tripId",
          t.title              AS "tripTitle",
          t.destination        AS "tripDestination",
          t."itinerarySlug"    AS "tripItinerarySlug",
          itin.status          AS "linkedItineraryStatus",
          itin.slug            AS "linkedItinerarySlug",
          itin.title           AS "linkedItineraryTitle",
          itin."coverImage"    AS "linkedItineraryCoverImage",
          itin."pdfUrl"        AS "linkedItineraryPdfUrl",
          itin."durationDays"  AS "linkedItineraryDurationDays",
          itin.country         AS "linkedItineraryCountry"
        FROM "CustomRequest" cr
        LEFT JOIN "Trip" t         ON t.id    = cr."tripId"
        LEFT JOIN "Itinerary" itin ON itin.id = cr."itineraryId"
        WHERE cr."userId" = $1
        ORDER BY cr."createdAt" DESC
      `, [userId]);

      return res.status(200).json(rows);
    } catch (err) {
      console.error('[custom/get] error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end().catch(() => {});
    }
  }

  // ── POST /api/custom — submit planning request ───────────────────────────
  const {
    name,
    email,
    phone,
    destination,
    dates,
    duration,
    groupSize,
    groupType,
    budget,
    style,
    notes,
    designerSlug,
  } = req.body || {};

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  // Optional auth — resolve userId if JWT is present (non-fatal for anonymous)
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
    } catch { /* anonymous */ }
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });

  let insertedId = null;

  const [paxMin, paxMax] = parsePaxRange(groupSize);

  // Params for the main INSERT (includes paxMin/paxMax)
  const insertParams = [
    name.trim(),
    email.trim().toLowerCase(),
    destination?.trim() || null,
    dates?.trim()       || null,
    paxMin,     // $5 — "groupSize" stores paxMin for backward compat
    paxMin,     // $6 — "paxMin"
    paxMax,     // $7 — "paxMax"
    notes?.trim() || null,  // $8
  ];

  // Legacy params for the status-column-absent fallback (smaller set)
  const legacyInsertParams = [
    name.trim(),
    email.trim().toLowerCase(),
    destination?.trim() || null,
    dates?.trim()       || null,
    paxMin,
    notes?.trim() || null,
  ];

  try {
    const { rows } = await pool.query(
      `INSERT INTO "CustomRequest"
         (id, "fullName", email, destination, dates, "groupSize", "paxMin", "paxMax", notes, status, "createdAt")
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW())
       RETURNING id`,
      insertParams
    );
    insertedId = rows[0]?.id ?? null;
    console.log(`[custom/post] DB insert OK (with status='open') — id=${insertedId}`);
  } catch (err) {
    if (!err.message.toLowerCase().includes('column')) {
      console.error('[custom/post] DB insert FAILED:', err.message);
      await pool.end().catch(() => {});
      return res.status(500).json({ error: 'Failed to save your request. Please try again.' });
    }
    // Legacy fallback: schema predates paxMin/paxMax or status column
    try {
      const { rows } = await pool.query(
        `INSERT INTO "CustomRequest" (id, "fullName", email, destination, dates, "groupSize", notes, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        legacyInsertParams
      );
      insertedId = rows[0]?.id ?? null;
      console.log(`[custom/post] DB insert OK (fallback) — id=${insertedId}`);
    } catch (fallbackErr) {
      console.error('[custom/post] DB insert FAILED (fallback):', fallbackErr.message);
      await pool.end().catch(() => {});
      return res.status(500).json({ error: 'Failed to save your request. Please try again.' });
    }
  }

  // Resolve designer before the UPDATE so designerId can be persisted
  const FALLBACK_EMAIL = 'contact@hiddenatlas.travel';
  let designerEmail  = null;
  let designerName   = null;
  let designerUserId = null;

  if (designerSlug?.trim()) {
    try {
      const { rows: creatorRows } = await pool.query(
        `SELECT c.name, u.email, u.id AS designer_user_id
         FROM "Creator" c
         LEFT JOIN "User" u ON u.id = c.user_id
         WHERE c.slug = $1 AND c.is_active = true
         LIMIT 1`,
        [designerSlug.trim()]
      );
      if (creatorRows.length && creatorRows[0].email) {
        designerEmail  = creatorRows[0].email.trim().toLowerCase();
        designerName   = creatorRows[0].name;
        designerUserId = creatorRows[0].designer_user_id ?? null;
      }
    } catch (err) {
      console.warn('[custom/post] designer lookup failed:', err.message);
    }
  }

  if (insertedId) {
    try {
      await pool.query(
        `UPDATE "CustomRequest"
         SET phone=$1, duration=$2, "groupType"=$3, budget=$4, style=$5, status='open', "userId"=$6, "designerId"=$7
         WHERE id=$8`,
        [
          phone?.trim()     || null,
          duration?.trim()  || null,
          groupType?.trim() || null,
          budget?.trim()    || null,
          JSON.stringify(Array.isArray(style) ? style : []),
          internalUserId,
          designerUserId,
          insertedId,
        ]
      );
    } catch (err) {
      console.warn('[custom/post] extended fields UPDATE skipped:', err.message);
    }
  }

  await pool.end().catch(() => {});

  let adminEmailSent  = false;
  let clientEmailSent = false;
  let emailError      = null;

  if (!process.env.RESEND_API_KEY) {
    emailError = 'RESEND_API_KEY not set';
    console.warn('[custom/post]', emailError);
  } else {
    const { Resend }   = await import('resend');
    const resend       = new Resend(process.env.RESEND_API_KEY);
    const travelStyle  = Array.isArray(style) && style.length ? style.join(', ') : 'None selected';
    const FROM         = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
    const primaryTo    = designerEmail ?? FALLBACK_EMAIL;
    const isFallback   = !designerEmail;
    const subjectLabel = designerName
      ? `New custom trip request for ${designerName}`
      : `New Custom Journey Request – ${destination || 'New Inquiry'}`;

    try {
      const emailPayload = {
        from:    FROM,
        replyTo: email.trim().toLowerCase(),
        to:      [primaryTo],
        subject: subjectLabel,
        ...(isFallback ? {} : { bcc: [FALLBACK_EMAIL] }),
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;margin-bottom:4px;">${designerName ? `New trip request for ${esc(designerName)}` : 'New Custom Journey Request'}</h2>
            <p style="color:#8C8070;font-size:13px;margin-top:0;">Submitted via HiddenAtlas · ${isFallback ? 'No designer selected' : `Designer: ${esc(designerName)}`}</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${esc(name)}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Email</td><td style="padding:6px 0;"><a href="mailto:${esc(email)}" style="color:#1B6B65;">${esc(email)}</a></td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Phone</td><td style="padding:6px 0;">${esc(phone) || '—'}</td></tr>
            </table>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Destination</td><td style="padding:6px 0;font-weight:600;">${esc(destination) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Dates</td><td style="padding:6px 0;">${esc(dates) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Duration</td><td style="padding:6px 0;">${esc(duration) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Group Size</td><td style="padding:6px 0;">${groupSize || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Trip Type</td><td style="padding:6px 0;">${esc(groupType) || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Travel Styles</td><td style="padding:6px 0;">${esc(travelStyle)}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Budget</td><td style="padding:6px 0;">${esc(budget) || '—'}</td></tr>
            </table>
            ${notes ? `<hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" /><p style="color:#8C8070;font-size:13px;margin-bottom:6px;">Notes</p><p style="font-size:14px;margin:0;">${esc(notes)}</p>` : ''}
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <p><a href="https://hiddenatlas.travel/admin/custom-requests" style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">View in Backoffice →</a></p>
            <p style="color:#B5AA99;font-size:11px;margin-top:16px;">Record id: ${insertedId}</p>
          </div>
        `,
      };
      const adminResult = await resend.emails.send(emailPayload);
      if (adminResult.error) {
        emailError = `Designer notification error: ${JSON.stringify(adminResult.error)}`;
        console.error('[custom/post]', emailError);
      } else {
        adminEmailSent = true;
      }
    } catch (err) {
      emailError = `Designer notification exception: ${err.message}`;
      console.error('[custom/post]', emailError);
    }

    try {
      const clientResult = await resend.emails.send({
        from:    FROM,
        to:      [email.trim().toLowerCase()],
        subject: `Your HiddenAtlas journey request ✨`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;">Hi ${esc(name.split(' ')[0])},</h2>
            <p style="font-size:15px;line-height:1.6;">We've received your travel brief${designerName ? ` for <strong>${esc(designerName)}</strong>` : ''} and will review it shortly.</p>
            <p style="font-size:15px;line-height:1.6;">${designerName ? `${esc(designerName)} will` : 'A travel designer will'} be in touch within 48 hours to start planning your trip.</p>
            <p style="font-size:15px;line-height:1.6;">In the meantime you can explore our curated journeys here:<br/>
              <a href="https://hiddenatlas.travel/itineraries" style="color:#1B6B65;font-weight:600;">hiddenatlas.travel/itineraries</a>
            </p>
            <p style="font-size:15px;margin-top:24px;">— HiddenAtlas</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
            <p style="color:#B5AA99;font-size:11px;">You're receiving this because you submitted a travel brief on hiddenatlas.travel.</p>
          </div>
        `,
      });
      if (clientResult.error) {
        const clientErr = `Client email error: ${JSON.stringify(clientResult.error)}`;
        console.error('[custom/post]', clientErr);
        emailError = emailError ? `${emailError} | ${clientErr}` : clientErr;
      } else {
        clientEmailSent = true;
      }
    } catch (err) {
      const clientErr = `Client email exception: ${err.message}`;
      console.error('[custom/post]', clientErr);
      emailError = emailError ? `${emailError} | ${clientErr}` : clientErr;
    }
  }

  const emailSent = adminEmailSent && clientEmailSent;
  return res.status(200).json({ success: true, emailSent });
}
