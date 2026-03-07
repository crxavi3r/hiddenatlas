import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured.' });
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

  const travelStyle = Array.isArray(style) && style.length ? style.join(', ') : 'Not selected';

  try {
    await resend.emails.send({
      from: 'HiddenAtlas <brief@hiddenatlas.travel>',
      to: ['cristiano.xavier@outlook.com'],
      subject: 'New Custom Trip Request — HiddenAtlas',
      html: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <br />
        <p><strong>Destination:</strong><br />${destination || 'Not specified'}</p>
        <p><strong>Dates:</strong><br />${dates || 'Not specified'}</p>
        <p><strong>Trip duration:</strong><br />${duration || 'Not specified'}</p>
        <p><strong>Group size:</strong><br />${groupSize || 'Not specified'}</p>
        <p><strong>Trip type:</strong><br />${groupType || 'Not specified'}</p>
        <p><strong>Travel style:</strong><br />${travelStyle}</p>
        <p><strong>Budget:</strong><br />${budget || 'Not specified'}</p>
        ${notes ? `<br /><p><strong>Additional notes:</strong><br />${notes}</p>` : ''}
        <br />
        <hr />
        <p style="color:#888;font-size:12px;">Submitted via HiddenAtlas custom planning form.</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-brief]', err);
    return res.status(500).json({ error: 'Failed to send your request. Please try again.' });
  }
}
