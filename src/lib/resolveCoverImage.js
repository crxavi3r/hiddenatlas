/**
 * resolveCoverImage(rawUrl, slug?)
 *
 * Converts any stored coverImage value into a browser-accessible URL.
 *
 * Priority / mapping:
 *   1. blob / https:// URL          → pass through
 *   2. /content/itineraries/<x>/... → /itineraries/<x>/...  (content folder is not public)
 *   3. /itineraries/...             → pass through
 *   4. empty / null + slug          → /itineraries/<slug>/cover.jpg
 *   5. anything else                → null (let caller show placeholder)
 */

const CONTENT_RE = /^\/content\/itineraries\//;
const PLACEHOLDER = '/images/placeholder-cover.jpg';

export function resolveCoverImage(rawUrl, slug) {
  let resolved;

  if (rawUrl && /^https?:\/\//.test(rawUrl)) {
    resolved = rawUrl;                                                     // blob / CDN
  } else if (rawUrl && CONTENT_RE.test(rawUrl)) {
    resolved = rawUrl.replace(CONTENT_RE, '/itineraries/');               // remap content→public
  } else if (rawUrl && rawUrl.startsWith('/itineraries/')) {
    resolved = rawUrl;                                                     // already public
  } else if (slug) {
    resolved = `/itineraries/${slug}/cover.jpg`;                          // filesystem fallback
  } else {
    resolved = PLACEHOLDER;
  }

  if (slug === 'japan-grand-cultural-journey') {
    console.log('[resolveCoverImage] japan raw:', rawUrl, '→ resolved:', resolved);
  }

  return resolved;
}
