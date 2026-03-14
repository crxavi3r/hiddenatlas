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

  // ── Email notification ─────────────────────────────────────────────────────
  // Non-fatal: request is already saved — email failure must not cancel the 200 response.
  // emailError is returned in the response so failures are visible without needing logs.
  let emailSent  = false;
  let emailError = null;

  if (!process.env.RESEND_API_KEY) {
    emailError = 'RESEND_API_KEY environment variable is not set in production';
    console.warn('[custom-planning]', emailError);
  } else {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const travelStyle = Array.isArray(style) && style.length ? style.join(', ') : 'None selected';

      const TO   = 'contact@hiddenatlas.travel';
      const FROM = 'HiddenAtlas <brief@hiddenatlas.travel>';

      console.log(`[custom-planning] Sending email from=${FROM} to=${TO}`);

      const result = await resend.emails.send({
        from: FROM,
        to:   [TO],
        subject: `HiddenAtlas Trip Request – ${destination || 'New Inquiry'}`,
        html: `
          <h2>New HiddenAtlas Travel Brief</h2>
          <p><strong>Full name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
          <hr />
          <p><strong>Destination:</strong> ${destination || 'Not specified'}</p>
          <p><strong>Approximate dates:</strong> ${dates || 'Not specified'}</p>
          <p><strong>Trip duration:</strong> ${duration || 'Not specified'}</p>
          <p><strong>Group size:</strong> ${groupSize || 'Not specified'}</p>
          <p><strong>Trip type:</strong> ${groupType || 'Not specified'}</p>
          <p><strong>Travel styles:</strong> ${travelStyle}</p>
          <p><strong>Budget range:</strong> ${budget || 'Not specified'}</p>
          <p><strong>Additional notes:</strong></p>
          <p>${notes || 'No additional notes'}</p>
          <hr />
          <p style="color:#888;font-size:12px;">DB record id: ${insertedId}</p>
          <p style="color:#888;font-size:12px;">Submitted via HiddenAtlas custom planning form.</p>
        `,
      });

      // Resend SDK v2+ returns { data, error } instead of throwing on API errors.
      if (result.error) {
        emailError = `Resend API error: ${JSON.stringify(result.error)}`;
        console.error(`[custom-planning] ${emailError}`);
      } else {
        emailSent = true;
        console.log(`[custom-planning] Email OK — Resend id=${result.data?.id} to=${TO} request=${insertedId}`);
      }
    } catch (err) {
      emailError = err.message || 'Unknown error';
      console.error('[custom-planning] Email exception:', emailError);
    }
  }

  return res.status(200).json({ success: true, emailSent, emailError });
}
