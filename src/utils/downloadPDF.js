export async function downloadItineraryPDF(itinerary) {
  const { createElement } = await import('react');
  const [{ pdf }, { default: ItineraryPDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../components/ItineraryPDF'),
  ]);
  const doc = createElement(ItineraryPDF, { itinerary });
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${itinerary.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-hiddenatlas.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
