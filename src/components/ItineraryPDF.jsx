// @react-pdf/renderer — built-in PDF fonts only (TTF/OTF required; WOFF unsupported by fontkit)
//   Times-Roman / Times-Bold  → headings (elegant serif)
//   Helvetica / Helvetica-Bold → body (clean sans-serif)

import {
  Document, Page, Text, View, Image, StyleSheet,
  Svg, Polygon, Path, Rect, Circle,
} from '@react-pdf/renderer';

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  teal:     '#1B6B65',
  tealDark: '#123F3A',
  tealMid:  '#164F4A',
  gold:     '#C9A96E',
  goldDim:  '#A8844E',
  cream:    '#F4F1EC',
  stone:    '#FAFAF8',
  charcoal: '#1C1A16',
  muted:    '#6B6156',
  border:   '#E8E3DA',
  mapBg:    '#EDF4F3',
  white:    '#FFFFFF',
  darkBg:   '#0D1410',
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Cover ──────────────────────────────────────────────────────────────────
  // The outer Page has no sizing – the inner wrapper View provides the
  // positioning context so that all absolute children stack correctly.
  coverWrapper: {
    position: 'relative',
    width: PAGE_W,
    height: PAGE_H,
    overflow: 'hidden',
    backgroundColor: C.darkBg,
  },
  coverBg: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    objectFit: 'cover',
  },
  // Multi-stop dark gradient: bottom is darker so text reads well
  coverOverlay: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    backgroundColor: 'rgba(10,18,14,0.60)',
  },
  coverTopBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 52,
    paddingTop: 38,
  },
  coverBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 3,
    color: C.gold,
  },
  coverTagline: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.40)',
  },
  coverCenter: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 60,
  },
  coverEyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 3.5,
    color: C.gold,
    marginBottom: 20,
    textAlign: 'center',
  },
  coverTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 64,
    color: C.white,
    lineHeight: 1.05,
    marginBottom: 14,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontFamily: 'Helvetica',
    fontSize: 15,
    color: 'rgba(255,255,255,0.70)',
    textAlign: 'center',
    lineHeight: 1.55,
    marginBottom: 32,
  },
  coverGoldLine: {
    width: 52,
    height: 1.5,
    backgroundColor: C.gold,
  },
  // Frosted meta strip at the bottom
  coverBottomStrip: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    paddingHorizontal: 52,
    paddingVertical: 22,
    backgroundColor: 'rgba(10,18,14,0.55)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  coverMeta: {
    flex: 1,
  },
  coverMetaSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 0,
  },
  coverMetaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 1.5,
    color: C.gold,
    marginBottom: 4,
  },
  coverMetaValue: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 1.35,
  },

  // ── Running header (inner pages) ───────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  headerBrand: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    color: C.teal,
    letterSpacing: 0.5,
  },
  headerSection: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: C.muted,
  },

  // ── Route Timeline ─────────────────────────────────────────────────────────
  timelineWrap: {
    paddingHorizontal: 48,
    paddingTop: 22,
    paddingBottom: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    breakInside: 'avoid',
  },
  timelineTrack: {
    width: 22,
    alignItems: 'center',
    flexShrink: 0,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.teal,
    marginTop: 4,
    flexShrink: 0,
  },
  timelineConnector: {
    width: 1.5,
    flex: 1,
    backgroundColor: C.border,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 12,
  },
  timelineDayLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 2,
    color: C.gold,
    marginBottom: 3,
  },
  timelineRoute: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.charcoal,
    lineHeight: 1.4,
  },

  // ── Route Map page ─────────────────────────────────────────────────────────
  mapPage: {
    backgroundColor: C.stone,
  },
  mapBanner: {
    backgroundColor: C.tealMid,
    paddingHorizontal: 48,
    paddingTop: 26,
    paddingBottom: 26,
  },
  mapBannerEyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 6,
  },
  mapBannerTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 26,
    color: C.white,
    marginBottom: 4,
  },
  mapBannerSub: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: 'rgba(255,255,255,0.60)',
  },
  // Highlights below the timeline
  mapHighlights: {
    paddingHorizontal: 48,
    paddingTop: 16,
    paddingBottom: 24,
    breakInside: 'avoid',
  },
  mapHlLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: C.teal,
    marginBottom: 10,
  },
  mapHlGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  mapHlItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 7,
    paddingRight: 12,
    breakInside: 'avoid',
  },
  mapHlDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gold,
    marginTop: 3.5,
    flexShrink: 0,
  },
  mapHlText: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.charcoal,
    lineHeight: 1.55,
    flex: 1,
  },

  // ── Transport page ─────────────────────────────────────────────────────────
  transportPage: {
    backgroundColor: C.white,
    paddingTop: 36,
    paddingBottom: 28,
  },
  transportBody: {
    paddingHorizontal: 48,
    paddingTop: 28,
    paddingBottom: 32,
    breakInside: 'avoid',
  },
  transportSectionTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 20,
    color: C.charcoal,
    marginBottom: 20,
  },
  transportLuggageTip: {
    backgroundColor: C.mapBg,
    borderRadius: 4,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: C.teal,
    borderLeftStyle: 'solid',
    breakInside: 'avoid',
  },
  transportTipLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 1.8,
    color: C.teal,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  transportTipText: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.tealMid,
    lineHeight: 1.65,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    breakInside: 'avoid',
  },
  transportRowLast: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    breakInside: 'avoid',
  },
  transportModeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  transportSegment: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: C.charcoal,
    marginBottom: 2,
  },
  transportService: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.muted,
    marginBottom: 2,
  },
  transportDuration: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: C.teal,
    marginBottom: 3,
  },
  transportNote: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: '#8C8070',
    lineHeight: 1.5,
  },

  // ── Day pages ──────────────────────────────────────────────────────────────
  dayPage: {
    backgroundColor: C.white,
    paddingTop: 36,
    paddingBottom: 28,
  },
  dayImg: {
    width: '100%',
    height: 205,
    objectFit: 'cover',
    objectPosition: 'center',
    breakInside: 'avoid',
  },
  dayImgPlaceholder: {
    width: '100%',
    height: 205,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
    breakInside: 'avoid',
  },
  dayPlaceholderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 3,
    color: C.border,
  },
  dayBody: {
    paddingHorizontal: 48,
    paddingTop: 22,
    paddingBottom: 24,
  },
  dayChip: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: C.gold,
    marginBottom: 7,
  },
  dayTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 21,
    color: C.charcoal,
    lineHeight: 1.22,
    widows: 2,
    orphans: 2,
  },
  dayRule: {
    width: 26,
    height: 1.5,
    backgroundColor: C.gold,
    marginTop: 12,
    marginBottom: 14,
  },
  dayDesc: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.78,
    marginBottom: 14,
  },
  dayBullets: {
    marginBottom: 14,
    breakInside: 'avoid',
  },
  dayBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 5,
    breakInside: 'avoid',
  },
  dayBulletDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.teal,
    marginTop: 3.5,
    flexShrink: 0,
  },
  dayBulletText: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.charcoal,
    lineHeight: 1.58,
    flex: 1,
  },
  // Insider Tip box
  tipBox: {
    backgroundColor: C.mapBg,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 11,
    breakInside: 'avoid',
  },
  tipLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 2,
    color: C.gold,
    marginBottom: 5,
  },
  tipText: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.charcoal,
    lineHeight: 1.65,
  },

  // ── CTA page ───────────────────────────────────────────────────────────────
  ctaPage: {
    backgroundColor: C.tealDark,
  },
  ctaWrapper: {
    flex: 1,
    paddingHorizontal: 64,
    paddingTop: 80,
    paddingBottom: 60,
    justifyContent: 'center',
  },
  // Typographic logo block
  ctaLogoRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 52,
  },
  ctaLogoHidden: {
    fontFamily: 'Times-Bold',
    fontSize: 13,
    color: C.white,
    letterSpacing: 3,
  },
  ctaLogoAtlas: {
    fontFamily: 'Times-Bold',
    fontSize: 13,
    color: C.gold,
    letterSpacing: 3,
  },
  ctaLogoRule: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: 10,
    width: 52,
  },
  ctaTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 36,
    color: C.white,
    lineHeight: 1.22,
    marginBottom: 6,
  },
  ctaGoldRule: {
    width: 44,
    height: 1.5,
    backgroundColor: C.gold,
    marginTop: 18,
    marginBottom: 24,
  },
  ctaLead: {
    fontFamily: 'Helvetica',
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.68)',
    lineHeight: 1.8,
    marginBottom: 26,
    maxWidth: 400,
  },
  ctaBullets: {
    marginBottom: 40,
  },
  ctaBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 11,
  },
  ctaBulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gold,
    marginTop: 4,
    flexShrink: 0,
  },
  ctaBulletText: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 1.5,
    flex: 1,
  },
  ctaButton: {
    backgroundColor: C.gold,
    borderRadius: 4,
    paddingVertical: 15,
    paddingHorizontal: 32,
    alignSelf: 'flex-start',
    marginBottom: 44,
  },
  ctaButtonLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: C.white,
    marginBottom: 3,
  },
  ctaButtonUrl: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.5,
  },
  ctaFootnote: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: 'rgba(255,255,255,0.25)',
    lineHeight: 1.6,
  },

  // ── Page number ─────────────────────────────────────────────────────────────
  pageNum: {
    position: 'absolute',
    bottom: 18,
    right: 48,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.muted,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise image URL — strip existing query params and append w/q */
function imgUrl(src, w = 1000) {
  if (!src) return null;
  // Local bundled asset (resolved by downloadPDF.js) — pass through unchanged
  if (!src.startsWith('http')) return src;
  return `${src.replace(/\?.*/, '')}?w=${w}&q=85`;
}

/**
 * Compass-star mark — same polygon as logo-hiddenatlas.svg.
 * @react-pdf/renderer cannot load external SVG via Image, so we
 * reconstruct the mark with SVG primitives.
 * Original points live in a 0–20 x 2–22 box; viewBox="0 2 20 20" crops it.
 */
function StarMark({ size = 12, color = C.gold }) {
  return (
    <Svg width={size} height={size} viewBox="0 2 20 20">
      <Polygon
        points="10,2 12,10 20,12 12,14 10,22 8,14 0,12 8,10"
        fill={color}
      />
    </Svg>
  );
}

// ── PDF-Native SVG Route Maps ──────────────────────────────────────────────────
// Renders route maps using @react-pdf/renderer SVG primitives.
// Used for itineraries that have no static PNG map asset.

function _pdfProj(lon, lat, X0, X1, Y0, Y1, VW, VH) {
  return [
    (lon - X0) / (X1 - X0) * VW,
    (1 - (lat - Y0) / (Y1 - Y0)) * VH,
  ];
}

function _pdfPoly(coords, proj) {
  return coords.map(([ln, lt], i) => {
    const [x, y] = proj(ln, lt);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

function _pdfCatmull(lonlats, proj, t = 0.22) {
  const pts = lonlats.map(([ln, lt]) => proj(ln, lt));
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i];
    const p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function MoroccoRouteSvgMap() {
  const VW = 800, VH = 720;
  const X0 = -10.5, X1 = -2.0, Y0 = 29.0, Y1 = 36.7;
  const proj = (ln, lt) => _pdfProj(ln, lt, X0, X1, Y0, Y1, VW, VH);
  const svgH = Math.round(PAGE_W * VH / VW);   // ≈ 535pt

  const LAND = [
    [-5.8,35.9],[-5.2,35.9],[-4.0,35.65],[-3.2,35.1],[-2.5,34.9],[-2.0,34.2],
    [-2.0,32.0],[-2.0,30.5],[-3.0,30.0],[-5.5,30.0],[-8.0,30.0],[-9.5,30.0],
    [-9.8,30.5],[-10.0,31.3],[-9.9,32.0],[-9.6,32.8],[-9.2,33.0],[-8.6,33.4],
    [-7.6,33.6],[-7.0,33.7],[-6.8,34.0],[-6.0,35.0],[-5.8,35.9],
  ];
  const SAHARA = [
    [-2.0,32.5],[-2.0,29.0],[-5.0,29.0],[-7.5,29.0],[-9.5,29.5],[-10.0,30.5],
    [-9.8,30.5],[-9.5,30.0],[-8.0,30.0],[-5.5,30.0],[-3.0,30.0],[-2.0,30.5],
    [-2.0,32.0],[-2.8,32.2],[-3.5,31.8],[-4.5,31.8],[-5.5,31.5],[-6.5,31.2],
    [-7.5,30.5],[-6.5,30.0],[-4.5,30.0],[-2.0,30.0],[-2.0,32.5],
  ];
  const CITIES = [
    { name:'Chefchaouen', lon:-5.27, lat:35.17, tier:1, dx: 13 },
    { name:'Fes',         lon:-5.00, lat:34.03, tier:1, dx:-13 },
    { name:'Errachidia',  lon:-4.43, lat:31.93, tier:2, dx:-12 },
    { name:'Merzouga',    lon:-3.97, lat:31.10, tier:1, dx:-13 },
    { name:'Ouarzazate',  lon:-6.89, lat:30.92, tier:2, dx: 12 },
    { name:'Marrakech',   lon:-7.99, lat:31.63, tier:1, dx: 12 },
    { name:'Oualidia',    lon:-9.04, lat:32.73, tier:2, dx: 13 },
    { name:'Casablanca',  lon:-7.59, lat:33.59, tier:2, dx: 13 },
    { name:'Rabat',       lon:-6.84, lat:34.02, tier:2, dx: 13 },
    { name:'Tangier Med', lon:-5.50, lat:35.88, tier:1, dx: 12 },
  ];

  const pts = CITIES.map(c => ({ ...c, pt: proj(c.lon, c.lat) }));
  const routeD = _pdfCatmull(CITIES.map(c => [c.lon, c.lat]), proj);
  const landD  = _pdfPoly(LAND, proj);
  const saharaD = _pdfPoly(SAHARA, proj);

  return (
    <Svg viewBox={`0 0 ${VW} ${VH}`} width={PAGE_W} height={svgH}>
      <Rect x={0} y={0} width={VW} height={VH} fill="#BDD5E0" />
      <Path d={landD}   fill="#D8CBAA" stroke="#B5A48A" strokeWidth={0.9} />
      <Path d={saharaD} fill="#C8A96A" fillOpacity={0.18} />
      {/* Route depth shadow */}
      <Path d={routeD} fill="none" stroke="#1F3D3A" strokeWidth={3.5} opacity={0.08} />
      {/* Main route */}
      <Path d={routeD} fill="none" stroke="#1B3D39" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {/* City dots */}
      {pts.map((c, i) => {
        const [cx, cy] = c.pt;
        const r = c.tier === 1 ? 8 : 5;
        return <Circle key={`d${i}`} cx={cx} cy={cy} r={r}
          fill={c.tier === 1 ? '#F2E4CB' : '#C8D9D5'}
          stroke={c.tier === 1 ? '#C9A96E' : '#2A5248'}
          strokeWidth={c.tier === 1 ? 2 : 1.5}
        />;
      })}
      {/* Labels — rendered after dots so they appear on top */}
      {pts.map((c, i) => {
        const [cx, cy] = c.pt;
        const r = c.tier === 1 ? 8 : 5;
        const tx = c.dx > 0 ? cx + r + 6 : cx - r - 6;
        const anchor = c.dx > 0 ? 'start' : 'end';
        const fs = c.tier === 1 ? 11 : 9.5;
        return <Text key={`l${i}`} x={tx} y={cy + 4}
          textAnchor={anchor} fontFamily="Helvetica-Bold" fontSize={fs} fill="#1C1A16">
          {c.name}
        </Text>;
      })}
    </Svg>
  );
}

function PhilippinesRouteSvgMap() {
  const VW = 660, VH = 800;
  const X0 = 117.8, X1 = 123.0, Y0 = 9.0, Y1 = 15.5;
  const proj = (ln, lt) => _pdfProj(ln, lt, X0, X1, Y0, Y1, VW, VH);
  // Scale to fit: cap height at 650pt, derive width to maintain aspect
  const svgH = 650;
  const svgW = Math.round(svgH * VW / VH);     // ≈ 537pt

  const ISLANDS = [
    { coords: [[120.0,15.4],[120.5,15.5],[121.2,15.3],[122.0,14.8],[122.5,14.2],[122.0,13.5],[121.2,13.0],[120.5,13.3],[120.0,13.8],[119.8,14.3],[120.0,15.4]], op: 1 },
    { coords: [[119.2,11.4],[119.5,11.45],[119.75,11.1],[119.6,10.6],[119.3,10.0],[119.0,9.4],[118.7,9.0],[118.3,9.0],[118.5,9.5],[118.8,10.2],[119.0,10.8],[119.2,11.4]], op: 1 },
    { coords: [[119.7,12.35],[120.3,12.3],[120.75,12.1],[120.85,11.8],[120.5,11.6],[120.0,11.7],[119.7,11.9],[119.7,12.35]], op: 0.95 },
    { coords: [[121.2,12.5],[122.4,11.8],[122.7,11.1],[122.2,10.5],[121.5,10.7],[121.0,11.5],[121.2,12.5]], op: 0.92 },
    { coords: [[120.7,13.4],[121.5,13.0],[121.5,12.4],[121.0,12.2],[120.3,12.6],[120.3,13.1],[120.7,13.4]], op: 0.95 },
  ];
  const CITIES = [
    { name:'Manila',      lon:120.97, lat:14.60, tier:1, dx: 13 },
    { name:'San Vicente', lon:119.49, lat:10.53, tier:2, dx: 13 },
    { name:'El Nido',     lon:119.41, lat:11.17, tier:1, dx:-12 },
    { name:'Coron',       lon:120.20, lat:11.99, tier:2, dx: 13 },
    { name:'Boracay',     lon:121.93, lat:11.96, tier:1, dx:-12 },
  ];
  const ROUTE_LONLAT = [...CITIES.map(c => [c.lon, c.lat]), [120.97, 14.60]];

  const pts    = CITIES.map(c => ({ ...c, pt: proj(c.lon, c.lat) }));
  const routeD = _pdfCatmull(ROUTE_LONLAT, proj);

  return (
    <Svg viewBox={`0 0 ${VW} ${VH}`} width={svgW} height={svgH}>
      <Rect x={0} y={0} width={VW} height={VH} fill="#C4DAE8" />
      {ISLANDS.map((isl, i) => (
        <Path key={i} d={_pdfPoly(isl.coords, proj)}
          fill="#DDD4BE" stroke="#B0A48A" strokeWidth={0.8} fillOpacity={isl.op} />
      ))}
      <Path d={routeD} fill="none" stroke="#1F3D3A" strokeWidth={3} opacity={0.08} />
      <Path d={routeD} fill="none" stroke="#1B3D39" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((c, i) => (
        <Circle key={`d${i}`} cx={c.pt[0]} cy={c.pt[1]}
          r={c.tier === 1 ? 8 : 5}
          fill={c.tier === 1 ? '#F2E4CB' : '#C8D9D5'}
          stroke={c.tier === 1 ? '#C9A96E' : '#2A5248'}
          strokeWidth={c.tier === 1 ? 2 : 1.5}
        />
      ))}
      {pts.map((c, i) => {
        const [cx, cy] = c.pt;
        const r = c.tier === 1 ? 8 : 5;
        const tx = c.dx > 0 ? cx + r + 6 : cx - r - 6;
        return <Text key={`l${i}`} x={tx} y={cy + 4}
          textAnchor={c.dx > 0 ? 'start' : 'end'}
          fontFamily="Helvetica-Bold" fontSize={c.tier === 1 ? 11 : 9.5} fill="#1C1A16">
          {c.name}
        </Text>;
      })}
    </Svg>
  );
}

// Lookup: itinerary ID → PDF SVG map component + natural dimensions
const PDF_ROUTE_MAPS = {
  'morocco-motorcycle-expedition': { Component: MoroccoRouteSvgMap, svgW: PAGE_W,  svgH: Math.round(PAGE_W * 720 / 800) },
  'philippines-island-journey':    { Component: PhilippinesRouteSvgMap, svgW: Math.round(650 * 660 / 800), svgH: 650 },
};

/** Thin running header shared by all inner pages */
function RunHeader({ country, title }) {
  return (
    <View style={s.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StarMark size={11} color={C.gold} />
        <Text style={s.headerBrand}>HiddenAtlas</Text>
      </View>
      <Text style={s.headerSection}>{country.toUpperCase()} — {title.toUpperCase()}</Text>
    </View>
  );
}

// ── Vertical Expedition Timeline ──────────────────────────────────────────────
//
// For itineraries with ≤10 days: single-column vertical timeline.
// For longer itineraries (11+ days): two-column layout to prevent A4 overflow.
// Each row shows the day number and the real route locations.
// Uses day.route if present; falls back to day.title.

function TimelineColumn({ days }) {
  return (
    <View style={{ flex: 1 }}>
      {days.map((day, i) => (
        <View key={i} style={s.timelineRow}>
          <View style={s.timelineTrack}>
            <View style={s.timelineDot} />
            {i < days.length - 1 ? <View style={s.timelineConnector} /> : null}
          </View>
          <View style={[s.timelineContent, i === days.length - 1 ? { paddingBottom: 0 } : {}]}>
            <Text style={s.timelineDayLabel}>DAY {day.day}</Text>
            <Text style={s.timelineRoute}>{day.route || day.title}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function RouteTimeline({ days }) {
  if (days.length <= 10) {
    return (
      <View style={s.timelineWrap}>
        {days.map((day, i) => (
          <View key={i} style={s.timelineRow}>
            <View style={s.timelineTrack}>
              <View style={s.timelineDot} />
              {i < days.length - 1 ? <View style={s.timelineConnector} /> : null}
            </View>
            <View style={[s.timelineContent, i === days.length - 1 ? { paddingBottom: 0 } : {}]}>
              <Text style={s.timelineDayLabel}>DAY {day.day}</Text>
              <Text style={s.timelineRoute}>{day.route || day.title}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  // Two-column layout for 11+ day itineraries
  const half = Math.ceil(days.length / 2);
  return (
    <View style={[s.timelineWrap, { flexDirection: 'row', gap: 0 }]}>
      <TimelineColumn days={days.slice(0, half)} />
      <View style={{ width: 1, backgroundColor: C.border, marginVertical: 6, marginHorizontal: 16 }} />
      <TimelineColumn days={days.slice(half)} />
    </View>
  );
}

// ── Page components ───────────────────────────────────────────────────────────

function CoverPage({ itinerary }) {
  const { title, subtitle, country, region, duration, nights, groupSize, coverImage, image } = itinerary;
  const durationLabel = nights
    ? `${duration.replace(/\bdays?\b/i, 'Days')} \u2022 ${nights} Nights`
    : duration;
  const hero = imgUrl(coverImage || image, 1600);

  return (
    <Page size="A4">
      {/*
        All children of coverWrapper are position:'absolute', so the wrapper
        View must establish the containing block with position:'relative'.
        Without this, react-pdf renders the image in the normal flow and
        the overlay / text Views are never visible.
      */}
      <View style={s.coverWrapper}>

        {/* 1 — Full-bleed background image */}
        {hero ? <Image src={hero} style={s.coverBg} /> : null}

        {/* 2 — Dark overlay for readability */}
        <View style={s.coverOverlay} />

        {/* 3 — Top brand bar */}
        <View style={s.coverTopBar}>
          <Text style={s.coverBrand}>HIDDENATLAS</Text>
          <Text style={s.coverTagline}>CURATED TRAVEL GUIDE</Text>
        </View>

        {/* 4 — Centred title block */}
        <View style={s.coverCenter}>
          <Text style={s.coverEyebrow}>
            {country.toUpperCase()}{region ? ` · ${region.toUpperCase()}` : ''}
          </Text>
          <Text style={s.coverTitle}>{title}</Text>
          <Text style={s.coverSubtitle}>{subtitle}</Text>
          <View style={s.coverGoldLine} />
        </View>

        {/* 5 — Bottom meta strip */}
        <View style={s.coverBottomStrip}>
          <View style={s.coverMeta}>
            <Text style={s.coverMetaLabel}>DESTINATION</Text>
            <Text style={s.coverMetaValue}>{country}{region ? `, ${region}` : ''}</Text>
          </View>
          {duration ? (
            <>
              <View style={s.coverMetaSep} />
              <View style={[s.coverMeta, { paddingLeft: 24 }]}>
                <Text style={s.coverMetaLabel}>DURATION</Text>
                <Text style={s.coverMetaValue}>{durationLabel}</Text>
              </View>
            </>
          ) : null}
          {groupSize ? (
            <>
              <View style={s.coverMetaSep} />
              <View style={[s.coverMeta, { paddingLeft: 24 }]}>
                <Text style={s.coverMetaLabel}>IDEAL FOR</Text>
                <Text style={s.coverMetaValue}>{groupSize}</Text>
              </View>
            </>
          ) : null}
        </View>

      </View>
    </Page>
  );
}

function RouteMapPage({ itinerary }) {
  const {
    title, country, region, duration, nights,
    days = [], highlights = [],
  } = itinerary;
  const durationLabel = nights
    ? `${duration.replace(/\bdays?\b/i, 'Days')} \u2022 ${nights} Nights`
    : duration;

  return (
    <Page size="A4" style={s.mapPage}>
      <RunHeader country={country} title={title} />

      {/* Banner */}
      <View style={s.mapBanner}>
        <Text style={s.mapBannerEyebrow}>YOUR JOURNEY</Text>
        <Text style={s.mapBannerTitle}>Expedition Route</Text>
        <Text style={s.mapBannerSub}>
          {country}{region ? ` \u00B7 ${region}` : ''}{duration ? `  \u00B7  ${durationLabel}` : ''}
        </Text>
      </View>

      {/* Vertical day-by-day timeline */}
      <RouteTimeline days={days} />

      {/* Key highlights */}
      {highlights.length > 0 ? (
        <View style={s.mapHighlights}>
          <Text style={s.mapHlLabel}>JOURNEY HIGHLIGHTS</Text>
          <View style={s.mapHlGrid}>
            {highlights.slice(0, 6).map((h, i) => (
              <View key={i} style={s.mapHlItem}>
                <View style={s.mapHlDot} />
                <Text style={s.mapHlText}>{h}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function DayPage({ day, index, itinerary }) {
  const { title: itinTitle, country } = itinerary;
  const { title, desc, description, bullets = [], activities = [], stay, imgs = [], tip } = day;
  const body       = desc || description || null;
  const highlights = bullets.length ? bullets : activities;
  const resolvedImgs = imgs.map(imgUrl).filter(Boolean);

  return (
    <Page size="A4" style={s.dayPage}>
      <RunHeader country={country} title={itinTitle} />

      {/* Top banner image(s) — only rendered when images exist */}
      {resolvedImgs.length === 2 ? (
        <View style={{ flexDirection: 'row', width: '100%', height: 205, breakInside: 'avoid' }}>
          <Image src={resolvedImgs[0]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
          <Image src={resolvedImgs[1]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
        </View>
      ) : resolvedImgs.length === 1 ? (
        <Image src={resolvedImgs[0]} style={s.dayImg} />
      ) : null}

      <View style={s.dayBody}>
        {/* DAY N label */}
        <Text style={s.dayChip}>DAY {index + 1}</Text>

        {/* Large serif title */}
        <Text style={s.dayTitle}>{title}</Text>
        <View style={s.dayRule} />

        {/* Paragraph description */}
        {body ? <Text style={s.dayDesc}>{body}</Text> : null}

        {/* Bullet highlights */}
        {highlights.length > 0 ? (
          <View style={s.dayBullets}>
            {highlights.map((h, i) => (
              <View key={i} wrap={false} style={s.dayBulletRow}>
                <View style={s.dayBulletDot} />
                <Text style={s.dayBulletText}>{h}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Insider Tip */}
        {tip ? (
          <View wrap={false} style={s.tipBox}>
            <Text style={s.tipLabel}>INSIDER TIP</Text>
            <Text style={s.tipText}>{tip}</Text>
          </View>
        ) : null}

        {/* Overnight stay (premium itineraries) */}
        {stay ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center', breakInside: 'avoid' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.5, color: C.muted }}>TONIGHT'S STAY:</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal }}>{stay}</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// ── Destination Map page (optional) ───────────────────────────────────────────
//
// Full-bleed editorial feature page for the route map image.
// Only shown when itinerary.mapImage is set (resolved in downloadPDF.js).
// Supports JPG and PNG. SVG is not supported by @react-pdf/renderer's Image.

function DestinationMapPage({ itinerary }) {
  const { title, subtitle, country, mapImage, days = [], duration } = itinerary;
  if (!mapImage || mapImage.endsWith('.svg')) return null;

  // Build deduplicated city stop list from day route fields
  const stops = [];
  const seen = new Set();
  for (const d of days) {
    const city = (d.route || d.title || '').split(/[·–\-]/)[0].trim();
    if (city && !seen.has(city)) { seen.add(city); stops.push(city); }
  }
  const displayStops = stops.slice(0, 10);
  const hasMore = stops.length > 10;

  // Map dominates the page: header(43) + title_strip(68) + map + stops_strip(36) = PAGE_H
  const MAP_H = Math.floor(PAGE_H - 43 - 68 - 36);   // ≈ 695pt

  return (
    <Page size="A4" style={{ backgroundColor: C.stone }}>
      <RunHeader country={country} title={title} />

      {/* Slim two-column editorial header — no dark background */}
      <View style={{
        paddingHorizontal: 48, paddingTop: 16, paddingBottom: 14,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2.5, color: C.teal, marginBottom: 7 }}>
            ROUTE MAP
          </Text>
          <Text style={{ fontFamily: 'Times-Bold', fontSize: 26, color: C.charcoal, lineHeight: 1.1 }}>
            {title}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', paddingBottom: 3 }}>
          {duration ? (
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: C.muted, marginBottom: 6 }}>
              {duration}
            </Text>
          ) : null}
          <View style={{ width: 30, height: 1.5, backgroundColor: C.gold }} />
        </View>
      </View>

      {/* Map — dominant hero element, fills ~82% of the page */}
      <View style={{ width: PAGE_W, height: MAP_H, backgroundColor: C.mapBg }}>
        <Image
          src={mapImage}
          style={{ width: PAGE_W, height: MAP_H, objectFit: 'contain' }}
        />
      </View>

      {/* Compact journey stops strip */}
      {displayStops.length > 0 && (
        <View style={{
          paddingHorizontal: 48, paddingTop: 10, paddingBottom: 10,
          borderTopWidth: 0.5, borderTopColor: C.border,
          flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {displayStops.map((stop, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: C.gold, marginRight: 5 }} />
              <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: C.charcoal, marginRight: 3 }}>{stop}</Text>
              {(i < displayStops.length - 1 || hasMore) && (
                <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: C.border, marginRight: 6 }}>›</Text>
              )}
            </View>
          ))}
          {hasMore && (
            <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: C.muted, fontStyle: 'italic' }}>
              +{stops.length - 10} more
            </Text>
          )}
        </View>
      )}

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// ── Destination SVG Map page (PDF-native, no external asset required) ─────────
//
// Used for itineraries in PDF_ROUTE_MAPS that do not have a static PNG.
// Renders the route map using @react-pdf/renderer SVG primitives.

function DestinationSvgMapPage({ itinerary }) {
  const { title, country, mapImage, days = [], duration } = itinerary;
  const entry = PDF_ROUTE_MAPS[itinerary.id];
  // Skip if a PNG map exists (DestinationMapPage handles that case)
  // or if no SVG map is defined
  if (mapImage || !entry) return null;

  const { Component, svgW, svgH } = entry;

  // Build deduplicated stops
  const stops = [];
  const seen = new Set();
  for (const d of days) {
    const city = (d.route || d.title || '').split(/[·–\-]/)[0].trim();
    if (city && !seen.has(city)) { seen.add(city); stops.push(city); }
  }
  const displayStops = stops.slice(0, 10);
  const hasMore = stops.length > 10;

  return (
    <Page size="A4" style={{ backgroundColor: C.stone }}>
      <RunHeader country={country} title={title} />

      {/* Slim two-column editorial header */}
      <View style={{
        paddingHorizontal: 48, paddingTop: 16, paddingBottom: 14,
        flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
        borderBottomWidth: 1, borderBottomColor: C.border,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2.5, color: C.teal, marginBottom: 7 }}>
            ROUTE MAP
          </Text>
          <Text style={{ fontFamily: 'Times-Bold', fontSize: 26, color: C.charcoal, lineHeight: 1.1 }}>
            {title}
          </Text>
        </View>
        {duration ? (
          <View style={{ alignItems: 'flex-end', paddingBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: C.muted, marginBottom: 6 }}>
              {duration}
            </Text>
            <View style={{ width: 30, height: 1.5, backgroundColor: C.gold }} />
          </View>
        ) : null}
      </View>

      {/* SVG map — centered horizontally */}
      <View style={{ alignItems: 'center', backgroundColor: C.stone }}>
        <Component />
      </View>

      {/* Compact stops strip */}
      {displayStops.length > 0 && (
        <View style={{
          paddingHorizontal: 48, paddingTop: 10, paddingBottom: 10,
          borderTopWidth: 0.5, borderTopColor: C.border,
          flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        }}>
          {displayStops.map((stop, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: C.gold, marginRight: 5 }} />
              <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: C.charcoal, marginRight: 3 }}>{stop}</Text>
              {(i < displayStops.length - 1 || hasMore) && (
                <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: C.border, marginRight: 6 }}>›</Text>
              )}
            </View>
          ))}
          {hasMore && (
            <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: C.muted, fontStyle: 'italic' }}>
              +{stops.length - 10} more
            </Text>
          )}
        </View>
      )}

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// ── Transport page ─────────────────────────────────────────────────────────────

function TransportPage({ itinerary }) {
  const { title: itinTitle, country, transport } = itinerary;
  if (!transport) return null;

  const modeColor = (mode) => mode === 'train' ? C.teal : mode === 'bus' ? '#7B5F3A' : '#4A3A7A';

  return (
    <Page size="A4" style={s.transportPage}>
      <RunHeader country={country} title={itinTitle} />

      <View style={s.transportBody}>
        <Text style={s.transportSectionTitle}>Transport Between Cities</Text>

        {/* Luggage tip */}
        <View style={s.transportLuggageTip}>
          <Text style={s.transportTipLabel}>Insider Tip: Luggage Forwarding</Text>
          <Text style={s.transportTipText}>{transport.luggageTip}</Text>
        </View>

        {/* Routes */}
        {transport.routes.map((route, i) => (
          <View key={i} wrap={false} style={i === transport.routes.length - 1 ? s.transportRowLast : s.transportRow}>
            <View style={[s.transportModeDot, { backgroundColor: modeColor(route.mode) }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.transportSegment}>{route.segment}</Text>
              <Text style={s.transportService}>{route.service}</Text>
              <Text style={s.transportDuration}>{route.duration}</Text>
              {route.notes.map((note, ni) => (
                <Text key={ni} style={s.transportNote}>{note}</Text>
              ))}
            </View>
          </View>
        ))}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function CTAPage({ itinerary }) {
  const { title, country, isPremium, price, currency } = itinerary;

  const bullets = [
    'Refined route planning and pacing',
    'Carefully selected areas to stay',
    'Logistics guidance for a smooth journey',
    'Insider tips from on-the-ground research',
  ];

  return (
    <Page size="A4" style={s.ctaPage}>
      <View style={s.ctaWrapper}>

        {/* Logo mark + wordmark */}
        <View style={s.ctaLogoRow}>
          <StarMark size={18} color={C.gold} />
          <View style={{ width: 10 }} />
          <Text style={s.ctaLogoHidden}>HIDDEN</Text>
          <Text style={s.ctaLogoAtlas}>ATLAS</Text>
        </View>

        <Text style={s.ctaTitle}>Ready to make{'\n'}this trip yours?</Text>
        <View style={s.ctaGoldRule} />

        <Text style={s.ctaLead}>
          This guide gives you the structure and route.{'\n'}Our planners can build the personalised version around your dates, travel style and pace.
        </Text>

        {/* Bullet list */}
        <View style={s.ctaBullets}>
          {bullets.map((b, i) => (
            <View key={i} style={s.ctaBulletRow}>
              <View style={s.ctaBulletDot} />
              <Text style={s.ctaBulletText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* CTA button */}
        <View style={s.ctaButton}>
          <Text style={s.ctaButtonLabel}>START PLANNING YOUR TRIP</Text>
          <Text style={s.ctaButtonUrl}>hiddenatlas.travel/custom</Text>
        </View>

        <Text style={s.ctaFootnote}>
          {title} · {country}{isPremium ? ` · Premium Guide · ${currency ?? 'EUR'}${price ?? ''}` : ' · Free Itinerary'}{'\n'}
          © HiddenAtlas · hiddenatlas.travel
        </Text>
      </View>
    </Page>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function ItineraryPDF({ itinerary }) {
  const { days = [] } = itinerary;

  return (
    <Document
      title={`${itinerary.title} – ${itinerary.isPremium ? 'Premium Guide' : 'Free Itinerary'}`}
      author="HiddenAtlas"
      subject={`${itinerary.title} – Curated Travel Guide`}
      keywords="travel, itinerary, luxury, HiddenAtlas"
      hyphenationCallback={word => [word]}
    >
      {/* Page 1 – Cover */}
      <CoverPage itinerary={itinerary} />

      {/* Page 2 – Expedition Route + Highlights */}
      <RouteMapPage itinerary={itinerary} />

      {/* Page 3 (optional) – Destination route map: PNG asset or PDF-native SVG */}
      {itinerary.mapImage
        ? <DestinationMapPage itinerary={itinerary} />
        : <DestinationSvgMapPage itinerary={itinerary} />
      }

      {/* Pages 3/4…N – Day by day */}
      {days.map((day, i) => (
        <DayPage key={i} day={day} index={i} itinerary={itinerary} />
      ))}

      {/* Transport Between Cities (optional) – after route, before CTA */}
      {itinerary.transport && <TransportPage itinerary={itinerary} />}

      {/* Final page – CTA */}
      <CTAPage itinerary={itinerary} />
    </Document>
  );
}
