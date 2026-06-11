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

export async function downloadPersonalisedPDF(workspace) {
  const {
    trip,
    itinerary,
    tripDays     = [],
    tripItems    = [],
    tripNotes    = [],
    tripBookings = [],
    assets       = [],
    itineraryDayStops = [],
    hiddenStopIds     = [],
  } = workspace;

  const { createElement } = await import('react');
  const [{ pdf }, { default: PersonalisedItineraryPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/PersonalisedItineraryPDF'),
  ]);

  // Parse itinerary content JSON
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
    slug: itinerary?.slug || trip.itinerarySlug,
    coverImage: trip.heroImage || itinerary?.coverImage || null,
  };
  const rawCoverUrl = resolveCoverImage(itineraryForResolution, assets);
  const coverBase64 = await imgToBase64(rawCoverUrl);

  // Resolve + base64-encode day images
  const resolvedDays = resolveDayImages(itineraryForResolution, contentDays, assets);
  const daysWithBase64 = await Promise.all(
    resolvedDays.map(async day => {
      const b64 = await imgsToBase64(day.imgs || []);
      return { ...day, imgs: b64.length > 0 ? b64 : (day.imgs || []) };
    })
  );

  const resolvedItinerary = {
    id:          itinerary?.id || '',
    slug:        itinerary?.slug || trip.itinerarySlug || '',
    title:       itinerary?.title || trip.title || trip.destination || 'My Journey',
    subtitle:    itinerary?.subtitle || '',
    description: content?.summary?.description || itinerary?.description || '',
    country:     itinerary?.country || trip.country || trip.destination || '',
    destination: itinerary?.destination || trip.destination || '',
    region:      itinerary?.region || '',
    duration:    itinerary?.duration || (trip.durationDays ? `${trip.durationDays} days` : ''),
    nights:      itinerary?.nights || null,
    groupSize:   itinerary?.groupSize || null,
    coverImage:  coverBase64 || null,
    dayStops:    itineraryDayStops,
    days:        daysWithBase64,
    content,
  };

  const personalisationContext = {
    trip,
    tripDays,
    tripItems,
    tripNotes,
    tripBookings,
    hiddenStopIds,
  };

  const slug = itinerary?.slug || trip.itinerarySlug || trip.destination || 'trip';
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
