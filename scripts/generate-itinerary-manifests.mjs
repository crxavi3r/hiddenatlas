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
 *   research/essential/, research/short/
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

const IMAGE_RE  = /\.(jpg|jpeg|png|webp|gif|avif)$/i;
const MAP_RE    = /\.(jpg|jpeg|png|webp|svg)$/i;

if (!existsSync(publicDir)) {
  console.warn('[manifests] public/itineraries/ does not exist — nothing to do');
  process.exit(0);
}

// ── ls / lsRoot ───────────────────────────────────────────────────────────────
// ls: for variant subfolders (essential/, short/).
//   null  → directory does not exist in content/ → resolvers fall back to root
//   []    → directory exists in content/ but has no matching files → explicit suppression
//   [...] → files present → use them
//
// Three-state semantics are anchored on content/ existence (so empty folders that
// encode "suppress" survive). Actual file lists are read from public/ (the canonical
// serving location) so that files added only to public/ are never missed.
function ls(contentVariantDir, publicVariantDir, re, label) {
  const contentExists = existsSync(contentVariantDir);
  if (!contentExists) {
    if (label) console.log(`  [RAW FS READ] ${label}: ABSENT (${contentVariantDir}) → null`);
    return null;
  }
  // Variant folder exists in content/ — read files from public/ (served location)
  const readDir = existsSync(publicVariantDir) ? publicVariantDir : contentVariantDir;
  const rawFiles = readdirSync(readDir).filter(f => !f.startsWith('.'));
  const filtered = rawFiles.filter(f => re.test(f)).sort();
  if (label) {
    console.log(`  [RAW FS READ] ${label}:`);
    console.log(`    path:     ${readDir}`);
    console.log(`    exists:   true`);
    console.log(`    raw:      [${rawFiles.join(', ')}]`);
    console.log(`    filtered: [${filtered.join(', ')}]`);
  }
  return filtered;
}

