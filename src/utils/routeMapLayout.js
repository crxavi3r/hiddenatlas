/**
 * routeMapLayout.js
 *
 * Shared layout engine for all generic route maps (InteractiveRouteMap + PDF).
 * Computes: equirectangular projection, smooth path, animation fractions,
 * and collision-resolved label positions using a greedy placement algorithm.
 *
 * Pure JS — no DOM, no React, safe to import from both web components and PDF.
 */

export const ROUTE_MAP_TIER = {
  1: { r: 7,   rActive: 10,  sw: 2.0, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 11.5, dFs: 8   },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5,  dFs: 7.5 },
};

export function resolveStopTier(stop, i, n) {
  if (stop.type === 'major' || stop.type === 'major_stop') return 1;
  if (stop.type === 'stop'  || stop.type === 'route_stop') return 2;
  return (i === 0 || i === n - 1) ? 1 : 2;
}

/**
 * Build complete route map layout from stops and canvas dimensions.
 *
 * @param {object[]} stops    Visible stops: { latitude, longitude, name, dayNumber, type }
 * @param {number}   canvasW  SVG canvas width in user units
 * @param {number}   canvasH  SVG canvas height in user units
 * @param {object}   [opts]
 * @param {number}   [opts.pad=0.25]    Extra geographic padding (fraction of lat/lng span)
 * @param {number}   [opts.margin=0]    Fixed pixel inset inside the SVG canvas
 * @returns {{ proj, pts, fractions, routePathD, labeledStops } | null}
 */
export function buildRouteMapLayout(stops, canvasW, canvasH, { pad = 0.25, margin = 0 } = {}) {
  const n = stops.length;
  if (n < 2) return null;

  // ── Projection ───────────────────────────────────────────────────────────
  const lats    = stops.map(s => s.latitude);
  const lngs    = stops.map(s => s.longitude);
  const latMin  = Math.min(...lats),  latMax  = Math.max(...lats);
  const lngMin  = Math.min(...lngs),  lngMax  = Math.max(...lngs);
  const latSpan = latMax - latMin || 1;
  const lngSpan = lngMax - lngMin || 1;

  const X0 = lngMin - lngSpan * pad;
  const X1 = lngMax + lngSpan * pad;
  const Y0 = latMin - latSpan * pad;
  const Y1 = latMax + latSpan * pad;

  const drawW = canvasW - margin * 2;
  const drawH = canvasH - margin * 2;

  const proj = (lon, lat) => [
    margin + ((lon - X0) / (X1 - X0)) * drawW,
    margin + (1 - (lat - Y0) / (Y1 - Y0)) * drawH,
  ];

  const pts = stops.map(s => proj(s.longitude, s.latitude));

  // ── Catmull-Rom smooth path ───────────────────────────────────────────────
  const routePathD = (() => {
    const T = 0.22;
    let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
      const p2 = pts[i + 1],              p3 = pts[Math.min(n - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) * T, p1[1] + (p2[1] - p0[1]) * T];
      const c2 = [p2[0] - (p3[0] - p1[0]) * T, p2[1] - (p3[1] - p1[1]) * T];
      d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  })();

  // ── Cumulative-distance fractions for route animation ────────────────────
  const dists = [0];
  for (let i = 1; i < n; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalDist = dists[n - 1] || 1;
  const fractions = dists.map(d => d / totalDist);

  // ── Label collision avoidance (greedy) ───────────────────────────────────
  // Approximate text metrics
  const CHAR_W = 0.60;   // char width as fraction of font size
  const LINE_H = 1.40;   // line height as fraction of font size
  const GAP    = 5;      // px gap between marker edge and label start
  const SLOP   = 2;      // px tolerance added to each side when testing overlap

  const placedBoxes = [];

  function boxesOverlap(a, b) {
    return a.x1 - SLOP < b.x2 && a.x2 + SLOP > b.x1 &&
           a.y1 - SLOP < b.y2 && a.y2 + SLOP > b.y1;
  }

  function makeLabelBox(cx, cy, side, yOff, name, fs, r) {
    const textW   = Math.min(name.length * fs * CHAR_W + 8, 155);
    const textH   = fs * LINE_H;
    const anchorX = side === 'right' ? cx + r + GAP : cx - r - GAP;
    const x1      = side === 'right' ? anchorX           : anchorX - textW;
    const x2      = side === 'right' ? anchorX + textW   : anchorX;
    return { x1, y1: cy + yOff - textH * 0.85, x2, y2: cy + yOff + textH * 0.30 };
  }

  const labeledStops = stops.map((stop, i) => {
    const [cx, cy] = pts[i];
    const tier     = resolveStopTier(stop, i, n);
    const cfg      = ROUTE_MAP_TIER[tier];
    const r        = cfg.r;
    const fs       = cfg.lFs;

    // Preferred placement: right when stop is in the left 55% of the canvas
    const prefRight = cx <= canvasW * 0.55;
    const STEP      = fs * 1.85; // vertical nudge increment

    // Generate candidates: for each y-offset, try preferred side then other side.
    // This keeps the preferred side strongly preferred while allowing vertical escape.
    const candidates = [];
    for (const yOff of [0, -STEP, STEP, -STEP * 2, STEP * 2, -STEP * 3, STEP * 3]) {
      candidates.push({ side: prefRight ? 'right' : 'left',  yOff });
      candidates.push({ side: prefRight ? 'left'  : 'right', yOff });
    }

    let chosen = null;
    for (const c of candidates) {
      const box = makeLabelBox(cx, cy, c.side, c.yOff, stop.name, fs, r);
      if (!placedBoxes.some(p => boxesOverlap(p, box))) {
        placedBoxes.push(box);
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      // Last resort: use first candidate regardless of collision
      chosen = candidates[0];
      placedBoxes.push(makeLabelBox(cx, cy, chosen.side, chosen.yOff, stop.name, fs, r));
    }

    return {
      stop, tier, cfg,
      cx, cy, r,
      labelAnchor: chosen.side === 'right' ? 'start' : 'end',
      labelX:      chosen.side === 'right' ? cx + r + GAP : cx - r - GAP,
      labelY:      cy + chosen.yOff,
      fs,
    };
  });

  return { proj, pts, fractions, routePathD, labeledStops };
}
