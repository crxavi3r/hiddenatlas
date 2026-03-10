// @react-pdf/renderer — built-in PDF fonts only (TTF/OTF required; WOFF unsupported by fontkit)
//   Times-Roman / Times-Bold  → headings (elegant serif)
//   Helvetica / Helvetica-Bold → body (clean sans-serif)

import {
  Document, Page, Text, View, Image, StyleSheet,
  Svg, Rect, Circle, Line, Polygon,
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
  mapSvgWrap: {
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 8,
  },
  // Highlights below the map
  mapHighlights: {
    paddingHorizontal: 48,
    paddingTop: 16,
    paddingBottom: 24,
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

  // ── Day pages ──────────────────────────────────────────────────────────────
  dayPage: {
    backgroundColor: C.white,
  },
  dayImg: {
    width: '100%',
    height: 205,
    objectFit: 'cover',
    objectPosition: 'center',
  },
  dayImgPlaceholder: {
    width: '100%',
    height: 205,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
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
    flex: 1,
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
  },
  dayBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 5,
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
  const base = src.startsWith('http')
    ? src.replace(/\?.*/, '')
    : `https://images.unsplash.com/photo-${src}`;
  return `${base}?w=${w}&q=85`;
}

/** Extract the primary place name from a day title (text before ' — ') */
function placeName(title) {
  return title.split(' — ')[0].trim();
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

// ── SVG Route Map ─────────────────────────────────────────────────────────────
//
// Builds a schematic numbered-stop diagram using react-pdf SVG primitives.
// Stops are arranged in horizontal rows of up to 5; odd rows run right-to-left
// (zigzag), creating a clean S-curve route for long itineraries.

function RouteMapSvg({ stops }) {
  const W       = 515;    // SVG canvas width (matches paddingHorizontal:40 on page)
  const MX      = 38;     // left/right margin inside SVG
  const CR      = 13;     // circle radius
  const ROW_H   = 88;     // vertical distance between rows
  const PER_ROW = stops.length <= 5 ? stops.length : 5;
  const ROWS    = Math.ceil(stops.length / PER_ROW);
  const H       = ROWS * ROW_H + 28;
  const CW      = W - MX * 2;   // usable width

  // Compute x,y for every stop
  const pts = stops.map((name, i) => {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    const inRow = Math.min(PER_ROW, stops.length - row * PER_ROW);
    const step  = inRow > 1 ? CW / (inRow - 1) : 0;
    const adjCol = (row % 2 === 1) ? (inRow - 1 - col) : col;
    return {
      name: name.length > 14 ? name.slice(0, 13) + '\u2026' : name,
      x: MX + adjCol * step,
      y: 18 + row * ROW_H + CR,
    };
  });

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>

      {/* ── Background ───────────────────────────────────────────── */}
      <Rect x={0} y={0} width={W} height={H} fill={C.mapBg} rx={6} />

      {/* Subtle horizontal grid lines */}
      {[0.2, 0.45, 0.7, 0.95].map((t, i) => (
        <Line
          key={`g${i}`}
          x1={16} y1={H * t}
          x2={W - 16} y2={H * t}
          stroke="#D8EAE8"
          strokeWidth={0.6}
        />
      ))}

      {/* ── Route connecting lines (gold dashes, drawn before circles) ── */}
      {pts.map((pt, i) => {
        if (i === 0) return null;
        const prev = pts[i - 1];
        return (
          <Line
            key={`l${i}`}
            x1={prev.x} y1={prev.y}
            x2={pt.x}   y2={pt.y}
            stroke={C.gold}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        );
      })}

      {/* ── Stop markers ─────────────────────────────────────────── */}
      {pts.map((pt, i) => (
        // White halo → teal circle → number (drawn as flat sibling elements)
        [
          <Circle key={`h${i}`}  cx={pt.x} cy={pt.y} r={CR + 2.5} fill={C.white} />,
          <Circle key={`c${i}`}  cx={pt.x} cy={pt.y} r={CR}       fill={C.teal}  />,

          // Day number inside circle
          <Text
            key={`n${i}`}
            x={pt.x} y={pt.y + 4}
            textAnchor="middle"
            fill={C.white}
            fontSize={8.5}
            fontFamily="Helvetica-Bold"
          >
            {String(i + 1)}
          </Text>,

          // Place-name label below circle
          <Text
            key={`lb${i}`}
            x={pt.x} y={pt.y + CR + 16}
            textAnchor="middle"
            fill={C.charcoal}
            fontSize={8.5}
            fontFamily="Helvetica"
          >
            {pt.name}
          </Text>,
        ]
      ))}
    </Svg>
  );
}

// ── Page components ───────────────────────────────────────────────────────────

function CoverPage({ itinerary }) {
  const { title, subtitle, country, region, duration, groupSize, coverImage, image } = itinerary;
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
                <Text style={s.coverMetaValue}>{duration}</Text>
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
    title, country, region, duration,
    days = [], highlights = [],
  } = itinerary;

  const stops = days.map(d => placeName(d.title));

  return (
    <Page size="A4" style={s.mapPage}>
      <RunHeader country={country} title={title} />

      {/* Banner */}
      <View style={s.mapBanner}>
        <Text style={s.mapBannerEyebrow}>YOUR JOURNEY</Text>
        <Text style={s.mapBannerTitle}>Route Map</Text>
        <Text style={s.mapBannerSub}>
          {country}{region ? ` · ${region}` : ''}{duration ? `  ·  ${duration}` : ''}
        </Text>
      </View>

      {/* Visual route diagram */}
      <View style={s.mapSvgWrap}>
        <RouteMapSvg stops={stops} />
      </View>

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
  const { title, desc, description, bullets = [], activities = [], stay, img, tip } = day;
  const body       = desc || description || null;
  const highlights = bullets.length ? bullets : activities;
  const hero       = imgUrl(img);

  return (
    <Page size="A4" style={s.dayPage}>
      <RunHeader country={country} title={itinTitle} />

      {/* Top banner image */}
      {hero ? (
        <Image src={hero} style={s.dayImg} />
      ) : (
        <View style={s.dayImgPlaceholder}>
          <Text style={s.dayPlaceholderText}>{country.toUpperCase()}</Text>
        </View>
      )}

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
              <View key={i} style={s.dayBulletRow}>
                <View style={s.dayBulletDot} />
                <Text style={s.dayBulletText}>{h}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Insider Tip */}
        {tip ? (
          <View style={s.tipBox}>
            <Text style={s.tipLabel}>INSIDER TIP</Text>
            <Text style={s.tipText}>{tip}</Text>
          </View>
        ) : null}

        {/* Overnight stay (premium itineraries) */}
        {stay ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.5, color: C.muted }}>TONIGHT'S STAY:</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal }}>{stay}</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function CTAPage({ itinerary }) {
  const { title, country } = itinerary;

  const bullets = [
    'Handpicked boutique hotels, personally vetted and never generic',
    'Restaurant reservations at the places locals actually eat',
    'Private guides & exclusive experiences off the tourist trail',
    'Seamless logistics and real-time support throughout your trip',
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
          This guide gives you the framework. Our travel planners build the personalised version:
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
          {title} · {country} · Free Itinerary{'\n'}
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
      title={`${itinerary.title} – Free Itinerary`}
      author="HiddenAtlas"
      subject={`${itinerary.title} – Curated Travel Guide`}
      keywords="travel, itinerary, luxury, HiddenAtlas"
    >
      {/* Page 1 – Cover */}
      <CoverPage itinerary={itinerary} />

      {/* Page 2 – Route Map + Highlights */}
      <RouteMapPage itinerary={itinerary} />

      {/* Pages 3…N – Day by day */}
      {days.map((day, i) => (
        <DayPage key={i} day={day} index={i} itinerary={itinerary} />
      ))}

      {/* Final page – CTA */}
      <CTAPage itinerary={itinerary} />
    </Document>
  );
}
