/**
 * imgToBase64.js
 *
 * Fetches a remote image and returns it as a base64 data URI.
 *
 * Why: @react-pdf/renderer cannot reliably load remote URLs in a browser context.
 * Vercel Blob URLs also receive unsupported ?w=N&q=85 params from imgUrl() in
 * ItineraryPDF.jsx, causing silent fetch failures and grey placeholders.
 *
 * Data URIs (data:image/...;base64,...) bypass both problems — they don't start
 * with "http" so imgUrl() passes them through unchanged, and the renderer reads
 * them directly from memory with no network request needed.
 *
 * NO SILENT FALLBACK: if the fetch fails, this function returns null and the
 * caller must handle the absence explicitly. Never pass a broken remote URL back
 * to the renderer — that is exactly the failure mode we are replacing.
 */

export async function imgToBase64(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;   // already a data URI — pass through
  if (!url.startsWith('http')) return url;   // local/bundled asset — pass through

  // Strip query params before fetching.
  // Vercel Blob ignores them; some CDNs reject unknown params with 400/403.
  const cleanUrl = url.replace(/\?.*/, '');
  console.log('[imgToBase64] fetching:', cleanUrl.slice(0, 100));

  try {
    const resp = await fetch(cleanUrl);
    if (!resp.ok) {
      console.error('[imgToBase64] fetch failed — status', resp.status, 'url:', cleanUrl.slice(0, 100));
      return null;
    }

    const buffer      = await resp.arrayBuffer();
    const bytes       = new Uint8Array(buffer);
    const contentType = resp.headers.get('content-type') || 'image/jpeg';

    // Chunk-based btoa to avoid "Maximum call stack exceeded" on large images.
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const dataUri = `data:${contentType};base64,${base64}`;
    console.log('[imgToBase64] success —', contentType, Math.round(base64.length / 1024) + 'kb base64, url:', cleanUrl.slice(0, 60));
    return dataUri;

  } catch (err) {
    console.error('[imgToBase64] exception fetching image:', err.message, 'url:', cleanUrl.slice(0, 100));
    return null;
  }
}

/**
 * Pre-fetch an array of image URLs as base64 data URIs.
 * Filters out nulls (failed fetches) — caller receives only successfully
 * converted images. Never returns raw remote URLs.
 */
export async function imgsToBase64(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const results = await Promise.all(urls.map(imgToBase64));
  return results.filter(Boolean);
}
