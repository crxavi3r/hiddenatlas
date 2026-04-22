/**
 * generate-itinerary-manifests.mjs
 *
 * Reads content/itineraries/<slug>/ for file discovery (canonical source — preserves
 * empty variant folders which encode suppression semantics) and:
 *   1. Syncs any missing image files content/ → public/ so served URLs resolve.
 *   2. Writes public/itineraries/<slug>/manifest.json   — used by the server-side
 *      scan-assets endpoint (small JSON, committed to git)
 *   3. Writes src/lib/itineraryManifests.js             — imported by itineraryImages.js
 *      so the browser can resolve static CDN URLs without import.meta.glob
 *
 * Why content/ not public/ for discovery:
 *   Git does not track empty directories. An intentionally-empty variant subfolder
 *   (e.g. day9/short/ with no files = "suppress day 9 for short variant") survives
 *   in content/ but is lost in public/ after a fresh clone. Discovering from content/
 *   preserves the three-state semantics: null (absent) / [] (empty = suppress) / [...files].
 *   public/ is still the serving location; URLs always point there.
 *
 * Variant structure captured:
 *   gallery/essential/, gallery/short/
 *   research/essential/, research/short/, research/essential/_hide, research/short/_hide
 *   day-images/day{N}/essential/, day-images/day{N}/short/
 *   map/complete/, map/essential/, map/short/, root map/
 *
 * Run:  node scripts/generate-itinerary-manifests.mjs
 * Auto: called as `prebuild` in package.json before every Vite build
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root       = path.join(__dirname, '..');
const publicDir  = path.join(root, 'public', 'itineraries');
const contentDir = path.join(root, 'content', 'itineraries');

const IMAGE_RE  = /\.(jpg|jpeg|png|webp|gif|avif|JPG|JPEG|PNG|WEBP|GIF|AVIF)$/;
const MAP_RE    = /\.(jpg|jpeg|png|webp|svg|JPG|JPEG|PNG|WEBP|SVG)$/;

if (!existsSync(publicDir)) {
  console.warn('[manifests] public/itineraries/ does not exist — nothing to do');
  process.exit(0);
}

// ── ls / lsRoot ───────────────────────────────────────────────────────────────
// ls: for variant subfolders (essential/, short/).
//   null  → directory does not exist → resolvers fall back to root
//   []    → directory exists but has no matching files → explicit suppression
//   [...] → files present → use them
function ls(dir, re) {
  if (!existsSync(dir)) return null;
  return readdirSync(dir).filter(f => re.test(f)).sort();
}

// lsRoot: for root/default directories — always an array, never null.
function lsRoot(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => re.test(f)).sort();
}

function hasHideMarker(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir).includes('_hide');
}

// ── Sync: copy image files missing from public/ ───────────────────────────────
// Recurses through srcDir. For each image file present in src but absent in dst,
// copies it. Creates destination directories as needed.
// Skips directories that exist only in dst (public-only additions are fine).
let syncCount = 0;
function syncImages(srcDir, dstDir, re) {
  if (!existsSync(srcDir)) return;
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (entry.startsWith('.') || entry === '_hide') continue;
    const src = path.join(srcDir, entry);
    const dst = path.join(dstDir, entry);
    const st  = statSync(src);
    if (st.isDirectory()) {
      syncImages(src, dst, re);
    } else if (re.test(entry) && !existsSync(dst)) {
      copyFileSync(src, dst);
      console.log(`  [sync] ${src.replace(root + '/', '')} → ${dst.replace(root + '/', '')}`);
      syncCount++;
    }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
const slugs   = readdirSync(publicDir).filter(f => !f.startsWith('.') && !f.endsWith('.json'));
const allData = {};

for (const slug of slugs) {
  const imgDir = path.join(publicDir, slug);   // served URLs always point here
  const srcDir = path.join(contentDir, slug);  // file discovery source

  const hasContentDir = existsSync(srcDir);
  const discoverDir   = hasContentDir ? srcDir : imgDir;

  console.log(`  ${slug}: discovery from ${hasContentDir ? 'content/' : 'public/'}`);

  // 1. Sync image files content/ → public/ so URLs resolve
  if (hasContentDir) {
    syncImages(path.join(srcDir, 'gallery'),    path.join(imgDir, 'gallery'),    IMAGE_RE);
    syncImages(path.join(srcDir, 'research'),   path.join(imgDir, 'research'),   IMAGE_RE);
    syncImages(path.join(srcDir, 'day-images'), path.join(imgDir, 'day-images'), IMAGE_RE);
    syncImages(path.join(srcDir, 'map'),        path.join(imgDir, 'map'),        MAP_RE);
  }

  // Optional title from editorial metadata
  let title = null;
  try {
    const meta = JSON.parse(readFileSync(path.join(srcDir, 'itinerary.json'), 'utf8'));
    title = meta.title ?? null;
  } catch { /* no metadata available */ }

  const data = { slug, title, heroFile: null, gallery: {}, research: {}, dayImages: {}, map: {} };

  // ── Hero ──────────────────────────────────────────────────────────────────
  let heroFilename = 'cover.jpg';
  try {
    const meta = JSON.parse(readFileSync(path.join(srcDir, 'itinerary.json'), 'utf8'));
    heroFilename = meta.heroImage || 'cover.jpg';
  } catch {}
  if (existsSync(path.join(imgDir, heroFilename)) && IMAGE_RE.test(heroFilename)) {
    data.heroFile = heroFilename;
  }

  // ── Gallery — discovered from content/, URLs point to public/ ─────────────
  data.gallery = {
    root:      lsRoot(path.join(discoverDir, 'gallery'), IMAGE_RE),
    essential: ls(path.join(discoverDir, 'gallery', 'essential'), IMAGE_RE),
    short:     ls(path.join(discoverDir, 'gallery', 'short'), IMAGE_RE),
  };

  // ── Research — discovered from content/, URLs point to public/ ────────────
  data.research = {
    root:          lsRoot(path.join(discoverDir, 'research'), IMAGE_RE),
    essential:     ls(path.join(discoverDir, 'research', 'essential'), IMAGE_RE),
    short:         ls(path.join(discoverDir, 'research', 'short'), IMAGE_RE),
    hideEssential: hasHideMarker(path.join(discoverDir, 'research', 'essential')),
    hideShort:     hasHideMarker(path.join(discoverDir, 'research', 'short')),
  };

  // ── Day images — discovered from content/, URLs point to public/ ──────────
  const dayImagesDir = path.join(discoverDir, 'day-images');
  if (existsSync(dayImagesDir)) {
    for (const dayFolder of readdirSync(dayImagesDir).sort()) {
      const match = dayFolder.match(/^day(\d+)$/i);
      if (!match) continue;
      const dayNumber = parseInt(match[1], 10);
      const dayDir    = path.join(dayImagesDir, dayFolder);
      data.dayImages[dayNumber] = {
        root:      lsRoot(dayDir, IMAGE_RE),
        essential: ls(path.join(dayDir, 'essential'), IMAGE_RE),
        short:     ls(path.join(dayDir, 'short'), IMAGE_RE),
      };
    }
  }

  // ── Maps — public/ is fine (maps are always in sync) ──────────────────────
  const mapDir = path.join(imgDir, 'map');
  data.map = {
    root:      lsRoot(mapDir, MAP_RE),
    complete:  ls(path.join(mapDir, 'complete'),  MAP_RE),
    essential: ls(path.join(mapDir, 'essential'), MAP_RE),
    short:     ls(path.join(mapDir, 'short'),     MAP_RE),
  };

  allData[slug] = data;

  // Write per-slug manifest.json
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
  console.log(`    → ${total} root images`);
}

// Write src/lib/itineraryManifests.js
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

if (syncCount > 0) console.log(`\n✓ ${syncCount} image(s) synced content/ → public/`);
console.log(`✓ ${slugs.length} manifests → public/itineraries/<slug>/manifest.json`);
console.log(`✓ src/lib/itineraryManifests.js updated`);
