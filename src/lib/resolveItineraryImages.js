/**
 * resolveItineraryImages.js
 *
 * Single source of truth for itinerary image resolution.
 * Used identically by: frontend (ItineraryDetailPage), backoffice PDF generation,
 * and free PDF download.
 *
 * Resolution rules:
 *
 *   variant = null | 'complete' → use root images (no subfolder)
 *   variant = 'essential'       → use /essential/ subfolder if present
 *   variant = 'short'           → use /short/ subfolder if present
 *
 * Day image three-state logic (via getDayImages):
 *   variant subfolder absent   (null)  → fall back to root images
 *   variant subfolder empty    ([])    → suppress — day EXCLUDED from output
 *   variant subfolder has files ([...]) → use those files
 *
 * Day filtering:
 *   1. durationDays hard limit  — days beyond this number are excluded
 *   2. Empty-folder suppression — days with no resolved images are excluded
 *
 * Priority chain per day:
 *   DB blob assets (ItineraryAsset rows) > inline day.img > filesystem manifest
 */

import {
  getDayImages,
  getGalleryImages,
  getResearchImages,
  getMapImage,
  getCoverImage,
} from './itineraryImages.js';

/**
 * Derive the filesystem asset slug and variant from any itinerary object.
 * Works for both static-data itineraries (id/parentId) and DB rows (slug/parentId).
 */
function getAssetId(itinerary) {
  const assetSlug =
    itinerary.parentId  ||
    itinerary.parentSlug ||
    itinerary.id        ||
    itinerary.slug      ||
    '';
  const variant = itinerary.variant || undefined;
  return { assetSlug, variant };
}

/**
 * Resolve day images for all days in contentDays, returning ONLY days that have
 * at least one image after variant resolution and all filtering.
 *
 * @param {Object}  itinerary    - { id?, slug?, parentId?, variant?, durationDays? }
 * @param {Array}   contentDays  - day objects from content.days (each has .day number)
 * @param {Array}   [dbAssets]   - ItineraryAsset rows (prioritised over filesystem)
 * @returns {{ ...day, imgs: string[] }[]}
 */
export function resolveDayImages(itinerary, contentDays = [], dbAssets = []) {
  const { assetSlug, variant } = getAssetId(itinerary);
  const limit = itinerary.durationDays ? parseInt(itinerary.durationDays, 10) : null;
  const ownSlug = itinerary.slug || itinerary.id || assetSlug;

  console.log(
    `[resolveDayImages] slug="${ownSlug}" parentSlug="${assetSlug}"` +
    ` variant="${variant || 'none'}" durationDays=${limit ?? 'unlimited'}` +
    ` totalContentDays=${contentDays.length}`
  );

  const resolved = [];

  for (const day of contentDays) {
    const dayNumber = Number(day.day);

    // ── 1. Hard durationDays limit ─────────────────────────────────────────────
    if (limit !== null && dayNumber > limit) {
      console.log(`[resolveDayImages]   day ${dayNumber}: SKIP — beyond durationDays=${limit}`);
      continue;
    }

    // ── 2. Priority chain ──────────────────────────────────────────────────────
    const dayDbAssets = dbAssets.filter(
      a => a.assetType === 'day' &&
           Number(a.dayNumber) === dayNumber &&
           a.active !== false
    );

    let imgs;
    let imgSource;

    if (dayDbAssets.length > 0) {
      imgs      = dayDbAssets.map(a => a.url).filter(Boolean);
      imgSource = `db(${dayDbAssets.length})`;
    } else if (day.img) {
      imgs      = [day.img];
      imgSource = 'content.img';
    } else {
      // getDayImages applies the three-state manifest semantics:
      //   null  → absent → falls back to root
      //   []    → exists but empty → suppressed (returns [])
      //   [...]  → use variant files
      imgs      = getDayImages(assetSlug, dayNumber, variant);
      imgSource = imgs.length > 0
        ? `filesystem(${assetSlug},${variant || 'root'},${imgs.length})`
        : `suppressed/absent(${assetSlug},${variant || 'root'})`;
    }

    // ── 3. Empty-folder suppression — exclude day entirely ────────────────────
    if (imgs.length === 0) {
      console.log(`[resolveDayImages]   day ${dayNumber}: EXCLUDED — no images [${imgSource}]`);
      continue;
    }

    console.log(`[resolveDayImages]   day ${dayNumber}: OK — ${imgSource}`);
    resolved.push({ ...day, imgs: imgs.slice(0, 2) });
  }

  console.log(`[resolveDayImages] resolved ${resolved.length}/${contentDays.length} days`);
  return resolved;
}

/**
 * Resolve gallery images, applying variant resolution and DB merge.
 * DB assets take priority; filesystem fills the rest.
 *
 * @param {Object} itinerary
 * @param {Array}  [dbAssets]
 * @returns {{ src: string, filename: string }[]}
 */
export function resolveGalleryImages(itinerary, dbAssets = []) {
  const { assetSlug, variant } = getAssetId(itinerary);
  const fsImages = getGalleryImages(assetSlug, variant);

  const dbGallery = dbAssets
    .filter(a => a.assetType === 'gallery')
    .map(a => ({ src: a.url, filename: a.alt || a.url.split('/').pop() }));

  const dbUrls = new Set(dbGallery.map(a => a.src));
  const merged = [...dbGallery, ...fsImages.filter(img => !dbUrls.has(img.src))];
  console.log(
    `[resolveGalleryImages] assetSlug="${assetSlug}" variant="${variant || 'none'}"` +
    ` → db=${dbGallery.length} fs=${fsImages.length} total=${merged.length}`
  );
  return merged;
}

/**
 * Resolve research images, applying variant resolution and DB merge.
 * Three-state: null→fallback to root, []→suppress, files→use.
 *
 * @param {Object} itinerary
 * @param {Array}  [dbAssets]
 * @returns {{ src: string, filename: string }[]}
 */
export function resolveResearchImages(itinerary, dbAssets = []) {
  const { assetSlug, variant } = getAssetId(itinerary);
  const fsImages = getResearchImages(assetSlug, variant);

  const dbResearch = dbAssets
    .filter(a => a.assetType === 'research')
    .map(a => ({ src: a.url, filename: a.alt || a.url.split('/').pop() }));

  const dbUrls = new Set(dbResearch.map(a => a.src));
  const merged = [...dbResearch, ...fsImages.filter(img => !dbUrls.has(img.src))];
  console.log(
    `[resolveResearchImages] assetSlug="${assetSlug}" variant="${variant || 'none'}"` +
    ` → db=${dbResearch.length} fs=${fsImages.length} total=${merged.length}`
  );
  return merged;
}

/**
 * Resolve cover image.
 * Priority: itinerary.coverImage → DB hero asset → filesystem manifest
 *
 * @param {Object} itinerary
 * @param {Array}  [dbAssets]
 * @returns {string}
 */
export function resolveCoverImage(itinerary, dbAssets = []) {
  const { assetSlug } = getAssetId(itinerary);
  if (itinerary.coverImage) return itinerary.coverImage;
  const heroAsset = dbAssets.find(a => a.assetType === 'hero');
  if (heroAsset) return heroAsset.url;
  return getCoverImage(assetSlug);
}

/**
 * Resolve map image.
 *
 * @param {Object} itinerary
 * @returns {string|null}
 */
export function resolveMapImage(itinerary) {
  const { assetSlug, variant } = getAssetId(itinerary);
  return getMapImage(assetSlug, variant);
}
