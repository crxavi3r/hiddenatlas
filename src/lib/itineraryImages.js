// Import all itinerary images at build time via Vite's import.meta.glob.
// Paths are relative to this file: src/lib/ → ../../content/
//
// Usage:
//   import { getGalleryImages, getResearchImages, getDayImage, getCoverImage } from '../lib/itineraryImages';
//   const gallery  = getGalleryImages('rome-4-day-city-break');  // [] if none
//   const research = getResearchImages('rome-4-day-city-break'); // [] if none
//   const img      = getDayImage('rome-4-day-city-break', 4);    // asset URL or null
//   const cover    = getCoverImage('morocco-motorcycle-expedition'); // public URL string
//
// Day images live in per-day subfolders: day-images/day1/, day-images/day2/, …
// Place one image per folder. If the folder is empty, getDayImage returns null.
// Day images and cover images are intentionally excluded from gallery/research
// so they never appear in auto-rendered grid sections.

const galleryModules = import.meta.glob(
  '../../content/itineraries/*/gallery/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const researchModules = import.meta.glob(
  '../../content/itineraries/*/research/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const dayFolderModules = import.meta.glob(
  '../../content/itineraries/*/day-images/day*/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const mapModules = import.meta.glob(
  '../../content/itineraries/*/map/*.{jpg,jpeg,png,webp,svg}',
  { eager: true }
);

function toImageList(modules, slug, folder) {
  return Object.entries(modules)
    .filter(([path]) => path.includes(`/itineraries/${slug}/${folder}/`))
    .map(([path, mod]) => ({
      src: mod.default,
      filename: path.split('/').pop(),
    }));
}

export function getGalleryImages(slug) {
  return toImageList(galleryModules, slug, 'gallery');
}

export function getResearchImages(slug) {
  return toImageList(researchModules, slug, 'research');
}

/**
 * Returns the bundled asset URL for a day's image, or null if none is present.
 * Images must be placed in: content/itineraries/<slug>/day-images/day<N>/<image>
 * Only the first file found in the folder is used.
 */
export function getDayImage(slug, dayNumber) {
  const needle = `/itineraries/${slug}/day-images/day${dayNumber}/`;
  const entry = Object.entries(dayFolderModules).find(([path]) => path.includes(needle));
  return entry ? entry[1].default : null;
}

/**
 * Returns up to 2 bundled asset URLs for a day's images.
 * Images must be placed in: content/itineraries/<slug>/day-images/day<N>/<image>
 * Returns an empty array if the folder is empty.
 */
export function getDayImages(slug, dayNumber) {
  const needle = `/itineraries/${slug}/day-images/day${dayNumber}/`;
  return Object.entries(dayFolderModules)
    .filter(([path]) => path.includes(needle))
    .slice(0, 2)
    .map(([, mod]) => mod.default);
}

/**
 * Returns the bundled asset URL for the route map image, or null if none exists.
 * Place the map file at: content/itineraries/<slug>/map/<filename>
 * Supports jpg, jpeg, png, webp, svg. Only the first file in the folder is used.
 * Note: SVG files render on the web but are not supported by @react-pdf/renderer's
 * Image component — use JPG or PNG for PDF compatibility.
 */
export function getMapImage(slug) {
  const needle = `/itineraries/${slug}/map/`;
  const entry = Object.entries(mapModules).find(([path]) => path.includes(needle));
  return entry ? entry[1].default : null;
}

/**
 * Returns the public URL for the itinerary cover image.
 * Place the cover image at: public/content/itineraries/<slug>/cover.jpg
 * This uses a stable URL (not content-hashed) so image replacements take effect immediately.
 */
export function getCoverImage(slug) {
  return `/content/itineraries/${slug}/cover.jpg`;
}
