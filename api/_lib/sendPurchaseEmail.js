// Sends a branded HiddenAtlas purchase confirmation email via Resend.
// Called from handleWebhook after a successful checkout.session.completed event.

function formatAmount(euros) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(euros);
}

export async function sendPurchaseEmail({ to, itineraryTitle, slug, netAmount, grossAmount, discountAmount }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[sendPurchaseEmail] RESEND_API_KEY not set — skipping');
    return;
  }
  if (!to) {
    console.warn('[sendPurchaseEmail] no recipient address — skipping');
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const itinUrl = `https://hiddenatlas.travel/itineraries/${slug}`;
  const showDiscount = typeof discountAmount === 'number' && discountAmount > 0;
  const displayTitle = itineraryTitle && itineraryTitle !== slug
    ? itineraryTitle
    : slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const discountRow = showDiscount ? `
    <tr>
      <td style="color:#8C8070;padding:4px 0;font-size:13px;">Discount applied</td>
      <td style="text-align:right;color:#1B6B65;font-weight:600;font-size:13px;">
        &minus;${formatAmount(discountAmount)}
      </td>
    </tr>` : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your HiddenAtlas itinerary</title>
</head>
<body style="margin:0;padding:0;background:#F4F1EC;">

  <!-- Top accent bar -->
  <div style="height:4px;background:#C9A96E;"></div>

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EC;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:white;border-radius:8px;overflow:hidden;" cellpadding="0" cellspacing="0">

          <!-- Body -->
          <tr>
            <td style="padding:44px 40px 36px;">

              <!-- Wordmark -->
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#1B6B65;margin:0 0 40px;">
                HIDDENATLAS
              </p>

              <!-- Headline -->
              <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#1C1A16;line-height:1.3;margin:0 0 10px;">
                Your itinerary is ready.
              </h1>
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#8C8070;line-height:1.65;margin:0 0 36px;">
                Thank you for your purchase. Your curated travel guide is now available in your library.
              </p>

              <!-- Itinerary card -->
              <div style="background:#F4F1EC;border-radius:8px;padding:24px 24px 20px;">
                <p style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#C9A96E;margin:0 0 8px;">
                  YOUR ITINERARY
                </p>
                <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:600;color:#1C1A16;line-height:1.3;margin:0 0 18px;">
                  ${displayTitle}
                </h2>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="color:#8C8070;padding:4px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;">Amount paid</td>
                    <td style="text-align:right;font-weight:700;color:#1C1A16;font-family:Arial,Helvetica,sans-serif;font-size:13px;">
                      ${formatAmount(netAmount)}
                    </td>
                  </tr>
                  ${discountRow}
                </table>
              </div>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
                <tr>
                  <td align="center">
                    <a href="${itinUrl}"
                       style="display:inline-block;background:#1B6B65;color:white;text-decoration:none;
                              padding:14px 32px;border-radius:6px;
                              font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;
                              letter-spacing:1.5px;text-transform:uppercase;">
                      View your itinerary &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Support note -->
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#B5AA99;margin:32px 0 0;line-height:1.6;">
                Questions? We&rsquo;re here to help at
                <a href="mailto:contact@hiddenatlas.travel" style="color:#1B6B65;text-decoration:none;">
                  contact@hiddenatlas.travel
                </a>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #E8E3DA;">
              <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#B5AA99;margin:0;line-height:1.7;">
                &copy; HiddenAtlas &middot; A brand of Ledi Software<br />
                You&rsquo;re receiving this because you made a purchase on
                <a href="https://hiddenatlas.travel" style="color:#B5AA99;">hiddenatlas.travel</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from:    'HiddenAtlas <hello@hiddenatlas.travel>',
      to:      [to],
      subject: `Your itinerary is ready — ${displayTitle}`,
      html,
    });

    if (result.error) {
      console.error('[sendPurchaseEmail] Resend error:', JSON.stringify(result.error));
    } else {
      console.log('[sendPurchaseEmail] sent — id:', result.data?.id, '| to:', to, '| slug:', slug);
    }
  } catch (err) {
    console.error('[sendPurchaseEmail] exception:', err.message);
  }
}
