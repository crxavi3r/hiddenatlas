// @react-pdf/renderer — built-in PDF fonts only (TTF/OTF required; WOFF unsupported by fontkit)
//   Times-Roman / Times-Bold  → headings (elegant serif)
//   Helvetica / Helvetica-Bold → body (clean sans-serif)

import {
  Document, Page, Text, View, Image, StyleSheet,
  Svg, Polygon,
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

  // ── Transport page ─────────────────────────────────────────────────────────
  transportPage: {
    backgroundColor: C.white,
  },
  transportBody: {
    paddingHorizontal: 48,
    paddingTop: 28,
    paddingBottom: 32,
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

  return (
    <Page size="A4" style={s.mapPage}>
      <RunHeader country={country} title={title} />

      {/* Banner */}
      <View style={s.mapBanner}>
        <Text style={s.mapBannerEyebrow}>YOUR JOURNEY</Text>
        <Text style={s.mapBannerTitle}>Expedition Route</Text>
        <Text style={s.mapBannerSub}>
          {country}{region ? ` \u00B7 ${region}` : ''}{duration ? `  \u00B7  ${duration}` : ''}
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

      {/* Top banner image(s) */}
      {resolvedImgs.length === 2 ? (
        <View style={{ flexDirection: 'row', width: '100%', height: 205, breakInside: 'avoid' }}>
          <Image src={resolvedImgs[0]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
          <Image src={resolvedImgs[1]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
        </View>
      ) : resolvedImgs.length === 1 ? (
        <Image src={resolvedImgs[0]} style={s.dayImg} />
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

// ── Destination Map page (optional) ───────────────────────────────────────────
//
// Full-bleed editorial feature page for the route map image.
// Only shown when itinerary.mapImage is set (resolved in downloadPDF.js).
// Supports JPG and PNG. SVG is not supported by @react-pdf/renderer's Image.

function DestinationMapPage({ itinerary }) {
  const { title, subtitle, country, mapImage, days = [] } = itinerary;
  if (!mapImage || mapImage.endsWith('.svg')) return null;

  // Build deduplicated city stop list from day route fields
  const stops = [];
  const seen = new Set();
  for (const d of days) {
    const city = (d.route || d.title || '').split(/[·–\-]/)[0].trim();
    if (city && !seen.has(city)) { seen.add(city); stops.push(city); }
  }

  // Map image container: use near-full page width for maximum visual impact.
  // Height of 390pt accommodates most landscape maps while leaving room for
  // the header banner and city stops strip.
  const MAP_H = 390;

  return (
    <Page size="A4" style={{ backgroundColor: C.stone }}>
      <RunHeader country={country} title={title} />

      {/* Editorial header banner */}
      <View style={{ backgroundColor: C.tealMid, paddingHorizontal: 48, paddingTop: 24, paddingBottom: 22 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: 'rgba(255,255,255,0.45)', marginBottom: 7 }}>
          THE ROUTE
        </Text>
        <Text style={{ fontFamily: 'Times-Bold', fontSize: 24, color: C.white, lineHeight: 1.2, marginBottom: 5 }}>
          {title}
        </Text>
        <Text style={{ fontFamily: 'Helvetica', fontSize: 9.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          {subtitle}
        </Text>
      </View>

      {/* Map image — near full-width for maximum impact */}
      <View style={{ width: PAGE_W, height: MAP_H, backgroundColor: C.mapBg }}>
        <Image
          src={mapImage}
          style={{ width: PAGE_W, height: MAP_H, objectFit: 'contain' }}
        />
      </View>

      {/* Gold rule */}
      <View style={{ height: 2, backgroundColor: C.gold, marginHorizontal: 48, marginTop: 18, marginBottom: 16 }} />

      {/* Journey stops strip */}
      {stops.length > 0 && (
        <View style={{ paddingHorizontal: 48, paddingBottom: 20 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 12 }}>
            JOURNEY STOPS
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            {stops.map((stop, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold, marginRight: 5 }} />
                <Text style={{ fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, marginRight: 4 }}>{stop}</Text>
                {i < stops.length - 1 && (
                  <Text style={{ fontFamily: 'Helvetica', fontSize: 10, color: C.muted, marginRight: 8 }}>›</Text>
                )}
              </View>
            ))}
          </View>
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
          <View key={i} style={i === transport.routes.length - 1 ? s.transportRowLast : s.transportRow}>
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

      {/* Page 3 (optional) – Destination route map image */}
      {itinerary.mapImage && <DestinationMapPage itinerary={itinerary} />}

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
