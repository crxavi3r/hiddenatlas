/**
 * Generates final PDFs for the 3 California & American West variants.
 *
 * Run with:
 *   npx tsx scripts/generate-pdfs-usa.mjs
 *
 * Output:
 *   content/itineraries/california-american-west/california-american-west-complete.pdf
 *   content/itineraries/california-american-west/california-american-west-essential.pdf
 *   content/itineraries/california-american-west/california-american-west-coast.pdf
 *
 * Asset resolution mirrors the website and downloadPDF.js exactly:
 *   complete  → root assets only
 *   essential → variant/essential/ override → root fallback (research: no fallback if _hide marker)
 *   short     → variant/short/ override    → root fallback (research: no fallback if _hide marker)
 */

import React from 'react';
import { renderToFile } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ── Variant normalisation ─────────────────────────────────────────────────────

function normalizeVariant(variant) {
  if (variant === 'essential') return 'essential';
  if (variant === 'short')     return 'short';
  return 'complete'; // 'premium', 'complete', undefined, or unrecognised
}

// ── Image helpers ─────────────────────────────────────────────────────────────

const IMG_RE = /\.(jpg|jpeg|png|webp)$/i;

function readImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => IMG_RE.test(f)).sort().map(f => path.join(dir, f));
}

function hasHideMarker(dir) {
  return fs.existsSync(path.join(dir, '_hide'));
}

// ── Day images ────────────────────────────────────────────────────────────────
// complete  → day-images/day{N}/ root only
// essential → day-images/day{N}/essential/ override → root fallback
// short     → day-images/day{N}/short/ override → root fallback

function resolveDayImages(slug, dayNum, variant) {
  const v        = normalizeVariant(variant);
  const dayDir   = path.resolve(ROOT, `content/itineraries/${slug}/day-images/day${dayNum}`);
  const rootImgs = readImages(dayDir).slice(0, 2);

  if (v === 'essential') {
    const variantImgs = readImages(path.join(dayDir, 'essential'));
    if (variantImgs.length) return variantImgs.slice(0, 2);
    return rootImgs;
  }

  if (v === 'short') {
    const variantImgs = readImages(path.join(dayDir, 'short'));
    if (variantImgs.length) return variantImgs.slice(0, 2);
    return rootImgs;
  }

  // complete: root only
  return rootImgs;
}

// ── Cover image ───────────────────────────────────────────────────────────────
// Looks in public/content/itineraries/<slug>/cover.jpg

function resolveCover(slug) {
  const publicPath = path.resolve(ROOT, `public/content/itineraries/${slug}/cover.jpg`);
  return fs.existsSync(publicPath) ? publicPath : null;
}

// ── Map image ─────────────────────────────────────────────────────────────────
// complete  → map/complete/ → legacy root map/
// essential → map/essential/ or null
// short     → map/short/ or null

function pickMapFile(dir) {
  const files = readImages(dir);
  if (!files.length) return null;
  return files.find(f => path.basename(f) === 'route-map.png')
    || files.find(f => !path.basename(f).includes('-print'))
    || files[0];
}

function resolveMap(slug, variant) {
  const v   = normalizeVariant(variant);
  const base = path.resolve(ROOT, `content/itineraries/${slug}/map`);

  if (v === 'essential') {
    return pickMapFile(path.join(base, 'essential'));
  }

  if (v === 'short') {
    return pickMapFile(path.join(base, 'short'));
  }

  // complete: try map/complete/ first, then legacy root map/
  return pickMapFile(path.join(base, 'complete')) || pickMapFile(base);
}

// ── PDF component ─────────────────────────────────────────────────────────────
const { default: ItineraryPDF } = await import('../src/components/ItineraryPDF.jsx');

// ── Itinerary data ────────────────────────────────────────────────────────────
const { itineraries } = await import('../src/data/itineraries.js');

// ── Target definitions ────────────────────────────────────────────────────────
const TARGETS = [
  {
    id:     'california-american-west-16-days',
    output: 'california-american-west-complete.pdf',
  },
  {
    id:     'california-american-west-12-days',
    output: 'california-american-west-essential.pdf',
  },
  {
    id:     'california-american-west-8-days',
    output: 'california-american-west-coast.pdf',
  },
];

// ── Generate ──────────────────────────────────────────────────────────────────
for (const target of TARGETS) {
  const itinerary = itineraries.find(i => i.id === target.id);
  if (!itinerary) {
    console.error(`[generate] ERROR: itinerary "${target.id}" not found.`);
    process.exit(1);
  }

  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant;

  const localCover = resolveCover(assetSlug);
  const mapImage   = resolveMap(assetSlug, assetVariant);

  const resolved = {
    ...itinerary,
    coverImage: localCover || itinerary.coverImage,
    mapImage,
    days: (itinerary.days || []).map(day => ({
      ...day,
      imgs: resolveDayImages(assetSlug, day.day, assetVariant),
    })),
  };

  console.log(`\n[${target.id}]`);
  console.log(`  variant : ${assetVariant} → ${normalizeVariant(assetVariant)}`);
  console.log(`  cover   : ${resolved.coverImage}`);
  console.log(`  map     : ${resolved.mapImage ?? 'none'}`);
  resolved.days.forEach(d => {
    const imgs = d.imgs.map(p => path.basename(p)).join(', ');
    console.log(`  day ${String(d.day).padStart(2)} : ${imgs || '(no image)'}`);
  });

  const outDir  = path.resolve(ROOT, `content/itineraries/${assetSlug}`);
  const outFile = path.join(outDir, target.output);

  console.log(`  rendering → ${outFile}`);
  await renderToFile(
    React.createElement(ItineraryPDF, { itinerary: resolved }),
    outFile,
  );
  console.log(`  ✓ done`);
}

console.log('\n[generate] All 3 PDFs complete.\n');
