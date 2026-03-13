import { Resend } from 'resend';
import pg from 'pg';

const { Pool } = pg;

// POST /api/custom-planning
// Persists the custom trip brief to the database and sends a notification email.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      error: 'RESEND_API_KEY is not set in this runtime environment.',
      debug: {
        hasResendKey: false,
        envNameUsed: 'RESEND_API_KEY',
        note: 'Check Vercel dashboard: Settings → Environment Variables → confirm name is exactly RESEND_API_KEY and is enabled for Production.',
      },
    });
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

  const travelStyle = Array.isArray(style) && style.length ? style.join(', ') : 'None selected';

  // ── Persist to database ──────────────────────────────────────────────────
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(
        `INSERT INTO "CustomRequest"
           (id, "fullName", email, phone, destination, dates, duration, "groupSize", "groupType", budget, style, notes, status, "createdAt")
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'open', NOW())`,
        [
          name.trim(),
          email.trim().toLowerCase(),
          phone?.trim() || null,
          destination?.trim() || null,
          dates?.trim() || null,
          duration?.trim() || null,
          groupSize ? parseInt(groupSize, 10) : null,
          groupType?.trim() || null,
          budget?.trim() || null,
          JSON.stringify(Array.isArray(style) ? style : []),
          notes?.trim() || null,
        ]
      );
    } catch (err) {
      // Log but don't block — email will still go out
      console.error('[custom-planning] DB insert error:', err.message);
    } finally {
      await pool.end();
    }
  }

  // ── Send notification email ──────────────────────────────────────────────
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: 'HiddenAtlas <brief@hiddenatlas.travel>',
      to: ['contact@hiddenatlas.travel'],
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
        <p style="color:#888;font-size:12px;">Submitted via HiddenAtlas custom planning form.</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[custom-planning]', err);
    return res.status(500).json({ error: 'Failed to send notification. Please try again.' });
  }
}
