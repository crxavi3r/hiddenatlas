/**
 * imgToBase64.js
 *
 * Pre-fetch remote images as base64 data URIs before passing to @react-pdf/renderer.
 *
 * Why: @react-pdf/renderer running in a browser context has known instability
 * with remote URL fetching. Additionally, our imgUrl() helper in ItineraryPDF.jsx
 * appends ?w=N&q=85 optimization params — these work for Unsplash CDN but break
 * Vercel Blob URLs, causing images to silently fail.
 *
 * Data URIs (data:image/...;base64,...) start with "data:" not "http", so they
 * pass through imgUrl() unchanged — this is the key property that makes this work.
 *
 * Usage:
 *   const b64 = await imgToBase64('https://...');
 *   // pass b64 to ItineraryPDF as coverImage or day.imgs[0]
 */

export async function imgToBase64(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;   // already a data URI — pass through
  if (!url.startsWith('http')) return url;   // local/relative asset — pass through

  try {
    // Strip any existing query params before fetching — Vercel Blob ignores them
    // and some CDNs reject unknown params with 400/403.
    const cleanUrl = url.replace(/\?.*/, '');
    console.log('[imgToBase64] fetching:', cleanUrl.slice(0, 80));

    const resp = await fetch(cleanUrl);
    if (!resp.ok) {
      console.warn('[imgToBase64] fetch failed:', resp.status, cleanUrl.slice(0, 80));
      return null;
    }

    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[imgToBase64] error converting image:', err.message, url.slice(0, 80));
    return null;
  }
}

/**
 * Pre-fetch an array of image URLs as base64, filtering out nulls.
 */
export async function imgsToBase64(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  const results = await Promise.all(urls.map(imgToBase64));
  return results.filter(Boolean);
}
