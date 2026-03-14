import pg from 'pg';

const { Pool } = pg;

// POST /api/custom-planning
// 1. Always attempts DB insert (original schema columns — works even if migration not yet applied)
// 2. Best-effort UPDATE for new columns (phone, duration, groupType, budget, style, status)
// 3. Sends notification email via Resend if RESEND_API_KEY is configured
// 4. Returns 200 if DB insert succeeded (email failure is logged but non-fatal)
// 5. Returns 500 only if the DB insert itself failed
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL) {
    console.error('[custom-planning] DATABASE_URL is not set');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

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
  } = req.body || {};

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  // ── DB insert ──────────────────────────────────────────────────────────────
  // Insert only the original-schema columns — works whether or not the
  // 20260313400000 migration has been applied to this database.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000, // prevent Vercel function timeout on Neon cold start
    idleTimeoutMillis: 10000,
  });

  let insertedId = null;

  // ── Primary INSERT — includes status = 'open' explicitly ─────────────────
  // Works once migration 20260313400000 has been applied.
  // Falls back to original-column INSERT if the column doesn't exist yet.
  const coreParams = [
    name.trim(),
    email.trim().toLowerCase(),
    destination?.trim() || null,
    dates?.trim()       || null,
    groupSize ? parseInt(groupSize, 10) : null,
    notes?.trim()       || null,
  ];

  try {
    const { rows } = await pool.query(
      `INSERT INTO "CustomRequest"
         (id, "fullName", email, destination, dates, "groupSize", notes, status, "createdAt")
       VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'open', NOW())
       RETURNING id`,
      coreParams
    );
    insertedId = rows[0]?.id ?? null;
    console.log(`[custom-planning] DB insert OK (with status='open') — id=${insertedId}`);
  } catch (err) {
    if (!err.message.toLowerCase().includes('column')) {
      // Not a missing-column error — real failure
      console.error('[custom-planning] DB insert FAILED:', err.message);
      await pool.end().catch(() => {});
      return res.status(500).json({ error: 'Failed to save your request. Please try again.' });
    }

    // status column not yet present (migration pending) — fall back to original schema
    console.warn('[custom-planning] status column missing — falling back to original INSERT:', err.message);
    try {
      const { rows } = await pool.query(
        `INSERT INTO "CustomRequest" (id, "fullName", email, destination, dates, "groupSize", notes, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        coreParams
      );
      insertedId = rows[0]?.id ?? null;
      console.log(`[custom-planning] DB insert OK (fallback, no status column yet) — id=${insertedId}`);
    } catch (fallbackErr) {
      console.error('[custom-planning] DB insert FAILED (fallback):', fallbackErr.message);
      await pool.end().catch(() => {});
      return res.status(500).json({ error: 'Failed to save your request. Please try again.' });
    }
  }

  // ── Best-effort UPDATE for remaining extended fields ──────────────────────
  // Sets phone, duration, groupType, budget, style once those columns exist.
  // status is already set in the INSERT above; included here only as a safety net.
  if (insertedId) {
    try {
      await pool.query(
        `UPDATE "CustomRequest"
         SET phone=$1, duration=$2, "groupType"=$3, budget=$4, style=$5, status='open'
         WHERE id=$6`,
        [
          phone?.trim()     || null,
          duration?.trim()  || null,
          groupType?.trim() || null,
          budget?.trim()    || null,
          JSON.stringify(Array.isArray(style) ? style : []),
          insertedId,
        ]
      );
      console.log(`[custom-planning] Extended fields UPDATE OK — id=${insertedId}`);
    } catch (err) {
      console.warn('[custom-planning] Extended fields UPDATE skipped (migration pending?):', err.message);
    }
  }

  await pool.end().catch(() => {});

  // ── Email notifications ────────────────────────────────────────────────────
  // Non-fatal: request is already saved — email failures must not cancel the 200 response.
  // emailError is returned in the response so failures are visible without needing logs.
  let adminEmailSent   = false;
  let clientEmailSent  = false;
  let emailError       = null;

  if (!process.env.RESEND_API_KEY) {
    emailError = 'RESEND_API_KEY environment variable is not set in production';
    console.warn('[custom-planning]', emailError);
  } else {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const travelStyle = Array.isArray(style) && style.length ? style.join(', ') : 'None selected';
    const FROM = 'HiddenAtlas <brief@hiddenatlas.travel>';

    // ── 1) Admin notification ──────────────────────────────────────────────
    const ADMIN_TO = 'contact@hiddenatlas.travel';
    try {
      console.log(`[custom-planning] Sending admin email from=${FROM} to=${ADMIN_TO}`);
      const adminResult = await resend.emails.send({
        from: FROM,
        to:   [ADMIN_TO],
        subject: `New Custom Journey Request – ${destination || 'New Inquiry'}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;margin-bottom:4px;">New Custom Journey Request</h2>
            <p style="color:#8C8070;font-size:13px;margin-top:0;">Submitted via HiddenAtlas custom planning form</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />

            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#1B6B65;">${email}</a></td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Phone</td><td style="padding:6px 0;">${phone || '—'}</td></tr>
            </table>

            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />

            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;color:#8C8070;width:140px;">Destination</td><td style="padding:6px 0;font-weight:600;">${destination || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Dates</td><td style="padding:6px 0;">${dates || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Duration</td><td style="padding:6px 0;">${duration || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Group Size</td><td style="padding:6px 0;">${groupSize || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Trip Type</td><td style="padding:6px 0;">${groupType || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Travel Styles</td><td style="padding:6px 0;">${travelStyle}</td></tr>
              <tr><td style="padding:6px 0;color:#8C8070;">Budget</td><td style="padding:6px 0;">${budget || '—'}</td></tr>
            </table>

            ${notes ? `
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <p style="color:#8C8070;font-size:13px;margin-bottom:6px;">Notes</p>
            <p style="font-size:14px;margin:0;">${notes}</p>
            ` : ''}

            <hr style="border:none;border-top:1px solid #E8E3DA;margin:16px 0;" />
            <p>
              <a href="https://hiddenatlas.travel/admin/custom-requests"
                 style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;
                        padding:10px 20px;border-radius:6px;font-size:13px;font-weight:600;">
                View in Backoffice →
              </a>
            </p>
            <p style="color:#B5AA99;font-size:11px;margin-top:16px;">Record id: ${insertedId}</p>
          </div>
        `,
      });

      if (adminResult.error) {
        emailError = `Admin email — Resend API error: ${JSON.stringify(adminResult.error)}`;
        console.error(`[custom-planning] ${emailError}`);
      } else {
        adminEmailSent = true;
        console.log(`[custom-planning] Admin email OK — Resend id=${adminResult.data?.id} request=${insertedId}`);
      }
    } catch (err) {
      emailError = `Admin email exception: ${err.message || 'Unknown error'}`;
      console.error('[custom-planning]', emailError);
    }

    // ── 2) Client confirmation ─────────────────────────────────────────────
    try {
      const clientEmail = email.trim().toLowerCase();
      console.log(`[custom-planning] Sending confirmation email from=${FROM} to=${clientEmail}`);
      const clientResult = await resend.emails.send({
        from: FROM,
        to:   [clientEmail],
        subject: `Your HiddenAtlas journey request ✨`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
            <h2 style="color:#1B6B65;">Hi ${name.split(' ')[0]},</h2>
            <p style="font-size:15px;line-height:1.6;">
              We've received your travel brief and one of our planners will review it shortly.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              We'll reach out within 48 hours to start designing your itinerary.
            </p>
            <p style="font-size:15px;line-height:1.6;">
              In the meantime you can explore our curated journeys here:<br/>
              <a href="https://hiddenatlas.travel/itineraries"
                 style="color:#1B6B65;font-weight:600;">
                hiddenatlas.travel/itineraries
              </a>
            </p>
            <p style="font-size:15px;margin-top:24px;">— HiddenAtlas</p>
            <hr style="border:none;border-top:1px solid #E8E3DA;margin:24px 0;" />
            <p style="color:#B5AA99;font-size:11px;">
              You're receiving this because you submitted a travel brief on hiddenatlas.travel.
            </p>
          </div>
        `,
      });

      if (clientResult.error) {
        const clientErr = `Client email — Resend API error: ${JSON.stringify(clientResult.error)}`;
        console.error(`[custom-planning] ${clientErr}`);
        emailError = emailError ? `${emailError} | ${clientErr}` : clientErr;
      } else {
        clientEmailSent = true;
        console.log(`[custom-planning] Client confirmation email OK — Resend id=${clientResult.data?.id} to=${clientEmail}`);
      }
    } catch (err) {
      const clientErr = `Client email exception: ${err.message || 'Unknown error'}`;
      console.error('[custom-planning]', clientErr);
      emailError = emailError ? `${emailError} | ${clientErr}` : clientErr;
    }
  }

  const emailSent = adminEmailSent && clientEmailSent;
  return res.status(200).json({ success: true, emailSent, adminEmailSent, clientEmailSent, emailError });
}
