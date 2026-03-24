/**
 * buildCustomPDF.js
 *
 * Generates a PDF blob from a DB-backed custom itinerary.
 * Uses the same ItineraryPDF component as standard itineraries but builds the
 * required shape from the Itinerary DB record + ItineraryAsset rows.
 *
 * Returns a Blob — caller decides whether to download or upload.
 */

export async function buildCustomPDFBlob(itinerary, dbAssets = []) {
  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
  ]);

  // Parse content if stored as string
  const content = typeof itinerary.content === 'string'
    ? (() => { try { return JSON.parse(itinerary.content); } catch { return {}; } })()
    : (itinerary.content ?? {});

  const durationStr = itinerary.durationDays
    ? `${itinerary.durationDays} Day${itinerary.durationDays !== 1 ? 's' : ''}`
    : (content.overview ? '' : '');

  // Inject DB day images into each day
  const days = (content.days || []).map(day => ({
    ...day,
    imgs: dbAssets
      .filter(a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day))
      .map(a => ({ src: a.url, filename: a.alt || `day-${day.day}` })),
  }));

  const resolvedItinerary = {
    id:           itinerary.slug,
    title:        itinerary.title        || '',
    subtitle:     itinerary.subtitle     || content.hero?.subtitle || '',
    country:      itinerary.country      || '',
    region:       itinerary.region       || '',
    duration:     durationStr,
    nights:       itinerary.durationDays ? itinerary.durationDays - 1 : null,
    groupSize:    null,
    coverImage:   itinerary.coverImage   || content.hero?.coverImage || '',
    description:  itinerary.description  || content.overview || '',
    highlights:   content.highlights     || [],
    whySpecial:   content.whySpecial     || [],
    routeOverview: content.routeOverview || '',
    transport:    content.transport      || [],
    accommodation: content.accommodation || [],
    mapImage:     null,
    days,
  };

  const doc = createElement(ItineraryPDF, { itinerary: resolvedItinerary });
  return await pdf(doc).toBlob();
}

/**
 * downloadCustomPDF — generate and trigger browser download
 */
export async function downloadCustomPDF(itinerary, dbAssets = []) {
  const blob = await buildCustomPDFBlob(itinerary, dbAssets);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(itinerary.title || 'itinerary').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
