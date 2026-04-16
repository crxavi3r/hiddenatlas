export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] starting for:', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getDayImages, getCoverImage, getMapImage }, { imgToBase64, imgsToBase64 }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
    import('./imgToBase64'),
  ]);

  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant;

  // Cover: filesystem takes priority (resolves to static public/ file via browser URL).
  // Falls back to itinerary.coverImage (may be a blob URL).
  const localCover    = getCoverImage(assetSlug);
  const rawCoverImage = localCover || itinerary.coverImage;
  console.log('PDF hero image URL', rawCoverImage || '(none)');

  // Days: filesystem images from manifest, fall back to day.img (blob URL from DB).
  const rawDays = (itinerary.days || []).map(day => {
    const fsImgs = getDayImages(assetSlug, day.day, assetVariant);
    const imgs   = fsImgs.length > 0 ? fsImgs : (day.img ? [day.img] : []);
    if (day.day === 11) {
      console.log('PDF day 11 image URL', imgs[0] || '(none)');
    }
    return { ...day, imgs };
  });

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

  console.log('PDF hero base64 exists', !!coverImageB64);

  const resolvedItinerary = {
    ...itinerary,
    coverImage: coverImageB64 || null,
    mapImage:   getMapImage(assetSlug, assetVariant),
    days:       daysWithBase64,
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
