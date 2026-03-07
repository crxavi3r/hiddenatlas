import { Resend } from 'resend';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  const {
    name: fullName,
    email,
    phone,
    destination,
    dates,
    duration,
    groupSize,
    groupType: tripType,
    budget: budgetRange,
    style: travelStyles,
    notes,
  } = req.body || {};

  if (!fullName?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    await resend.emails.send({
      from: 'HiddenAtlas <brief@hiddenatlas.travel>',
      to: ['cristiano.xavier@outlook.com'],
      subject: 'New HiddenAtlas Custom Planning Brief',
      html: `
        <h2>New HiddenAtlas Travel Brief</h2>
        <p><strong>Full name:</strong> ${fullName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <hr />
        <p><strong>Destination:</strong> ${destination || 'Not specified'}</p>
        <p><strong>Approximate dates:</strong> ${dates || 'Not specified'}</p>
        <p><strong>Trip duration:</strong> ${duration || 'Not specified'}</p>
        <p><strong>Group size:</strong> ${groupSize || 'Not specified'}</p>
        <p><strong>Trip type:</strong> ${tripType || 'Not specified'}</p>
        <p><strong>Travel styles:</strong> ${Array.isArray(travelStyles) && travelStyles.length ? travelStyles.join(', ') : 'None selected'}</p>
        <p><strong>Budget range:</strong> ${budgetRange || 'Not specified'}</p>
        <p><strong>Additional notes:</strong></p>
        <p>${notes || 'No additional notes'}</p>
        <hr />
        <p>Submitted via HiddenAtlas custom planning form.</p>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[submit-brief]', err);
    return res.status(500).json({ error: 'Failed to send notification. Please try again.' });
  }
}
