// Import all itinerary images at build time via Vite's import.meta.glob.
// Paths are relative to this file: src/lib/ → ../../content/
//
// Usage:
//   import { getGalleryImages, getResearchImages, getDayImages } from '../lib/itineraryImages';
//   const gallery   = getGalleryImages('budapest-city-break');  // [] if none
//   const research  = getResearchImages('budapest-city-break'); // [] if none
//   const dayImages = getDayImages('rome-4-day-city-break');    // [] if none
//
// day-images/ is a separate folder intentionally excluded from gallery/research
// so these images only appear in their specific day section, not in any auto-rendered grid.

const galleryModules = import.meta.glob(
  '../../content/itineraries/*/gallery/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const researchModules = import.meta.glob(
  '../../content/itineraries/*/research/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const dayImageModules = import.meta.glob(
  '../../content/itineraries/*/day-images/*.{jpg,jpeg,png,webp}',
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

export function getDayImages(slug) {
  return toImageList(dayImageModules, slug, 'day-images');
}
