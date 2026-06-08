export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] starting for:', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getMapImage, getGalleryImages }, { resolveDayImages, resolveCoverImage }, { imgToBase64, imgsToBase64 }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
    import('../lib/resolveItineraryImages'),
    import('./imgToBase64'),
  ]);

  // Fetch structured day stops (gracefully empty if not yet migrated or no stops)
  let dayStops = [];
  const slug = itinerary.slug || itinerary.id;
  if (slug) {
    try {
      const res = await fetch(`/api/itineraries?action=content&slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.dayStops)) dayStops = data.dayStops;
      }
    } catch { /* non-fatal */ }
  }

  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant;

  // Cover: unified resolver — same priority chain as the website.
  // Priority: itinerary.coverImage (blob URL) → filesystem manifest
  const rawCoverImage = resolveCoverImage(itinerary, []);
  console.log('[PDF] heroImage:', rawCoverImage || '(none)');

  // Days: shared resolver applies durationDays filter, variant resolution, and
  // empty-folder suppression. Days with no resolved images are excluded.
  const rawDays = resolveDayImages(itinerary, itinerary.days || [], []);

  // Convert all remote images to base64 (Vercel Blob supports CORS, browser fetch works).
  // Filesystem paths pass through imgToBase64 unchanged.
  const [coverImageB64, daysWithBase64] = await Promise.all([
    imgToBase64(rawCoverImage),
    Promise.all(rawDays.map(async day => {
      const b64Imgs = await imgsToBase64(day.imgs);
      if (day.day === 11) {
        console.log('PDF day 11 base64 exists', b64Imgs.length > 0);
      }
      return { ...day, imgs: b64Imgs.length > 0 ? b64Imgs : day.imgs };
    })),
  ]);

  // Fallback: if hero failed to resolve, use first gallery image
  let finalCoverImage = coverImageB64;
  if (!finalCoverImage) {
    const gallery = getGalleryImages(assetSlug, assetVariant);
    if (gallery.length > 0) {
      finalCoverImage = await imgToBase64(gallery[0].src);
      console.log('[PDF] hero fallback to gallery[0]:', gallery[0].src);
    }
  }

  console.log('PDF hero base64 exists', !!finalCoverImage);

  const resolvedItinerary = {
    ...itinerary,
    coverImage: finalCoverImage || null,
    mapImage:   getMapImage(assetSlug, assetVariant),
    days:       daysWithBase64,
    dayStops,
  };

  const doc  = createElement(ItineraryPDF, { itinerary: resolvedItinerary });
  const blob = await pdf(doc).toBlob();
  console.log('[download-free] blob size:', blob.size);

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = `${itinerary.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
