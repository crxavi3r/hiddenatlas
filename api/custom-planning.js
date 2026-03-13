import { Resend } from 'resend';

// POST /api/custom-planning
// Sends the custom trip brief via email using Resend.
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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const travelStyle = Array.isArray(style) && style.length ? style.join(', ') : 'None selected';

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
