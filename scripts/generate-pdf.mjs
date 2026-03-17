/**
 * PDF generation script for HiddenAtlas itineraries.
 * Run with: node --import tsx/esm scripts/generate-pdf.mjs <itinerary-slug>
 *
 * Resolves day images from local content/itineraries/<slug>/day-images/
 * and outputs the PDF to content/itineraries/<slug>/<slug>-hiddenatlas.pdf
 *
 * Usage:
 *   npx tsx scripts/generate-pdf.mjs northern-england-roadtrip
 */

import React from 'react';
import { renderToFile } from '@react-pdf/renderer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

const SLUG = process.argv[2] || 'northern-england-roadtrip';
console.log(`\n[generate-pdf] slug: ${SLUG}`);

// ── Resolve local day images (up to 2 per day) ────────────────────────────────
function resolveDayImages(dayNum) {
  const dir = path.resolve(ROOT, `content/itineraries/${SLUG}/day-images/day${dayNum}`);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .slice(0, 2)
    .map(f => path.join(dir, f));
}

// ── Resolve cover image (public/ takes priority, else null → Unsplash fallback) ──
function resolveCover() {
  const publicPath = path.resolve(ROOT, `public/content/itineraries/${SLUG}/cover.jpg`);
  return fs.existsSync(publicPath) ? publicPath : null;
}

// ── Resolve map image ─────────────────────────────────────────────────────────
// Prefers route-map.png (web/PDF version without embedded title) over
// route-map-print.png (which has its own title block and is for standalone print use).
function resolveMap() {
  const dir = path.resolve(ROOT, `content/itineraries/${SLUG}/map`);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  const preferred = files.find(f => f === 'route-map.png')
    || files.find(f => !f.includes('-print'))
    || files[0];
  return preferred ? path.join(dir, preferred) : null;
}

// ── Import itinerary data ─────────────────────────────────────────────────────
const { itineraries } = await import('../src/data/itineraries.js');
const itinerary = itineraries.find(i => i.id === SLUG);
if (!itinerary) {
  console.error(`[generate-pdf] ERROR: itinerary "${SLUG}" not found.`);
  process.exit(1);
}

// ── Build resolved itinerary object (mirrors downloadPDF.js logic) ───────────
const localCover = resolveCover();
const resolved = {
  ...itinerary,
  coverImage: localCover || itinerary.coverImage,
  mapImage:   resolveMap(),
  days: (itinerary.days || []).map(day => ({
    ...day,
    imgs: resolveDayImages(day.day),
  })),
};

console.log(`[generate-pdf] cover  : ${resolved.coverImage}`);
console.log(`[generate-pdf] map    : ${resolved.mapImage ?? 'none'}`);
resolved.days.forEach(d => {
  console.log(`[generate-pdf] day ${d.day} imgs: ${d.imgs.length ? d.imgs.join(', ') : 'placeholder'}`);
});

// ── Import PDF component ──────────────────────────────────────────────────────
const { default: ItineraryPDF } = await import('../src/components/ItineraryPDF.jsx');

// ── Render to file ────────────────────────────────────────────────────────────
const outDir  = path.resolve(ROOT, `content/itineraries/${SLUG}`);
const outFile = path.join(outDir, `${SLUG}-hiddenatlas.pdf`);

console.log(`[generate-pdf] rendering…`);
await renderToFile(
  React.createElement(ItineraryPDF, { itinerary: resolved }),
  outFile,
);

console.log(`[generate-pdf] ✓ PDF saved to: ${outFile}\n`);
