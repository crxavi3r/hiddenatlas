/**
 * generate-itinerary-manifests.mjs
 *
 * Reads public/itineraries/<slug>/ (image files already copied there) and:
 *   1. Writes public/itineraries/<slug>/manifest.json   — used by the server-side
 *      scan-assets endpoint (small JSON, committed to git)
 *   2. Writes src/lib/itineraryManifests.js             — imported by itineraryImages.js
 *      so the browser can resolve static CDN URLs without import.meta.glob
 *
 * Captures the full variant structure used by California American West:
 *   gallery/essential/, gallery/short/
 *   research/essential/, research/short/, research/essential/_hide, research/short/_hide
 *   day-images/day{N}/essential/, day-images/day{N}/short/
 *   map/complete/, map/essential/, map/short/, root map/
 *
 * Run:  node scripts/generate-itinerary-manifests.mjs
 * Auto: called as `prebuild` in package.json before every Vite build
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root       = path.join(__dirname, '..');
const publicDir  = path.join(root, 'public', 'itineraries');
const contentDir = path.join(root, 'content', 'itineraries'); // optional metadata source

const IMAGE_RE  = /\.(jpg|jpeg|png|webp|gif|avif|JPG|JPEG|PNG|WEBP|GIF|AVIF)$/;
const MAP_RE    = /\.(jpg|jpeg|png|webp|svg|JPG|JPEG|PNG|WEBP|SVG)$/;

if (!existsSync(publicDir)) {
  console.warn('[manifests] public/itineraries/ does not exist — nothing to do');
  process.exit(0);
}

// lsVariant: used for variant subfolders (essential/, short/).
// Returns null when the directory does not exist — lets resolvers distinguish
// "no variant folder → fall back to root" from "variant folder exists but
// empty → explicit suppression, no fallback".
function ls(dir, re) {
  if (!existsSync(dir)) return null;
  return readdirSync(dir).filter(f => re.test(f)).sort();
}

// lsRoot: used for root/default directories (gallery/, research/, day{N}/).
// Always returns an array — never null — because root folders have no
// suppression semantics and may simply be absent on Vercel (git doesn't
// track empty directories).
function lsRoot(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => re.test(f)).sort();
}

function hasHideMarker(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).includes('_hide');
}

const slugs    = readdirSync(publicDir).filter(f => !f.startsWith('.') && !f.endsWith('.json'));
const allData  = {};

for (const slug of slugs) {
  const imgDir = path.join(publicDir, slug);
  const srcDir = path.join(contentDir, slug); // may not exist on Vercel

  // Optional title from editorial metadata
  let title = null;
  try {
    const meta = JSON.parse(readFileSync(path.join(srcDir, 'itinerary.json'), 'utf8'));
    title = meta.title ?? null;
  } catch { /* no metadata available */ }

  const data = { slug, title, heroFile: null, gallery: {}, research: {}, dayImages: {}, map: {} };

  // ── Hero ──────────────────────────────────────────────────────────────────
  // Check itinerary.json heroImage field, fallback to cover.jpg
  let heroFilename = 'cover.jpg';
  try {
    const meta = JSON.parse(readFileSync(path.join(srcDir, 'itinerary.json'), 'utf8'));
    heroFilename = meta.heroImage || 'cover.jpg';
  } catch {}
  if (existsSync(path.join(imgDir, heroFilename)) && IMAGE_RE.test(heroFilename)) {
    data.heroFile = heroFilename;
  }

  // ── Gallery ───────────────────────────────────────────────────────────────
  data.gallery = {
    root:      lsRoot(path.join(imgDir, 'gallery'), IMAGE_RE),           // [] when absent
    essential: ls(path.join(imgDir, 'gallery', 'essential'), IMAGE_RE),  // null when absent
    short:     ls(path.join(imgDir, 'gallery', 'short'), IMAGE_RE),      // null when absent
  };

  // ── Research ──────────────────────────────────────────────────────────────
  data.research = {
    root:          lsRoot(path.join(imgDir, 'research'), IMAGE_RE),           // [] when absent
    essential:     ls(path.join(imgDir, 'research', 'essential'), IMAGE_RE),  // null when absent
    short:         ls(path.join(imgDir, 'research', 'short'), IMAGE_RE),      // null when absent
    hideEssential: hasHideMarker(path.join(imgDir, 'research', 'essential')),
    hideShort:     hasHideMarker(path.join(imgDir, 'research', 'short')),
  };

  // ── Day images ────────────────────────────────────────────────────────────
  const dayImagesDir = path.join(imgDir, 'day-images');
  if (existsSync(dayImagesDir)) {
    for (const dayFolder of readdirSync(dayImagesDir).sort()) {
      const match = dayFolder.match(/^day(\d+)$/i);
      if (!match) continue;
      const dayNumber = parseInt(match[1], 10);
      const dayDir    = path.join(dayImagesDir, dayFolder);
      data.dayImages[dayNumber] = {
        root:      lsRoot(dayDir, IMAGE_RE),                           // [] when absent
        essential: ls(path.join(dayDir, 'essential'), IMAGE_RE),       // null when absent
        short:     ls(path.join(dayDir, 'short'), IMAGE_RE),           // null when absent
      };
    }
  }

  // ── Maps ──────────────────────────────────────────────────────────────────
  const mapDir = path.join(imgDir, 'map');
  data.map = {
    root:      lsRoot(mapDir, MAP_RE),
    complete:  ls(path.join(mapDir, 'complete'),  MAP_RE),
    essential: ls(path.join(mapDir, 'essential'), MAP_RE),
    short:     ls(path.join(mapDir, 'short'),     MAP_RE),
  };

  allData[slug] = data;

  // Write per-slug manifest.json (used by the server scan-assets endpoint).
  // gallery, research, and dayImages all use the full variant structure so
  // scan-assets can resolve the correct files for each itinerary variant
  // (complete / essential / short) using the same logic as itineraryImages.js.
  const serverManifest = {
    slug, title,
    heroFile: data.heroFile,
    gallery: {
      root:      data.gallery.root,
      essential: data.gallery.essential,
      short:     data.gallery.short,
    },
    research: {
      root:          data.research.root,
      essential:     data.research.essential,
      short:         data.research.short,
      hideEssential: data.research.hideEssential,
      hideShort:     data.research.hideShort,
    },
    dayImages: Object.fromEntries(
      Object.entries(data.dayImages).map(([n, v]) => [n, {
        root:      v.root,
        essential: v.essential,
        short:     v.short,
      }])
    ),
  };
  mkdirSync(imgDir, { recursive: true });
  writeFileSync(path.join(imgDir, 'manifest.json'), JSON.stringify(serverManifest, null, 2));

  const total = data.gallery.root.length + data.research.root.length
    + Object.values(data.dayImages).reduce((s, v) => s + v.root.length, 0)
    + (data.heroFile ? 1 : 0);
  console.log(`  ${slug}: ${total} root images`);
}

// Write src/lib/itineraryManifests.js (imported by itineraryImages.js)
const jsLines = [
  '// AUTO-GENERATED by scripts/generate-itinerary-manifests.mjs',
  '// Do not edit manually. Run `node scripts/generate-itinerary-manifests.mjs` to regenerate.',
  '// eslint-disable-next-line',
  '',
  '/** @type {Record<string, import("./itineraryImages").ItineraryManifest>} */',
  `export const MANIFESTS = ${JSON.stringify(allData, null, 2)};`,
  '',
];
const jsPath = path.join(root, 'src', 'lib', 'itineraryManifests.js');
writeFileSync(jsPath, jsLines.join('\n'));

console.log(`\n✓ ${slugs.length} manifests → public/itineraries/<slug>/manifest.json`);
console.log(`✓ src/lib/itineraryManifests.js updated`);
