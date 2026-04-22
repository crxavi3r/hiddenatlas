/**
 * resolveAssetIdentity.js
 *
 * Single source of truth for resolving the asset folder slug and variant type
 * for any itinerary. Used by all three surfaces:
 *
 *   - Public site  (ItineraryDetailPage):   itinerary comes from static data → parentId/variant already present
 *   - Backoffice   (ItineraryCMSEditorPage): itinerary comes from DB → parentId/variant may be null
 *   - PDF          (buildCustomPDF):         itinerary comes from form state (same as backoffice)
 *
 * Resolution order:
 *   1. Explicit parentId / variant from the itinerary object (set in DB)
 *   2. Static data lookup by slug (src/data/itineraries.js) — catches existing records
 *      created before the parentId/variant columns were added
 *   3. Fallback: use the slug itself with no variant (standalone itinerary)
 *
 * @param {string} slug       - The itinerary slug (from DB or URL)
 * @param {object} [dbFields] - { parentId?: string, variant?: string } from DB/form
 * @returns {Promise<{ assetSlug: string, variant: string|undefined }>}
 */
export async function resolveAssetIdentity(slug, dbFields = {}) {
  const { parentId, variant } = dbFields;

  // 1. Explicit parentId from DB — only short-circuit when the folder slug is known.
  //    Never short-circuit on variant alone: variant without parentId would return the wrong
  //    assetSlug (e.g. 'california-american-west-8-days' instead of 'california-american-west'),
  //    causing all manifest lookups to fail.
  if (parentId) {
    console.log(`[resolveAssetIdentity] DB parentId: slug="${slug}" → assetSlug="${parentId}", variant="${variant || 'none'}"`);
    return {
      assetSlug: parentId,
      variant:   variant || undefined,
    };
  }

  // 2. Static data lookup — catches records where parentId was not saved to DB
  //    (e.g. created before the column was added, or where only variant was stored).
  try {
    const { itineraries } = await import('../data/itineraries.js');
    const all   = Array.isArray(itineraries) ? itineraries : Object.values(itineraries ?? {});
    const found = all.find(it => (it.id || it.slug) === slug);
    if (found) {
      const assetSlug = found.parentId || found.id || slug;
      // DB variant takes precedence when set; fall back to static variant
      const resolvedVariant = variant || found.variant || undefined;
      console.log(`[resolveAssetIdentity] static lookup: slug="${slug}" → assetSlug="${assetSlug}", variant="${resolvedVariant || 'none'}"`);
      return { assetSlug, variant: resolvedVariant };
    }
  } catch (e) {
    console.warn('[resolveAssetIdentity] static data lookup failed:', e.message);
  }

  // 3. Fallback — standalone itinerary with no parent
  console.log(`[resolveAssetIdentity] fallback: slug="${slug}" → assetSlug="${slug}", variant="${variant || 'none'}"`);
  return { assetSlug: slug, variant: variant || undefined };
}
