export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] clicked', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getDayImages, getCoverImage, getMapImage }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
  ]);

  // For variant itineraries (e.g. california-american-west-12-days), assets live
  // in the parent's content folder. Non-variant itineraries use their own id.
  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant; // 'premium'|'essential'|'short'|undefined

  // Local cover takes priority over the Unsplash-based coverImage.
  const localCover = getCoverImage(assetSlug);

  // Resolve day images using the same variant logic as the web renderer:
  //   complete  → root day image only
  //   essential → essential/ override → root fallback
  //   short     → short/ override → root fallback
  // Returns empty array if no image is found; DayPage collapses the image area.
  const resolvedItinerary = {
    ...itinerary,
    coverImage: localCover || itinerary.coverImage,
    mapImage: getMapImage(assetSlug, assetVariant),
    days: (itinerary.days || []).map(day => {
      // Local filesystem images take priority (high-res originals).
      // Fall back to day.img (DB/Blob URL) when no local file exists —
      // this covers days whose images were uploaded via the CMS asset manager.
      const fsImgs = getDayImages(assetSlug, day.day, assetVariant);
      const imgs   = fsImgs.length > 0 ? fsImgs : (day.img ? [day.img] : []);
      if (day.day === 11) {
        console.log('[download-free] Day 11 →', JSON.stringify({ title: day.title, imgs: imgs.length, img0: imgs[0]?.slice(0, 80) || '(none)' }));
      }
      return { ...day, imgs };
    }),
  };

  console.log('[download-free] generating PDF for:', itinerary.title);

  const doc = createElement(ItineraryPDF, { itinerary: resolvedItinerary });
  const blob = await pdf(doc).toBlob();

  console.log('[download-free] blob created, size:', blob.size);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${itinerary.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('[download-free] download triggered');
}
