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
  console.log('[buildCustomPDF] starting — slug:', itinerary.slug, '| assets:', dbAssets.length);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { imgToBase64, imgsToBase64 }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('./imgToBase64'),
  ]);

  // ── Parse content ───────────────────────────────────────────────────────────
  console.log('[buildCustomPDF] parsing content');
  const content = typeof itinerary.content === 'string'
    ? (() => { try { return JSON.parse(itinerary.content); } catch (e) { console.error('[buildCustomPDF] content parse failed:', e); return {}; } })()
    : (itinerary.content ?? {});

  // Admin stores structured data under content.summary and content.tripFacts.
  // Flat-root fallbacks handle legacy or externally-produced records.
  const summary   = content.summary   || {};
  const tripFacts = content.tripFacts || {};

  const durationStr = itinerary.durationDays
    ? `${itinerary.durationDays} Day${itinerary.durationDays !== 1 ? 's' : ''}`
    : '';

  // ── Resolve raw image URLs — DB assets take priority over content.days.img ─
  console.log('[buildCustomPDF] injecting day images — days:', (content.days || []).length);
  const days = (content.days || []).map(day => {
    const dbImgs = dbAssets
      .filter(a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day))
      .map(a => a.url)
      .filter(Boolean);
    const imgs = dbImgs.length > 0 ? dbImgs : (day.img ? [day.img] : []);
    if (Number(day.day) === 11) {
      console.log('PDF day 11 image URL', imgs[0] || '(none)');
    }
    return { ...day, imgs };
  });

  // ── Resolve cover image ─────────────────────────────────────────────────────
  const rawCoverImage = itinerary.coverImage || content.hero?.coverImage || '';
  console.log('PDF hero image URL', rawCoverImage || '(none)');

  // ── Pre-fetch all images as base64 via server-side proxy ───────────────────
  // @react-pdf/renderer cannot reliably fetch remote URLs in a browser context.
  // The server-side proxy fetches the image using Node.js (no CORS restrictions)
  // and returns a base64 data URI. Data URIs bypass imgUrl()'s ?w=N&q=85
  // transformation (they don't start with 'http') and are embedded directly
  // in the PDF — no network request needed at render time.
  // NO FALLBACK: if conversion fails, null is passed (image absent) not a broken URL.
  console.log('[buildCustomPDF] converting images to base64 via server proxy…');

  const [coverImage, daysWithBase64] = await Promise.all([
    imgToBase64(rawCoverImage),
    Promise.all(days.map(async day => {
      const b64Imgs = await imgsToBase64(day.imgs);
      if (Number(day.day) === 11) {
        console.log('PDF day 11 base64 exists', b64Imgs.length > 0);
      }
      return { ...day, imgs: b64Imgs };
    })),
  ]);

  console.log('PDF hero base64 exists', !!coverImage);

  // ── transport: null means "no transport section" ───────────────────────────
  // An empty array is truthy and would crash TransportPage (transport.routes.map).
  // Custom itineraries don't have a transport section — pass null explicitly.
  const transport = content.transport && typeof content.transport === 'object' && !Array.isArray(content.transport)
    ? content.transport
    : null;

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
    // description: scalar field is derived from summary.shortDescription on save
    description:  itinerary.description || summary.shortDescription || '',
    // highlights, whySpecial, routeOverview live under content.summary in admin
    highlights:   summary.highlights   || content.highlights   || [],
    whySpecial:   summary.whySpecial   || content.whySpecial   || '',
    routeOverview: summary.routeOverview || content.routeOverview || '',
    transport,
    accommodation: [],   // custom itineraries don't use this PDF section
    mapImage:     null,  // no static route map for custom itineraries
    days:         daysWithBase64,
  };

  console.log('[buildCustomPDF] resolvedItinerary shape:', {
    title:        resolvedItinerary.title,
    days:         resolvedItinerary.days.length,
    highlights:   resolvedItinerary.highlights.length,
    whySpecial:   !!resolvedItinerary.whySpecial,
    routeOverview: !!resolvedItinerary.routeOverview,
    transport:    resolvedItinerary.transport,
    coverImage:   !!resolvedItinerary.coverImage,
  });

  // ── Render PDF ──────────────────────────────────────────────────────────────
  console.log('[buildCustomPDF] rendering PDF document');
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
