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

  // Resolve day images using the same variant logic as the web renderer:
  //   complete  → root day image only
  //   essential → essential/ override → root fallback
  //   short     → short/ override → root fallback
  // Returns empty array if no image is found; DayPage collapses the image area.
  const rawDays = (itinerary.days || []).map(day => {
    // Local filesystem images take priority (high-res originals).
    // Fall back to day.img (DB/Blob URL) when no local file exists —
    // this covers days whose images were uploaded via the CMS asset manager.
    const fsImgs = getDayImages(assetSlug, day.day, assetVariant);
    const imgs   = fsImgs.length > 0 ? fsImgs : (day.img ? [day.img] : []);
    if (day.day === 11) {
      console.log('[download-free] Day 11 (raw) →', JSON.stringify({ title: day.title, imgs: imgs.length, img0: imgs[0]?.slice(0, 80) || '(none)' }));
    }
    return { ...day, imgs };
  });

  // Pre-fetch all remote images as base64 data URIs before handing to the renderer.
  // @react-pdf/renderer has instability with remote URL fetching in browser context,
  // and imgUrl() appends ?w=N&q=85 params that break Vercel Blob URLs.
  // Data URIs pass through imgUrl() unchanged (don't start with "http").
  console.log('[download-free] pre-fetching images as base64…');
  const [coverImageB64, daysWithBase64] = await Promise.all([
    imgToBase64(rawCoverImage),
    Promise.all(rawDays.map(async day => {
      const b64Imgs = await imgsToBase64(day.imgs);
      if (day.day === 11) {
        console.log('[download-free] Day 11 (base64) →', b64Imgs.length,
          b64Imgs[0] ? b64Imgs[0].slice(0, 40) + '…' : '(none)');
      }
      return { ...day, imgs: b64Imgs.length > 0 ? b64Imgs : day.imgs };
    })),
  ]);

  const resolvedItinerary = {
    ...itinerary,
    coverImage: coverImageB64 || rawCoverImage,
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
