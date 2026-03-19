// Import all itinerary images at build time via Vite's import.meta.glob.
// Paths are relative to this file: src/lib/ → ../../content/
//
// Variant resolution rules:
//   complete  → root assets only (never reads from variant subfolders)
//   essential → {folder}/essential/ override if it exists, else falls back to root
//   short     → {folder}/short/ override if it exists, else falls back to root
//
// Research variant resolution (same override → fallback pattern as gallery/day images):
//   complete  → root research/ only
//   essential → research/essential/ images if present
//             → research/essential/_hide marker if present → hide section (empty array)
//             → otherwise fallback to root research/
//   short     → same pattern for research/short/
//
// To explicitly hide research for a variant: place a file named `_hide` inside
// research/essential/ or research/short/ (no images needed alongside it).
//
// Maps are always variant-specific (map/complete/, map/essential/, map/short/).
// Itineraries without variant subfolders fall back to the legacy root map/ folder.
//
// Usage:
//   import { getGalleryImages, getResearchImages, getDayImage,
//            getCoverImage, getMapImage } from '../lib/itineraryImages';
//
//   // slug = itinerary.parentId ?? itinerary.id  (the content folder name)
//   // variant = itinerary.variant                ('premium'|'essential'|'short'|undefined)
//   const gallery  = getGalleryImages(slug, variant);
//   const research = getResearchImages(slug, variant);
//   const img      = getDayImage(slug, dayNumber, variant);
//   const cover    = getCoverImage(slug);
//   const map      = getMapImage(slug, variant);

// NOTE: Vite's import.meta.glob uses fast-glob with case-sensitive matching by default,
// even on macOS. Both lowercase and uppercase extension variants are listed explicitly
// so files like IMG_5444.JPG are discovered correctly on all platforms.

