/**
 * /api/image-proxy
 *
 * Server-side image fetcher.
 * Accepts an image URL, fetches it on the server (no CORS restrictions),
 * and returns the image as a base64 data URI.
 *
 * Purpose: @react-pdf/renderer cannot reliably fetch remote images in a browser
 * context. Fetching server-side and converting to base64 is the robust solution.
 *
 * Security: only whitelisted domains are proxied to prevent SSRF.
 *
 * GET /api/image-proxy?url=<encoded-url>
 * → 200 { dataUri: "data:image/jpeg;base64,..." }
 */

// Allowed image hosts — extend here if new image domains are added.
const ALLOWED_HOSTS = [
  '.public.blob.vercel-storage.com', // Vercel Blob (our storage)
  'images.unsplash.com',             // Unsplash CDN
  'plus.unsplash.com',               // Unsplash Plus
];

function isAllowedHost(hostname) {
  return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(h));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Parse and validate the URL.
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only https URLs are allowed' });
  }

  if (!isAllowedHost(parsed.hostname)) {
    console.warn('[image-proxy] rejected host:', parsed.hostname);
    return res.status(403).json({ error: 'Host not allowed' });
  }

  // Strip query params — Vercel Blob ignores them; some CDNs reject unknown params.
  const cleanUrl = `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  console.log('[image-proxy] fetching:', cleanUrl.slice(0, 100));

  try {
    const imageRes = await fetch(cleanUrl);

    if (!imageRes.ok) {
      console.error('[image-proxy] upstream fetch failed:', imageRes.status, cleanUrl.slice(0, 100));
      return res.status(imageRes.status).json({
        error: `Upstream fetch failed: ${imageRes.status}`,
      });
    }

    const buffer      = await imageRes.arrayBuffer();
    const base64      = Buffer.from(buffer).toString('base64');
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const dataUri     = `data:${contentType};base64,${base64}`;

    console.log('[image-proxy] success —', contentType, Math.round(base64.length / 1024) + 'kb —', cleanUrl.slice(0, 80));

    // Allow clients to cache the result briefly — images don't change during a PDF session.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json({ dataUri });

  } catch (err) {
    console.error('[image-proxy] exception:', err.message, 'url:', cleanUrl.slice(0, 100));
    return res.status(500).json({ error: 'Internal server error' });
  }
}
