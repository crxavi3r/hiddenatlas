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
 * @returns {{ assetSlug: string, variant: string|undefined }}
 */

import { itineraries } from '../data/itineraries.js';

const _all = Array.isArray(itineraries) ? itineraries : Object.values(itineraries ?? {});

const _isUUID = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function resolveAssetIdentity(slug, dbFields = {}) {
  const { parentId, variant } = dbFields;

  // 1. Explicit parentId from DB — only use when it is already a slug.
  //    DB stores parentId as a UUID (row id); filesystem folders use slug.
  //    When parentId is a UUID, fall through to the static-data lookup so that
  //    found.parentId (which is always a slug) is used instead.
  if (parentId && !_isUUID(parentId)) {
    console.log(`[resolveAssetIdentity] DB parentId: slug="${slug}" → assetSlug="${parentId}", variant="${variant || 'none'}"`);
    return {
      assetSlug: parentId,
      variant:   variant || undefined,
    };
  }

  // 2. Static data lookup — catches records where parentId was not saved to DB
  //    (e.g. created before the column was added, or where only variant was stored).
  const found = _all.find(it => (it.id || it.slug) === slug);
  if (found) {
    const assetSlug = found.parentId || found.id || slug;
    // DB variant takes precedence when set; fall back to static variant
    const resolvedVariant = variant || found.variant || undefined;
    console.log(`[resolveAssetIdentity] static lookup: slug="${slug}" → assetSlug="${assetSlug}", variant="${resolvedVariant || 'none'}"`);
    return { assetSlug, variant: resolvedVariant };
  }

  // 3. Fallback — standalone itinerary with no parent
  console.log(`[resolveAssetIdentity] fallback: slug="${slug}" → assetSlug="${slug}", variant="${variant || 'none'}"`);
  return { assetSlug: slug, variant: variant || undefined };
}
