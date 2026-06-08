/**
 * routeMapLayout.js
 *
 * Shared layout engine for all generic route maps (InteractiveRouteMap + PDF).
 * Computes: equirectangular projection, smooth path, animation fractions,
 * and collision-resolved label positions using a greedy placement algorithm.
 *
 * Pure JS — no DOM, no React, safe to import from both web components and PDF.
 */

// ── Haversine distance ────────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Split stops into mainStops (fit in viewport) and remoteStops (outliers / day trips).
 *
 * Respects metadata.routeSegmentType overrides:
 *   'main_route'      → always in mainStops
 *   'day_trip'        → always in remoteStops
 *   'optional_detour' → always in remoteStops
 *   (others / absent) → auto-detected via Tukey fence
 *
 * @param {object[]} stops  Stops with latitude/longitude
 * @returns {{ mainStops: object[], remoteStops: object[] }}
 */
export function detectOutlierStops(stops) {
  if (stops.length < 3) return { mainStops: stops, remoteStops: [] };

  // Split explicit overrides first
  const forceMain   = stops.filter(s => s.metadata?.routeSegmentType === 'main_route');
  const forceRemote = stops.filter(s => {
    const t = s.metadata?.routeSegmentType;
    return t === 'day_trip' || t === 'optional_detour';
  });
  const autoStops = stops.filter(s => {
    const t = s.metadata?.routeSegmentType;
    return t !== 'main_route' && t !== 'day_trip' && t !== 'optional_detour';
  });

  // Short-circuit if everything is explicitly categorised
  if (!autoStops.length) {
    const main = stops.filter(s => s.metadata?.routeSegmentType !== 'day_trip' && s.metadata?.routeSegmentType !== 'optional_detour');
    return { mainStops: main.length >= 2 ? main : stops, remoteStops: forceRemote };
  }

  // Centroid of all stops (not just auto, so it reflects the real geographic centre)
  const cLat = stops.reduce((s, p) => s + p.latitude,  0) / stops.length;
  const cLng = stops.reduce((s, p) => s + p.longitude, 0) / stops.length;

  // Distance from centroid for each auto-detected stop
  const dists = autoStops.map(s => haversineKm(cLat, cLng, s.latitude, s.longitude));
  const sorted = [...dists].sort((a, b) => a - b);
  const maxDist = sorted[sorted.length - 1];

  // If all stops are within 2km of each other, nothing is an outlier
  if (maxDist < 2) return { mainStops: stops, remoteStops: [] };

  // Tukey fence: Q3 + 1.5 × IQR
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  // When all stops are tightly clustered (iqr ≈ 0) use a 3× multiplier to avoid
  // flagging genuine outliers at the cluster boundary
  const fence = iqr < 0.5 ? q3 + 3 : q3 + 1.5 * iqr;

  const autoMain   = autoStops.filter((_, i) => dists[i] <= fence);
  const autoRemote = autoStops.filter((_, i) => dists[i] > fence);

  // Need at least 2 in main for a valid map
  const allMain = [...forceMain, ...autoMain];
  if (allMain.length < 2) return { mainStops: stops, remoteStops: [] };

  return { mainStops: allMain, remoteStops: [...forceRemote, ...autoRemote] };
}

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
 * @param {number}   [opts.pad=0.25]              Extra geographic padding (fraction of lat/lng span)
 * @param {number}   [opts.margin=0]              Fixed pixel inset inside the SVG canvas
 * @param {object}   [opts.tiers=null]            Override tier config (defaults to ROUTE_MAP_TIER)
 * @param {boolean}  [opts.prioritizeMajor=false] Place tier-1 labels before tier-2 (PDF mode)
 * @returns {{ proj, pts, fractions, routePathD, labeledStops } | null}
 */