// lsRoot: for root/default directories — always an array, never null.
// Reads from public/ first (canonical serving location), falls back to content/.
function lsRoot(contentDir, publicDir, re, label) {
  const readDir = existsSync(publicDir) ? publicDir : (existsSync(contentDir) ? contentDir : null);
  if (!readDir) {
    if (label) console.log(`  [RAW FS READ] ${label}: ABSENT → []`);
    return [];
  }
  const rawFiles = readdirSync(readDir).filter(f => !f.startsWith('.'));
  const filtered = rawFiles.filter(f => re.test(f)).sort();
  if (label) {
    console.log(`  [RAW FS READ] ${label}:`);
    console.log(`    path:     ${readDir}`);
    console.log(`    exists:   true`);
    console.log(`    raw:      [${rawFiles.join(', ')}]`);
    console.log(`    filtered: [${filtered.join(', ')}]`);
  }
  return filtered;
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
  const srcDir = path.join(contentDir, slug);  // used for variant-folder existence (three-state semantics)

  const hasContentDir = existsSync(srcDir);
  // discoverDir is only used to locate day-image subfolders; file lists come from public/
  const discoverDir   = hasContentDir ? srcDir : imgDir;

  // verbose=true for the slug we want to diagnose
  const verbose = (slug === 'california-american-west');
  if (verbose) console.log(`\n=== MANIFEST BUILD: ${slug} ===`);
  else         console.log(`  ${slug}: discovery from ${hasContentDir ? 'content/' : 'public/'}`);

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

  // ── Gallery — three-state anchored on content/, files read from public/ ───
  if (verbose) console.log('\n--- GALLERY RAW FS READ ---');
  data.gallery = {
    root:      lsRoot(path.join(srcDir, 'gallery'),            path.join(imgDir, 'gallery'),            IMAGE_RE, verbose ? 'gallery root'      : null),
    essential: ls(    path.join(srcDir, 'gallery', 'essential'), path.join(imgDir, 'gallery', 'essential'), IMAGE_RE, verbose ? 'gallery essential' : null),
    short:     ls(    path.join(srcDir, 'gallery', 'short'),     path.join(imgDir, 'gallery', 'short'),     IMAGE_RE, verbose ? 'gallery short'     : null),
  };
  if (verbose) console.log('  FILTERED FILES RESULT (gallery):', JSON.stringify(data.gallery));

  // ── Research — three-state: null (absent) → fallback to root, [] → suppress ─
  if (verbose) console.log('\n--- RESEARCH RAW FS READ ---');
  data.research = {
    root:      lsRoot(path.join(srcDir, 'research'),            path.join(imgDir, 'research'),            IMAGE_RE, verbose ? 'research root'      : null),
    essential: ls(    path.join(srcDir, 'research', 'essential'), path.join(imgDir, 'research', 'essential'), IMAGE_RE, verbose ? 'research essential' : null),
    short:     ls(    path.join(srcDir, 'research', 'short'),     path.join(imgDir, 'research', 'short'),     IMAGE_RE, verbose ? 'research short'     : null),
  };
  if (verbose) console.log('  FILTERED FILES RESULT (research):', JSON.stringify(data.research));

  // ── Day images ─────────────────────────────────────────────────────────────
  // Three-state for each day's variant subfolder.
  // Discovery uses content/ day-images folder list (to catch intentionally empty subfolders);
  // actual file lists come from public/ (canonical serving location).
  const contentDayImagesDir = path.join(srcDir,    'day-images');
  const publicDayImagesDir  = path.join(imgDir,    'day-images');
  const dayImagesDir = existsSync(contentDayImagesDir) ? contentDayImagesDir : publicDayImagesDir;

  if (existsSync(dayImagesDir)) {
    for (const dayFolder of readdirSync(dayImagesDir).sort()) {
      const match = dayFolder.match(/^day(\d+)$/i);
      if (!match) continue;
      const dayNumber = parseInt(match[1], 10);
      const cDayDir   = path.join(contentDayImagesDir, dayFolder);
      const pDayDir   = path.join(publicDayImagesDir,  dayFolder);
      const isVerboseDay = verbose && (dayNumber === 1 || dayNumber === 8);
      if (isVerboseDay) console.log(`\n--- DAY ${dayNumber} RAW FS READ ---`);
      data.dayImages[dayNumber] = {
        root:      lsRoot(cDayDir,                        pDayDir,                        IMAGE_RE, isVerboseDay ? `day${dayNumber} root`      : null),
        essential: ls(    path.join(cDayDir, 'essential'), path.join(pDayDir, 'essential'), IMAGE_RE, isVerboseDay ? `day${dayNumber} essential` : null),
        short:     ls(    path.join(cDayDir, 'short'),     path.join(pDayDir, 'short'),     IMAGE_RE, isVerboseDay ? `day${dayNumber} short`     : null),
      };
      if (isVerboseDay) {
        const d = data.dayImages[dayNumber];
        const chosen = d.short?.length ? `short: [${d.short.join(', ')}]`
          : d.short === null           ? `root fallback: [${d.root.join(', ')}]`
          :                              `SUPPRESSED (short=[])`;
        console.log(`  FINAL CHOSEN PATH / URL FOR DAY ${dayNumber}: /itineraries/${slug}/day-images/day${dayNumber}/${chosen}`);
      }
    }
  }

  // ── Maps — public/ is fine (maps are always in sync) ──────────────────────
  const mapDir = path.join(imgDir, 'map');
  data.map = {
    root:      lsRoot(path.join(srcDir, 'map'),            mapDir,                      MAP_RE, null),
    complete:  ls(    path.join(srcDir, 'map', 'complete'), path.join(mapDir, 'complete'), MAP_RE, null),
    essential: ls(    path.join(srcDir, 'map', 'essential'), path.join(mapDir, 'essential'), MAP_RE, null),
    short:     ls(    path.join(srcDir, 'map', 'short'),     path.join(mapDir, 'short'),     MAP_RE, null),
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
      root:      data.research.root,
      essential: data.research.essential,
      short:     data.research.short,
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
