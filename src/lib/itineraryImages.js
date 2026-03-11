// Import all itinerary images at build time via Vite's import.meta.glob.
// Paths are relative to this file: src/lib/ → ../../content/
//
// Usage:
//   import { getGalleryImages, getResearchImages } from '../lib/itineraryImages';
//   const gallery  = getGalleryImages('budapest-city-break');  // [] if none
//   const research = getResearchImages('budapest-city-break'); // [] if none

const galleryModules = import.meta.glob(
  '../../content/itineraries/*/gallery/*.{jpg,jpeg,png,webp}',
  { eager: true }
);

const researchModules = import.meta.glob(
  '../../content/itineraries/*/research/*.{jpg,jpeg,png,webp}',
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
