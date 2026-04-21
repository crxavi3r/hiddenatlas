/**
 * buildCustomPDF.js
 *
 * Generates a PDF blob from a DB-backed custom itinerary.
 *
 * IMPORTANT — image contract:
 *   Caller MUST pre-resolve all remote (blob/http) image URLs to base64 data URIs
 *   before calling this function. Pass the resolved map as `resolvedImages`.
 *   @react-pdf/renderer cannot reliably fetch remote URLs in a browser context.
 *
 *   Filesystem paths (/itineraries/...) are passed through unchanged — the browser
 *   resolves them via URL resolution to the static public/ files.
 *
 *   resolvedImages = {
 *     'https://...blob...' : 'data:image/jpeg;base64,...',
 *     '/itineraries/...'   : 'data:image/jpeg;base64,...',  // pre-resolved filesystem paths
 *   }
 */

import { resolveDayImages } from '../lib/resolveItineraryImages.js';

// Mirrors the server-side helper in api/itinerary-cms.js.
// Computes the version the PDF will carry — one ahead of the current DB value,
// matching what the server will write to DB after a successful upload.
function nextPdfVersion(current) {
  const base  = current || 'v1.0';
  const match = base.match(/^v(\d+)\.(\d+)$/);
  if (!match) return 'v1.1';
  return `v${match[1]}.${parseInt(match[2], 10) + 1}`;
}

// Formats today as "17 Apr 2026"
function fmtPdfDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function resolveImg(url, resolvedImages) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;

  const direct = resolvedImages[url];
  if (direct) {
    // Case 1: blob URL resolved to a base64 data URI — use it directly.
    if (direct.startsWith('data:')) return direct;

    // Case 2: blob URL failed and step 3b stored a filesystem path as a fallback value.
    // The CMS pre-resolution (step 3c extension) will have stored the base64 for that
    // path under the path key — do a second lookup to get the data URI.
    if (!direct.startsWith('http')) {
      const preResolved = resolvedImages[direct];
      if (preResolved && preResolved.startsWith('data:')) return preResolved;
      // Filesystem path not yet pre-resolved — pass through for browser URL resolution.
      return direct;
    }
    return direct;
  }

  // HTTP URL with no entry in resolvedImages — should not happen if the caller
  // correctly pre-resolved all remote URLs.
  if (url.startsWith('http')) {
    console.error('[buildCustomPDF] no resolved image for URL:', url.slice(0, 80),
      '— image will be absent from PDF');
    return null;
  }

  // Filesystem path not in resolvedImages — pass through for browser URL resolution.
  return url;
}

export async function buildCustomPDFBlob(itinerary, dbAssets = [], resolvedImages = {}) {
  console.log('[buildCustomPDF] starting — slug:', itinerary.slug,
    '| assets:', dbAssets.length,
    '| pre-resolved images:', Object.keys(resolvedImages).length);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
  ]);

  // ── Parse content ───────────────────────────────────────────────────────────
  const content = typeof itinerary.content === 'string'
    ? (() => { try { return JSON.parse(itinerary.content); } catch (e) { console.error('[buildCustomPDF] content parse failed:', e); return {}; } })()
    : (itinerary.content ?? {});

  const summary   = content.summary   || {};
  const tripFacts = content.tripFacts || {};

  const durationStr = itinerary.durationDays
    ? `${itinerary.durationDays} Day${itinerary.durationDays !== 1 ? 's' : ''}`
    : '';

  // ── Resolve day images via shared resolver ─────────────────────────────────
  // resolveDayImages applies: durationDays filter, variant subfolder resolution,
  // empty-folder suppression, and DB asset priority. Days with no images are
  // excluded entirely — this is what prevents ghost days in the PDF.
  const resolvedDayList = resolveDayImages(itinerary, content.days || [], dbAssets);

  const days = resolvedDayList.map(day => {
    // Convert raw URLs → base64 data URIs via the pre-resolved map.
    // Filesystem paths (/itineraries/...) pass through unchanged.
    const imgs = day.imgs.map(u => resolveImg(u, resolvedImages)).filter(Boolean);

    if (Number(day.day) === 11) {
      const img0 = imgs[0] || '';
      const mime = img0.startsWith('data:')
        ? (img0.match(/^data:([^;,]+)/)?.[1] || 'data:?')
        : img0.startsWith('/') ? 'filesystem-path'
        : img0.startsWith('http') ? 'http-url'
        : '(none)';
      console.log('PDF day 11 imgs count', imgs.length);
      console.log('PDF day 11 MIME type',  mime);
      if (mime !== '(none)') console.log('PDF day 11 src preview', img0.slice(0, 80));
      if (mime.includes('webp') || mime.includes('heic') || mime.includes('avif')) {
        console.error('PDF day 11 ⚠ UNSUPPORTED FORMAT:', mime,
          '— @react-pdf/renderer will render blank space! Check step 3d conversion.');
      }
    }

    return { ...day, imgs };
  });

  // ── Resolve cover image ─────────────────────────────────────────────────────
  const rawCoverImage = itinerary.coverImage || content.hero?.coverImage || '';
  const heroAsset     = dbAssets.find(a => a.assetType === 'hero');
  const coverImage    = resolveImg(rawCoverImage, resolvedImages);

  console.log('PDF hero image URL',     rawCoverImage || '(none)');
  console.log('PDF hero image source',  heroAsset?.source || (itinerary.coverImage ? 'itinerary.coverImage' : '(none)'));
  console.log('PDF hero base64 exists', !!coverImage);

  // ── transport: null = no transport section ─────────────────────────────────
  const transport = content.transport && typeof content.transport === 'object' && !Array.isArray(content.transport)
    ? content.transport
    : null;

  // ── PDF version + generation date ──────────────────────────────────────────
  // The PDF shows the version it will carry once uploaded: one ahead of the
  // current DB value — matching what the server writes after a successful upload.
  const pdfVersion = nextPdfVersion(itinerary.pdf_version);
  const pdfDate    = fmtPdfDate();

  // ── Build normalised itinerary shape ───────────────────────────────────────
  const resolvedItinerary = {
    id:           itinerary.slug,
    title:        itinerary.title                             || '',
    subtitle:     itinerary.subtitle || content.hero?.subtitle || '',
    country:      itinerary.country                           || '',
    region:       itinerary.region                            || '',
    duration:     durationStr,
    nights:       itinerary.durationDays ? itinerary.durationDays - 1 : null,
    groupSize:    tripFacts.groupSize                         || null,
    coverImage,
    description:  itinerary.description || summary.shortDescription || '',
    highlights:   summary.highlights   || content.highlights   || [],
    whySpecial:   summary.whySpecial   || content.whySpecial   || '',
    routeOverview: summary.routeOverview || content.routeOverview || '',
    transport,
    accommodation: [],
    mapImage:     null,
    days,
    pdfVersion,
    pdfDate,
  };

  // ── Render PDF ──────────────────────────────────────────────────────────────
  const doc = createElement(ItineraryPDF, { itinerary: resolvedItinerary });
  try {
    const blob = await pdf(doc).toBlob();
    console.log('[buildCustomPDF] PDF blob generated — size:', blob.size, 'bytes');
    return blob;
  } catch (err) {
    console.error('[buildCustomPDF] pdf().toBlob() failed:', err);
    throw err;
  }
}

/**
 * downloadCustomPDF — generate and trigger browser download.
 * Note: call buildCustomPDFBlob directly if you have pre-resolved images.
 */
export async function downloadCustomPDF(itinerary, dbAssets = []) {
  const blob = await buildCustomPDFBlob(itinerary, dbAssets, {});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(itinerary.title || 'itinerary').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