// ── Gallery ──────────────────────────────────────────────────────────────────
const galleryRootModules = import.meta.glob(
  '../../content/itineraries/*/gallery/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const galleryEssentialModules = import.meta.glob(
  '../../content/itineraries/*/gallery/essential/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const galleryShortModules = import.meta.glob(
  '../../content/itineraries/*/gallery/short/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

// ── Research images ───────────────────────────────────────────────────────────
const researchRootModules = import.meta.glob(
  '../../content/itineraries/*/research/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const researchEssentialModules = import.meta.glob(
  '../../content/itineraries/*/research/essential/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const researchShortModules = import.meta.glob(
  '../../content/itineraries/*/research/short/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
// Marker files: place a file named `_hide` in research/essential/ or research/short/
// to explicitly suppress research for that variant (folder exists but should show nothing).
// Without this marker, an empty variant folder falls back to root research.
const researchEssentialHideMarkers = import.meta.glob(
  '../../content/itineraries/*/research/essential/_hide',
  { eager: true }
);
const researchShortHideMarkers = import.meta.glob(
  '../../content/itineraries/*/research/short/_hide',
  { eager: true }
);

// ── Day images ────────────────────────────────────────────────────────────────
const dayRootModules = import.meta.glob(
  '../../content/itineraries/*/day-images/day*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const dayEssentialModules = import.meta.glob(
  '../../content/itineraries/*/day-images/day*/essential/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);
const dayShortModules = import.meta.glob(
  '../../content/itineraries/*/day-images/day*/short/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

// ── Maps ──────────────────────────────────────────────────────────────────────
// Root-level map/ (legacy, for itineraries without variant subfolders)
const mapRootModules = import.meta.glob(
  '../../content/itineraries/*/map/*.{jpg,jpeg,png,webp,svg,JPG,JPEG,PNG,WEBP,SVG}',
  { eager: true }
);
const mapCompleteModules = import.meta.glob(
  '../../content/itineraries/*/map/complete/*.{jpg,jpeg,png,webp,svg,JPG,JPEG,PNG,WEBP,SVG}',
  { eager: true }
);
const mapEssentialModules = import.meta.glob(
  '../../content/itineraries/*/map/essential/*.{jpg,jpeg,png,webp,svg,JPG,JPEG,PNG,WEBP,SVG}',
  { eager: true }
);
const mapShortModules = import.meta.glob(
  '../../content/itineraries/*/map/short/*.{jpg,jpeg,png,webp,svg,JPG,JPEG,PNG,WEBP,SVG}',
  { eager: true }
);

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Map 'premium' (legacy alias) and anything else unknown to 'complete'.
 * Returns one of: 'complete' | 'essential' | 'short'
 */
function normalizeVariant(variant) {
  if (variant === 'essential') return 'essential';
  if (variant === 'short')     return 'short';
  return 'complete'; // 'premium', 'complete', undefined, or unrecognised
}

/**
 * Filter a glob module map to the files inside a specific slug+folder,
 * returning [{src, filename}] pairs.
 * `folder` is the path segment after the slug, e.g. 'gallery' or 'gallery/essential'.
 */
function toImageList(modules, slug, folder) {
  return Object.entries(modules)
    .filter(([path]) => path.includes(`/itineraries/${slug}/${folder}/`))
    .map(([path, mod]) => ({
      src: mod.default,
      filename: path.split('/').pop(),
    }));
}

/**
 * Pick the preferred map entry from a filtered list.
 * Prefers route-map.png, avoids -print variants, falls back to first file.
 */
function pickMapEntry(entries) {
  if (!entries.length) return null;
  const preferred =
    entries.find(([path]) => path.endsWith('/route-map.png')) ||
    entries.find(([path]) => !path.includes('-print'))        ||
    entries[0];
  return preferred ? preferred[1].default : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns gallery images for the given asset slug and variant.
 *
 * complete  → root gallery only
 * essential → gallery/essential/ override if it exists, else root
 * short     → gallery/short/ override if it exists, else root
 *
 * @param {string}  slug    - Content folder name (itinerary.parentId ?? itinerary.id)
 * @param {string} [variant]
 */
export function getGalleryImages(slug, variant) {
  const v = normalizeVariant(variant);

  if (v === 'essential') {
    const overrides = toImageList(galleryEssentialModules, slug, 'gallery/essential');
    if (overrides.length) return overrides;
    return toImageList(galleryRootModules, slug, 'gallery');
  }

  if (v === 'short') {
    const overrides = toImageList(galleryShortModules, slug, 'gallery/short');
    if (overrides.length) return overrides;
    return toImageList(galleryRootModules, slug, 'gallery');
  }

  // complete: root only
  return toImageList(galleryRootModules, slug, 'gallery');
}

/**
 * Returns research images for the given asset slug and variant.
 *
 * complete  → root research/ only
 * essential → research/essential/ images if present
 *           → research/essential/_hide present → [] (hide section)
 *           → no variant folder → fallback to root research/
 * short     → same pattern for research/short/
 *
 * An empty array always signals that the research section should be hidden.
 *
 * @param {string}  slug
 * @param {string} [variant]
 */
export function getResearchImages(slug, variant) {
  const v = normalizeVariant(variant);

  if (v === 'essential') {
    const overrides = toImageList(researchEssentialModules, slug, 'research/essential');
    if (overrides.length) return overrides;

    // Folder exists but intentionally empty → hide
    const hideMarker = Object.keys(researchEssentialHideMarkers)
      .some(path => path.includes(`/itineraries/${slug}/research/essential/_hide`));
    if (hideMarker) return [];

    // No variant folder at all → fallback to root
    return toImageList(researchRootModules, slug, 'research');
  }

  if (v === 'short') {
    const overrides = toImageList(researchShortModules, slug, 'research/short');
    if (overrides.length) return overrides;

    const hideMarker = Object.keys(researchShortHideMarkers)
      .some(path => path.includes(`/itineraries/${slug}/research/short/_hide`));
    if (hideMarker) return [];

    return toImageList(researchRootModules, slug, 'research');
  }

  // complete: root only
  return toImageList(researchRootModules, slug, 'research');
}

/**
 * Returns the bundled asset URL for a single day image, or null if none exists.
 *
 * complete  → day-images/day{N}/{file}            (root only)
 * essential → day-images/day{N}/essential/{file}  → falls back to root
 * short     → day-images/day{N}/short/{file}      → falls back to root
 *
 * @param {string}  slug
 * @param {number}  dayNumber - 1-based day index
 * @param {string} [variant]
 */
export function getDayImage(slug, dayNumber, variant) {
  const v        = normalizeVariant(variant);
  const dayNeedle = `/itineraries/${slug}/day-images/day${dayNumber}/`;

  if (v === 'essential') {
    const entry = Object.entries(dayEssentialModules)
      .find(([path]) => path.includes(`${dayNeedle}essential/`));
    if (entry) return entry[1].default;
    // fall through to root
  }

  if (v === 'short') {
    const entry = Object.entries(dayShortModules)
      .find(([path]) => path.includes(`${dayNeedle}short/`));
    if (entry) return entry[1].default;
    // fall through to root
  }

  // complete, or root fallback for essential/short
  const entry = Object.entries(dayRootModules)
    .find(([path]) => path.includes(dayNeedle));
  return entry ? entry[1].default : null;
}

/**
 * Returns up to 2 bundled asset URLs for a day's images.
 * Applies the same variant resolution as getDayImage.
 *
 * @param {string}  slug
 * @param {number}  dayNumber
 * @param {string} [variant]
 */
export function getDayImages(slug, dayNumber, variant) {
  const v         = normalizeVariant(variant);
  const dayNeedle = `/itineraries/${slug}/day-images/day${dayNumber}/`;

  if (v === 'essential') {
    const entries = Object.entries(dayEssentialModules)
      .filter(([path]) => path.includes(`${dayNeedle}essential/`));
    if (entries.length) return entries.slice(0, 2).map(([, mod]) => mod.default);
    // fall through to root
  }

  if (v === 'short') {
    const entries = Object.entries(dayShortModules)
      .filter(([path]) => path.includes(`${dayNeedle}short/`));
    if (entries.length) return entries.slice(0, 2).map(([, mod]) => mod.default);
    // fall through to root
  }

  // complete, or root fallback
  return Object.entries(dayRootModules)
    .filter(([path]) => path.includes(dayNeedle))
    .slice(0, 2)
    .map(([, mod]) => mod.default);
}

/**
 * Returns the bundled asset URL for the route map image, or null.
 *
 * Maps are variant-specific. Lookup order:
 *   complete  → map/complete/{file}, then legacy root map/ (backward compat)
 *   essential → map/essential/{file}, or null
 *   short     → map/short/{file}, or null
 *
 * @param {string}  slug
 * @param {string} [variant]
 */
export function getMapImage(slug, variant) {
  const v      = normalizeVariant(variant);
  const needle = (sub) => `/itineraries/${slug}/map/${sub}/`;

  if (v === 'essential') {
    const entries = Object.entries(mapEssentialModules)
      .filter(([path]) => path.includes(needle('essential')));
    return pickMapEntry(entries);
  }

  if (v === 'short') {
    const entries = Object.entries(mapShortModules)
      .filter(([path]) => path.includes(needle('short')));
    return pickMapEntry(entries);
  }

  // complete: try map/complete/ first, then legacy root map/
  const completeEntries = Object.entries(mapCompleteModules)
    .filter(([path]) => path.includes(needle('complete')));
  if (completeEntries.length) return pickMapEntry(completeEntries);

  const rootEntries = Object.entries(mapRootModules)
    .filter(([path]) => path.includes(`/itineraries/${slug}/map/`));
  return pickMapEntry(rootEntries);
}

/**
 * Returns the public URL for the itinerary cover image.
 * Place the file at: public/content/itineraries/<slug>/cover.jpg
 * Stable URL (not content-hashed) so replacements take effect immediately.
 *
 * @param {string} slug - Content folder name (use parentId for variants)
 */
export function getCoverImage(slug) {
  return `/content/itineraries/${slug}/cover.jpg`;
}
