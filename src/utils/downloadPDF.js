export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] clicked', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getDayImages, getCoverImage, getMapImage }, { imgToBase64, imgsToBase64 }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
    import('./imgToBase64'),
  ]);

  // For variant itineraries (e.g. california-american-west-12-days), assets live
  // in the parent's content folder. Non-variant itineraries use their own id.
  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant; // 'premium'|'essential'|'short'|undefined

  // Local cover takes priority over the Unsplash-based coverImage.
  const localCover = getCoverImage(assetSlug);
  const rawCoverImage = localCover || itinerary.coverImage;
  console.log('PDF hero image URL', rawCoverImage || '(none)');

  // Resolve day images: local filesystem first, fall back to day.img (DB/Blob URL).
  const rawDays = (itinerary.days || []).map(day => {
    const fsImgs = getDayImages(assetSlug, day.day, assetVariant);
    const imgs   = fsImgs.length > 0 ? fsImgs : (day.img ? [day.img] : []);
    if (day.day === 11) {
      console.log('PDF day 11 image URL', imgs[0] || '(none)');
    }
    return { ...day, imgs };
  });

  // Convert all images to base64 via server-side proxy.
  // NO FALLBACK: if conversion fails, null is passed (image absent) not a broken URL.
  console.log('[download-free] converting images to base64 via server proxy…');
  const [coverImageB64, daysWithBase64] = await Promise.all([
    imgToBase64(rawCoverImage),
    Promise.all(rawDays.map(async day => {
      const b64Imgs = await imgsToBase64(day.imgs);
      if (day.day === 11) {
        console.log('PDF day 11 base64 exists', b64Imgs.length > 0);
      }
      return { ...day, imgs: b64Imgs };
    })),
  ]);

  console.log('PDF hero base64 exists', !!coverImageB64);

  const resolvedItinerary = {
    ...itinerary,
    coverImage: coverImageB64 || null,  // null → CoverPage renders no image, no placeholder
    mapImage: getMapImage(assetSlug, assetVariant),
    days: daysWithBase64,
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
