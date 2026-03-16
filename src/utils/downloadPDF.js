export async function downloadItineraryPDF(itinerary) {
  console.log('[download-free] clicked', itinerary.id);

  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }, { getDayImages }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
    import('../lib/itineraryImages'),
  ]);

  // Resolve local day images (filenames → bundled asset URLs) so the PDF renderer
  // can fetch them. day.img values starting with 'http' are passed through unchanged.
  const dayImgMap = Object.fromEntries(
    getDayImages(itinerary.id).map(({ filename, src }) => [filename, src])
  );
  const resolvedItinerary = {
    ...itinerary,
    days: (itinerary.days || []).map(day => ({
      ...day,
      img: day.img
        ? (day.img.startsWith('http') ? day.img : (dayImgMap[day.img] ?? null))
        : null,
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
