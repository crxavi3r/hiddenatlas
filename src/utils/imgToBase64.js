/**
 * imgToBase64.js
 *
 * Browser-side image-to-base64 converter for the public download path.
 * Used by downloadPDF.js (no auth available, must run in browser).
 *
 * For the admin PDF generation path, image resolution is done server-side
 * via api/itinerary-cms?action=resolve-images — see buildCustomPDF.js.
 *
 * Vercel Blob public URLs support CORS (Access-Control-Allow-Origin: *),
 * so direct browser fetch works without a proxy.
 *
 * Filesystem paths (/itineraries/...) are returned unchanged — the browser
 * resolves them via URL to the static public/ files.
 */

export async function imgToBase64(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;   // already a data URI
  if (!url.startsWith('http')) return url;   // filesystem path — pass through

  const cleanUrl = url.replace(/\?.*/, '');

  try {
    const resp = await fetch(cleanUrl);
    if (!resp.ok) {
      console.error('resolvePdfImage failed', cleanUrl, resp.status);
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    const contentType = resp.headers.get('content-type') || 'image/jpeg';

    // Chunk-based btoa to avoid call-stack limits on large images
    const bytes     = new Uint8Array(arrayBuffer);
    let binary      = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64  = btoa(binary);
    const dataUri = `data:${contentType};base64,${base64}`;

    console.log('resolvePdfImage ok', cleanUrl.slice(0, 80), Math.round(base64.length / 1024) + 'kb');
    return dataUri;

  } catch (err) {
    console.error('resolvePdfImage exception', cleanUrl, err.message);
    return null;
  }
}

/**
 * Convert an array of image URLs to base64 data URIs.
 * Returns only successfully converted images.
 */
export async function imgsToBase64(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const results = await Promise.all(urls.map(imgToBase64));
  return results.filter(Boolean);
}
