/**
 * imgToBase64.js
 *
 * Converts a remote image URL to a base64 data URI via a server-side proxy.
 *
 * WHY SERVER-SIDE:
 *   - @react-pdf/renderer cannot reliably fetch remote images in a browser context
 *   - Vercel Blob URLs served via the browser may be blocked by CORS or CSP
 *   - Server-side fetch (Node.js) has no such restrictions
 *   - Buffer.from(buffer).toString('base64') is the native, reliable conversion path
 *
 * DATA URIS IN REACT-PDF:
 *   - data:image/...;base64,... strings don't start with 'http'
 *   - imgUrl() in ItineraryPDF.jsx passes them through unchanged (no ?w=N&q=85)
 *   - The renderer embeds the image directly — no network request at render time
 *
 * NO SILENT FALLBACK:
 *   - If conversion fails, returns null
 *   - Callers must pass null (no image) rather than a raw URL (grey placeholder)
 */

export async function imgToBase64(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;   // already a data URI — pass through
  if (!url.startsWith('http')) {
    // Filesystem / relative path — the browser resolves it via URL resolution.
    // No proxy needed. react-pdf loads it as a static asset.
    console.log('[imgToBase64] filesystem path — passing through:', url.slice(0, 80));
    return url;
  }

  const cleanUrl = url.replace(/\?.*/, '');
  console.log('[imgToBase64] blob/remote URL — fetching via server proxy:', cleanUrl.slice(0, 100));

  try {
    const proxyRes = await fetch(`/api/image-proxy?url=${encodeURIComponent(cleanUrl)}`);

    if (!proxyRes.ok) {
      let errMsg = `${proxyRes.status}`;
      try { const body = await proxyRes.json(); errMsg += ` — ${body.error || ''}`; } catch {}
      console.error('[imgToBase64] proxy returned error:', errMsg, 'url:', cleanUrl.slice(0, 100));
      return null;
    }

    const { dataUri } = await proxyRes.json();
    if (!dataUri) {
      console.error('[imgToBase64] proxy returned no dataUri for url:', cleanUrl.slice(0, 100));
      return null;
    }

    console.log('[imgToBase64] success — url:', cleanUrl.slice(0, 80),
      '| size:', Math.round(dataUri.length / 1024) + 'kb');
    return dataUri;

  } catch (err) {
    console.error('[imgToBase64] exception calling proxy:', err.message, 'url:', cleanUrl.slice(0, 100));
    return null;
  }
}

/**
 * Pre-fetch an array of image URLs as base64 data URIs.
 * Filters out nulls (failed fetches). Never returns raw remote URLs.
 */
export async function imgsToBase64(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const results = await Promise.all(urls.map(imgToBase64));
  return results.filter(Boolean);
}
