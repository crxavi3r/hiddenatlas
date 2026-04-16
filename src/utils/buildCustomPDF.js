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

  // ── Inject DB day images into each day ─────────────────────────────────────
  // imgs must be plain URL strings — DayPage's imgUrl() helper expects strings.
  // Passing objects (e.g. { src, filename }) causes imgUrl to return the object
  // unchanged, which then crashes @react-pdf/renderer with null.props.
  // Priority: DB assets (ItineraryAsset rows) → inline day.img field.
  console.log('[buildCustomPDF] injecting day images — days:', (content.days || []).length);
  const days = (content.days || []).map(day => {
    const dbImgs = dbAssets
      .filter(a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day))
      .map(a => a.url)          // ← plain URL string, not { src, filename }
      .filter(Boolean);
    // Fall back to the inline day.img field when no DB asset exists for this day
    const imgs = dbImgs.length > 0
      ? dbImgs
      : (day.img ? [day.img] : []);
    console.log(`[buildCustomPDF] day ${day.day} imgs:`, imgs.length, imgs[0]?.slice(0, 50) || '(none)');
    if (Number(day.day) === 11) {
      console.log('[buildCustomPDF] Day 11 resolved →', JSON.stringify({ title: day.title, imgs: imgs.length, img0: imgs[0]?.slice(0, 80) || '(none)' }));
    }
    return { ...day, imgs };
  });

  // ── Resolve cover image ─────────────────────────────────────────────────────
  // Use the scalar coverImage field first (synced by save), fall back to
  // content.hero.coverImage. Both should be equivalent after a save.
  const rawCoverImage = itinerary.coverImage || content.hero?.coverImage || '';
  console.log('[buildCustomPDF] coverImage (raw):', rawCoverImage ? rawCoverImage.slice(0, 60) + '…' : '(none)');

  // ── Pre-fetch all remote images as base64 ──────────────────────────────────
  // @react-pdf/renderer has known instability with remote URL fetching in browser
  // context. imgUrl() in ItineraryPDF.jsx also appends ?w=N&q=85 params that work
  // for Unsplash but break Vercel Blob URLs. Data URIs bypass both issues:
  // they don't start with "http" so imgUrl() passes them through unchanged.
  console.log('[buildCustomPDF] pre-fetching images as base64…');

  const [coverImage, daysWithBase64] = await Promise.all([
    imgToBase64(rawCoverImage),
    Promise.all(days.map(async day => {
      const b64Imgs = await imgsToBase64(day.imgs);
      if (Number(day.day) === 11) {
        console.log('[buildCustomPDF] Day 11 base64 imgs:', b64Imgs.length,
          b64Imgs[0] ? b64Imgs[0].slice(0, 40) + '…' : '(none)');
      }
      return { ...day, imgs: b64Imgs.length > 0 ? b64Imgs : day.imgs };
    })),
  ]);

  console.log('[buildCustomPDF] coverImage after base64:', coverImage ? coverImage.slice(0, 40) + '…' : '(none)');

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
