/**
 * debug-image-resolution.mjs
 * Run: node scripts/debug-image-resolution.mjs
 * Exercises the full filesystem resolver for california-american-west-8-days
 * without needing a browser or auth token.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load the pre-built manifest directly ──────────────────────────────────────
const manifestPath = path.join(__dirname, '..', 'src', 'lib', 'itineraryManifests.js');

// Inline the manifest read so we avoid the module cache issue
const { MANIFESTS } = await import(manifestPath);

// ── Simulate resolveAssetIdentity ─────────────────────────────────────────────
// california-american-west-8-days → parentId=california-american-west, variant=short
const SLUG       = 'california-american-west-8-days';
const ASSET_SLUG = 'california-american-west';
const VARIANT    = 'short';
const DURATION   = 8;

// ── ITINERARY DEBUG ───────────────────────────────────────────────────────────
console.log('\n=== ITINERARY DEBUG ===');
console.log('ITINERARY DEBUG', {
  slug: SLUG,
  title: '(from DB — not available in script)',
  parentSlug: ASSET_SLUG,
  parentId: ASSET_SLUG,
  variant: VARIANT,
  durationDays: DURATION,
});

// ── FILESYSTEM ROOT ───────────────────────────────────────────────────────────
console.log('\n=== FILESYSTEM ROOT ===');
const manifest = MANIFESTS[ASSET_SLUG];
console.log('FILESYSTEM ROOT', {
  rootPathInUse: 'MANIFESTS (pre-built from content/itineraries/)',
  manifestExists: !!manifest,
  manifestSlugs: Object.keys(MANIFESTS),
});

if (!manifest) {
  console.error(`ERROR: No manifest found for slug "${ASSET_SLUG}"`);
  console.log('Available slugs:', Object.keys(MANIFESTS));
  process.exit(1);
}

// ── Helper: resolveVariantBucket ──────────────────────────────────────────────
function normalizeVariant(variant) {
  if (variant === 'essential') return 'essential';
  if (variant === 'short')     return 'short';
  return 'complete';
}
function resolveVariantBucket(bucket, variant) {
  const v = normalizeVariant(variant);
  if (Array.isArray(bucket)) return { files: bucket, sub: null };
  if (!bucket)               return { files: [],     sub: null };
  if (v === 'essential') {
    const ess = bucket.essential;
    if (ess == null)    return { files: bucket.root ?? [], sub: null };
    if (ess.length > 0) return { files: ess,               sub: 'essential' };
    return              { files: [],                        sub: 'essential' };
  }
  if (v === 'short') {
    const sh = bucket.short;
    if (sh == null)    return { files: bucket.root ?? [], sub: null };
    if (sh.length > 0) return { files: sh,                sub: 'short' };
    return             { files: [],                        sub: 'short' };
  }
  return { files: bucket.root ?? [], sub: null };
}

// ── DB ASSETS (simulated — script has no auth) ───────────────────────────────
console.log('\n=== DB ASSETS ===');
console.log('DB ASSETS (script simulation — real DB assets require browser auth):', []);

// ── GALLERY CHECK ─────────────────────────────────────────────────────────────
console.log('\n=== GALLERY CHECK ===');
{
  const base = `/itineraries/${ASSET_SLUG}/gallery`;
  const { files, sub } = resolveVariantBucket(manifest.gallery, VARIANT);
  console.log('GALLERY CHECK', {
    baseSlug: ASSET_SLUG,
    variant: VARIANT,
    manifestGallery: manifest.gallery,
    chosenMode: sub ? `variant/${sub}` : 'root',
    chosenFiles: files,
    resolvedUrls: files.map(f => sub ? `${base}/${sub}/${f}` : `${base}/${f}`),
  });
}

// ── RESEARCH CHECK ────────────────────────────────────────────────────────────
console.log('\n=== RESEARCH CHECK ===');
{
  const base = `/itineraries/${ASSET_SLUG}/research`;
  const { files, sub } = resolveVariantBucket(manifest.research, VARIANT);
  console.log('RESEARCH CHECK', {
    baseSlug: ASSET_SLUG,
    variant: VARIANT,
    manifestResearch: manifest.research,
    chosenMode: sub ? `variant/${sub}` : 'root',
    chosenFiles: files,
    resolvedUrls: files.map(f => sub ? `${base}/${sub}/${f}` : `${base}/${f}`),
  });
}

// ── DAY IMAGE CHECK (all days 1-8, highlight day 8) ───────────────────────────
console.log('\n=== DAY IMAGE CHECK (days 1-8) ===');
const mergedFsAssets = [];
for (let dayNumber = 1; dayNumber <= DURATION; dayNumber++) {
  const dayData = manifest.dayImages[dayNumber];
  const base    = `/itineraries/${ASSET_SLUG}/day-images/day${dayNumber}`;
  if (!dayData) {
    console.log('DAY IMAGE CHECK', { day: dayNumber, manifestDayData: null, chosenSource: 'absent', chosenFiles: [] });
    continue;
  }
  const { files, sub } = resolveVariantBucket(dayData, VARIANT);
  const urlBase = sub ? `${base}/${sub}` : base;
  const detail = {
    day: dayNumber,
    baseSlug: ASSET_SLUG,
    variant: VARIANT,
    defaultPath: base,
    variantPath: `${base}/${VARIANT}`,
    manifestDayData: dayData,
    resolvedFiles: files,
    sub: sub || null,
    chosenSource: sub ? `variant/${sub}` : 'root',
    chosenPath: urlBase,
    suppressed: files.length === 0,
  };
  if (dayNumber === 8) console.log('\n--- DAY 8 DETAIL ---');
  console.log('DAY IMAGE CHECK', detail);
  files.slice(0, 2).forEach((f, i) => {
    mergedFsAssets.push({ type: 'day', source: 'filesystem', dayNumber, url: `${urlBase}/${f}`, id: null });
  });
}

// ── Filesystem gallery + research into merged ─────────────────────────────────
{
  const base = `/itineraries/${ASSET_SLUG}/gallery`;
  const { files, sub } = resolveVariantBucket(manifest.gallery, VARIANT);
  files.forEach((f, i) => mergedFsAssets.push({ type: 'gallery', source: 'filesystem', dayNumber: null, url: sub ? `${base}/${sub}/${f}` : `${base}/${f}`, id: null }));
}
{
  const base = `/itineraries/${ASSET_SLUG}/research`;
  const { files, sub } = resolveVariantBucket(manifest.research, VARIANT);
  files.forEach((f, i) => mergedFsAssets.push({ type: 'research', source: 'filesystem', dayNumber: null, url: sub ? `${base}/${sub}/${f}` : `${base}/${f}`, id: null }));
}

// ── MERGED ASSETS ─────────────────────────────────────────────────────────────
console.log('\n=== MERGED ASSETS (filesystem only — DB would prepend blob assets) ===');
console.log('MERGED ASSETS', mergedFsAssets);

console.log('\n=== SUMMARY ===');
console.log(`Total FS assets: ${mergedFsAssets.length}`);
console.log(`  gallery:  ${mergedFsAssets.filter(a => a.type === 'gallery').length}`);
console.log(`  research: ${mergedFsAssets.filter(a => a.type === 'research').length}`);
console.log(`  day:      ${mergedFsAssets.filter(a => a.type === 'day').length}`);