export function buildRouteMapLayout(stops, canvasW, canvasH, {
  pad = 0.25,
  margin = 0,
  tiers = null,
  prioritizeMajor = false,
} = {}) {
  const n = stops.length;
  if (n < 2) return null;

  const TIER = tiers || ROUTE_MAP_TIER;

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
  const CHAR_W = 0.58;   // Helvetica char width as fraction of font size
  const LINE_H = 1.30;   // line height as fraction of font size
  const GAP    = 5;      // px gap between marker edge and label start
  const SLOP   = 2;      // px tolerance added to each side when testing overlap

  const placedBoxes = [];

  function boxesOverlap(a, b) {
    return a.x1 - SLOP < b.x2 && a.x2 + SLOP > b.x1 &&
           a.y1 - SLOP < b.y2 && a.y2 + SLOP > b.y1;
  }

  function makeLabelBox(cx, cy, side, yOff, name, fs, r) {
    const textW   = Math.min(name.length * fs * CHAR_W + 6, 140);
    const textH   = fs * LINE_H;
    const anchorX = side === 'right' ? cx + r + GAP : cx - r - GAP;
    const x1      = side === 'right' ? anchorX           : anchorX - textW;
    const x2      = side === 'right' ? anchorX + textW   : anchorX;
    return { x1, y1: cy + yOff - textH * 0.82, x2, y2: cy + yOff + textH * 0.28 };
  }

  // Also reserve a box for the marker circle itself so labels dodge markers
  function markerBox(cx, cy, r) {
    return { x1: cx - r - SLOP, y1: cy - r - SLOP, x2: cx + r + SLOP, y2: cy + r + SLOP };
  }

  function placeLabel(stopObj, idx) {
    const [cx, cy] = pts[idx];
    const tierNum  = resolveStopTier(stopObj, idx, n);
    const cfg      = TIER[tierNum];
    const r        = cfg.r;
    const fs       = cfg.lFs;

    const prefRight = cx <= canvasW * 0.55;
    const STEP      = fs * 1.65;

    const candidates = [];
    for (const yOff of [0, -STEP, STEP, -STEP * 2, STEP * 2, -STEP * 3, STEP * 3, -STEP * 4, STEP * 4]) {
      candidates.push({ side: prefRight ? 'right' : 'left',  yOff });
      candidates.push({ side: prefRight ? 'left'  : 'right', yOff });
    }

    let chosen = null;
    for (const c of candidates) {
      const box = makeLabelBox(cx, cy, c.side, c.yOff, stopObj.name, fs, r);
      // Check clipping: label must stay within canvas (with small margin)
      if (box.x1 < 2 || box.x2 > canvasW - 2 || box.y1 < 2 || box.y2 > canvasH - 2) continue;
      if (!placedBoxes.some(p => boxesOverlap(p, box))) {
        placedBoxes.push(box);
        chosen = c;
        break;
      }
    }
    if (!chosen) {
      // Last resort: first candidate ignoring in-bounds and collision
      chosen = candidates[0];
      placedBoxes.push(makeLabelBox(cx, cy, chosen.side, chosen.yOff, stopObj.name, fs, r));
    }

    return {
      stop: stopObj,
      tier: tierNum,
      cfg,
      cx, cy,
      r,
      labelAnchor: chosen.side === 'right' ? 'start' : 'end',
      labelX:      chosen.side === 'right' ? cx + r + GAP : cx - r - GAP,
      labelY:      cy + chosen.yOff,
      fs,
    };
  }

  // Pre-register all marker boxes so labels don't overlap any marker
  stops.forEach((stop, idx) => {
    const tierNum = resolveStopTier(stop, idx, n);
    placedBoxes.push(markerBox(pts[idx][0], pts[idx][1], TIER[tierNum].r));
  });

  let labeledStops;
  if (prioritizeMajor) {
    // Two-pass: major stops first so they get best placement
    const majorIndices = stops.map((s, i) => ({ s, i })).filter(({ s, i }) => resolveStopTier(s, i, n) === 1);
    const minorIndices = stops.map((s, i) => ({ s, i })).filter(({ s, i }) => resolveStopTier(s, i, n) !== 1);
    const results = new Array(n);
    for (const { s, i } of majorIndices) results[i] = placeLabel(s, i);
    for (const { s, i } of minorIndices) results[i] = placeLabel(s, i);
    labeledStops = results;
  } else {
    labeledStops = stops.map((stop, i) => placeLabel(stop, i));
  }

  return { proj, pts, fractions, routePathD, labeledStops };
}
