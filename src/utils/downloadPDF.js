export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] clicked', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getDayImages, getCoverImage, getMapImage }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
  ]);

  // Local cover takes priority over the Unsplash-based coverImage.
  const localCover = getCoverImage(itinerary.id);

  // Resolve day images from per-day subfolders: day-images/dayN/
  // Up to 2 images per day. Returns empty array if the folder is empty.
  const resolvedItinerary = {
    ...itinerary,
    coverImage: localCover || itinerary.coverImage,
    mapImage: getMapImage(itinerary.id),
    days: (itinerary.days || []).map(day => ({
      ...day,
      imgs: getDayImages(itinerary.id, day.day),
    })),
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
