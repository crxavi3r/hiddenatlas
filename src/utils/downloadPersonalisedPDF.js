/**
 * downloadPersonalisedPDF
 *
 * Resolves day images + cover image from the workspace data, then renders the
 * PersonalisedItineraryPDF component and triggers a browser download.
 *
 * Image resolution order (same as downloadPDF.js):
 *   1. DB assets (ItineraryAsset rows from workspace.assets)
 *   2. Filesystem manifest (static content/ folder via resolveItineraryImages)
 *   3. No image — day still renders text-only
 */
import { imgToBase64, imgsToBase64 } from './imgToBase64.js';
import { resolveDayImages, resolveCoverImage } from '../lib/resolveItineraryImages.js';
import {
  buildOrderedStopList, resolveAccommodationName, validatePersonalisedPdfData,
} from './tripPdfData.js';

// Inclusive day count between two ISO date strings (e.g. 1-6 June = 6 days).
function diffDaysInclusive(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(String(startDate).slice(0, 10) + 'T00:00:00Z');
  const end   = new Date(String(endDate).slice(0, 10)   + 'T00:00:00Z');
  if (isNaN(start) || isNaN(end)) return null;
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

export async function downloadPersonalisedPDF(workspace) {
  const {
    trip,
    itinerary,
    tripDays      = [],
    tripItems     = [],
    tripNotes     = [],
    tripBookings  = [],
    assets        = [],
    itineraryDayStops = [],
    hiddenStopIds     = [],
  } = workspace;

  const { createElement } = await import('react');
  const [{ pdf }, { default: PersonalisedItineraryPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/PersonalisedItineraryPDF'),
  ]);

  // Parse itinerary content JSON (may contain days, highlights, pdfConfig, etc.)
  let content = {};
  if (itinerary?.content) {
    try {
      content = typeof itinerary.content === 'string'
        ? JSON.parse(itinerary.content)
        : (typeof itinerary.content === 'object' ? itinerary.content : {});
    } catch { /* non-fatal */ }
  }
  const contentDays = content?.days || [];

  // Resolve cover image: trip.heroImage > DB hero asset > itinerary.coverImage > filesystem
  const itineraryForResolution = {
    ...(itinerary || {}),
    slug:        itinerary?.slug || trip.itinerarySlug,
    coverImage:  trip.heroImage || itinerary?.coverImage || null,
  };
  const rawCoverUrl  = resolveCoverImage(itineraryForResolution, assets);
  const coverBase64  = await imgToBase64(rawCoverUrl);

  // Resolve + base64-encode day images using the same pipeline as downloadPDF.js
  const resolvedDays = resolveDayImages(itineraryForResolution, contentDays, assets);
  const daysWithBase64 = await Promise.all(
    resolvedDays.map(async day => {
      const b64 = await imgsToBase64(day.imgs || []);
      return { ...day, imgs: b64.length > 0 ? b64 : (day.imgs || []) };
    })
  );

  // Extract additional fields from parsed content for journey overview + route map pages
  const highlights = content?.summary?.highlights
    || (Array.isArray(itinerary?.highlights) ? itinerary.highlights : [])
    || [];
  const groupSize     = itinerary?.groupSize || content?.summary?.groupSize || null;
  // CMS route map stops — used as fallback when ItineraryDayStop rows lack coordinates
  const routeMapStops = content?.pdfConfig?.routeMapStops
    || content?.routeMapStops
    || [];

  // Duration always recomputed from the freshly-loaded trip data, not trusted
  // from a possibly-stale itinerary.duration/trip.durationDays text field.
  const computedDurationDays = tripDays.length
    || diffDaysInclusive(trip.startDate, trip.endDate)
    || trip.durationDays
    || parseInt(itinerary?.duration, 10)
    || null;
  const nights   = itinerary?.nights || content?.summary?.nights || (computedDurationDays ? computedDurationDays - 1 : null);
  const duration = computedDurationDays
    ? `${computedDurationDays} Day${computedDurationDays === 1 ? '' : 's'}`
    : (itinerary?.duration || '');

  // Ordered stop list (day → time → real sequence) — replaces the abstract SVG map.
  const orderedStops = buildOrderedStopList({ tripDays, itineraryDayStops, hiddenStopIds, tripItems });

  // Accommodation name per day: the traveller's actual hotel booking is the
  // source of truth; contentDay.stay / trip.accommodationSummary are fallbacks.
  const contentDayByNumber = {};
  daysWithBase64.forEach(d => {
    const n = d.dayNumber || d.day;
    if (n) contentDayByNumber[n] = d;
  });
  const hotelBookings = tripBookings.filter(b => b.type === 'hotel');
  const accommodationByDay = {};
  tripDays.forEach(day => {
    const resolved = resolveAccommodationName({
      hotelBookings,
      contentDay: contentDayByNumber[day.dayNumber] || null,
      trip,
      dayNumber: day.dayNumber,
      tripStartDate: trip.startDate,
    });
    if (resolved) accommodationByDay[day.dayNumber] = resolved;
  });

  const resolvedItinerary = {
    id:          itinerary?.id   || '',
    slug:        itinerary?.slug || trip.itinerarySlug || '',
    title:       itinerary?.title       || trip.title || trip.destination || 'My Journey',
    subtitle:    itinerary?.subtitle    || '',
    description: content?.summary?.description || itinerary?.description || '',
    country:     itinerary?.country     || trip.country || trip.destination || '',
    destination: itinerary?.destination || trip.destination || '',
    region:      itinerary?.region      || '',
    duration,
    nights,
    groupSize,
    highlights,
    routeMapStops,
    coverImage:  coverBase64 || null,
    dayStops:    itineraryDayStops,
    // itinerary.days = resolved days WITH base64 images — PersonalisedItineraryPDF prefers these
    days:        daysWithBase64,
    // content preserved for any remaining text lookups
    content,
  };

  const personalisationContext = {
    trip,
    tripDays,
    tripItems,
    tripNotes,
    tripBookings,
    hiddenStopIds,
    orderedStops,
    accommodationByDay,
  };

  const { warnings } = validatePersonalisedPdfData({
    tripDays, tripNotes, tripBookings, orderedStops, resolvedItinerary, computedDurationDays,
    coverImageRequested: !!rawCoverUrl, coverImageResolved: !!coverBase64,
  });
  if (warnings.length) console.warn('[PersonalisedPDF] validation warnings:', warnings);

  const slug     = itinerary?.slug || trip.itinerarySlug || trip.destination || 'trip';
  const filename = `${slug.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-my-hiddenatlas-guide.pdf`;

  const doc  = createElement(PersonalisedItineraryPDF, { itinerary: resolvedItinerary, personalisationContext });
  const blob = await pdf(doc).toBlob();

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
