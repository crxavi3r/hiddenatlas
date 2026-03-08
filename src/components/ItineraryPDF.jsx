// @react-pdf/renderer — built-in PDF fonts only (TTF/OTF required; WOFF unsupported by fontkit)
//   Times-Roman / Times-Bold  → headings
//   Helvetica / Helvetica-Bold → body

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

// ── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  teal:    '#1B6B65',
  tealDim: '#164F4A',
  gold:    '#C9A96E',
  cream:   '#F4F1EC',
  stone:   '#FAFAF8',
  charcoal:'#1C1A16',
  muted:   '#6B6156',
  border:  '#E8E3DA',
  light:   '#EFF6F5',
  white:   '#FFFFFF',
  darkBg:  '#0D1410',
  overlay: 'rgba(13,20,16,0.62)',
};

// A4 dimensions in points
const PAGE_W = 595.28;
const PAGE_H = 841.89;

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverPage: {
    backgroundColor: C.darkBg,
    width: PAGE_W,
    height: PAGE_H,
  },
  coverBgImage: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    objectFit: 'cover',
  },
  coverGradient: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    backgroundColor: C.overlay,
  },
  // Top brand bar
  coverTopBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 52,
    paddingTop: 36,
    paddingBottom: 20,
  },
  coverTopBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 2.5,
    color: C.gold,
  },
  coverTopLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.45)',
  },
  // Center hero text
  coverCenter: {
    position: 'absolute',
    top: 0, left: 0,
    width: PAGE_W,
    height: PAGE_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 52,
  },
  coverEyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 3,
    color: C.gold,
    marginBottom: 20,
    textAlign: 'center',
  },
  coverTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 56,
    color: C.white,
    lineHeight: 1.1,
    marginBottom: 12,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontFamily: 'Helvetica',
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 1.5,
    marginBottom: 36,
  },
  coverDivider: {
    width: 48,
    height: 2,
    backgroundColor: C.gold,
    marginBottom: 32,
  },
  // Bottom meta strip
  coverBottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 52,
    paddingVertical: 24,
  },
  coverMetaItem: {
    flex: 1,
  },
  coverMetaSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.4,
  },

  // ── Running header (all inner pages) ───────────────────────────────────────
  runHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  runHeaderBrand: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
    color: C.teal,
    letterSpacing: 0.5,
  },
  runHeaderSection: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.muted,
  },

  // ── Info / Overview page ───────────────────────────────────────────────────
  infoPage: {
    backgroundColor: C.stone,
  },
  infoBody: {
    padding: '0 48px 36px',
    flex: 1,
  },
  // Hero banner on overview page (teal strip)
  infoBanner: {
    backgroundColor: C.teal,
    paddingHorizontal: 48,
    paddingTop: 32,
    paddingBottom: 32,
    marginBottom: 32,
  },
  infoEyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 10,
  },
  infoTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 32,
    color: C.white,
    lineHeight: 1.15,
    marginBottom: 6,
  },
  infoSubtitle: {
    fontFamily: 'Helvetica',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 24,
    lineHeight: 1.4,
  },
  // Meta row inside banner
  infoMetaRow: {
    flexDirection: 'row',
    gap: 0,
  },
  infoMetaBlock: {
    marginRight: 32,
  },
  infoMetaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 1.5,
    color: C.gold,
    marginBottom: 3,
  },
  infoMetaValue: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
  },

  // Section label
  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.teal,
    marginBottom: 10,
  },
  sectionDivider: {
    width: 28,
    height: 2,
    backgroundColor: C.gold,
    marginBottom: 16,
  },

  // Description paragraph
  descText: {
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    color: C.muted,
    lineHeight: 1.8,
    marginBottom: 28,
  },

  // Highlights list
  highlightsList: {
    marginBottom: 28,
    gap: 8,
  },
  highlightItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  highlightDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gold,
    marginTop: 4,
    flexShrink: 0,
  },
  highlightText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.charcoal,
    lineHeight: 1.6,
    flex: 1,
  },

  // Route box
  routeBox: {
    backgroundColor: C.white,
    borderRadius: 5,
    borderLeftWidth: 3,
    borderLeftColor: C.teal,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 24,
  },
  routeLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 2,
    color: C.teal,
    marginBottom: 8,
  },
  routeText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.7,
  },

  // Included grid
  includedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  includedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '50%',
    marginBottom: 7,
    paddingRight: 8,
  },
  includedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.gold,
    flexShrink: 0,
  },
  includedText: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.charcoal,
    flex: 1,
    lineHeight: 1.5,
  },

  // ── Route Map page ─────────────────────────────────────────────────────────
  routeMapPage: {
    backgroundColor: C.stone,
  },
  routeMapBanner: {
    backgroundColor: C.tealDim,
    paddingHorizontal: 48,
    paddingTop: 28,
    paddingBottom: 28,
    marginBottom: 36,
  },
  routeMapEyebrow: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2.5,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8,
  },
  routeMapTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 28,
    color: C.white,
    lineHeight: 1.2,
  },
  routeMapBody: {
    paddingHorizontal: 48,
    flex: 1,
  },
  // Two-column container for > 6 stops
  stopsColumns: {
    flexDirection: 'row',
    gap: 32,
  },
  stopsColumn: {
    flex: 1,
  },
  // Single stop row
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 0,
  },
  stopLeft: {
    width: 32,
    alignItems: 'center',
  },
  stopCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: C.white,
  },
  stopConnector: {
    width: 1.5,
    height: 16,
    backgroundColor: C.border,
    marginTop: 0,
  },
  stopRight: {
    flex: 1,
    paddingTop: 4,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  stopName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    color: C.charcoal,
    lineHeight: 1.3,
  },
  stopDay: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: C.muted,
    marginTop: 2,
  },

  // ── Day pages ──────────────────────────────────────────────────────────────
  dayPage: {
    backgroundColor: C.white,
  },
  dayImageStrip: {
    width: '100%',
    height: 200,
    objectFit: 'cover',
    objectPosition: 'center',
  },
  dayImagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPlaceholderText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: C.border,
    letterSpacing: 3,
  },
  dayBody: {
    padding: '20px 48px 24px',
    flex: 1,
  },
  dayChip: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    letterSpacing: 2.5,
    color: C.gold,
    marginBottom: 8,
  },
  dayTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 20,
    color: C.charcoal,
    lineHeight: 1.25,
    marginBottom: 4,
  },
  dayDivider: {
    width: 24,
    height: 1.5,
    backgroundColor: C.gold,
    marginTop: 12,
    marginBottom: 14,
  },
  dayDesc: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.75,
    marginBottom: 14,
  },
  dayBullets: {
    gap: 6,
    marginBottom: 16,
  },
  dayBulletRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginBottom: 4,
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
    lineHeight: 1.6,
    flex: 1,
  },

  // Insider Tip box
  tipBox: {
    backgroundColor: C.light,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 4,
  },
  tipLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 2,
    color: C.gold,
    marginBottom: 6,
  },
  tipText: {
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.charcoal,
    lineHeight: 1.65,
  },

  // ── CTA page ───────────────────────────────────────────────────────────────
  ctaPage: {
    backgroundColor: C.teal,
    padding: '0 0 0 0',
  },
  ctaContent: {
    flex: 1,
    padding: '72px 60px 60px',
    justifyContent: 'center',
  },
  ctaBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 20,
  },
  ctaTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 38,
    color: C.white,
    lineHeight: 1.2,
    marginBottom: 8,
  },
  ctaDivider: {
    width: 44,
    height: 2,
    backgroundColor: C.gold,
    marginTop: 20,
    marginBottom: 24,
  },
  ctaBody: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 1.8,
    marginBottom: 28,
    maxWidth: 420,
  },
  // CTA bullet list
  ctaBulletList: {
    marginBottom: 36,
    gap: 0,
  },
  ctaBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
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
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.5,
    flex: 1,
  },
  // CTA button block
  ctaButton: {
    backgroundColor: C.gold,
    borderRadius: 4,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'flex-start',
    marginBottom: 40,
  },
  ctaButtonLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: C.white,
    marginBottom: 2,
  },
  ctaButtonUrl: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
  },
  ctaFooter: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
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

/** Normalise image URL — strip query string and re-append w/q params */
function imgUrl(src, w = 1000) {
  if (!src) return null;
  const base = src.startsWith('http')
    ? src.replace(/\?.*/, '')
    : `https://images.unsplash.com/photo-${src}`;
  return `${base}?w=${w}&q=80`;
}

/** Extract primary location name from a day title (text before ' — ') */
function stopName(title) {
  return title.split(' — ')[0].trim();
}

/** Running header shared by all inner pages */
function RunHeader({ country, title }) {
  return (
    <View style={s.runHeader}>
      <Text style={s.runHeaderBrand}>HiddenAtlas</Text>
      <Text style={s.runHeaderSection}>{country.toUpperCase()} — {title.toUpperCase()}</Text>
    </View>
  );
}

// ── Page components ───────────────────────────────────────────────────────────

function CoverPage({ itinerary }) {
  const { title, subtitle, country, region, duration, groupSize, coverImage, image } = itinerary;
  const hero = imgUrl(coverImage || image, 1400);

  return (
    <Page size="A4" style={s.coverPage}>
      {/* Full-bleed background image */}
      {hero ? <Image src={hero} style={s.coverBgImage} /> : null}

      {/* Dark overlay */}
      <View style={s.coverGradient} />

      {/* Top brand bar */}
      <View style={s.coverTopBar}>
        <Text style={s.coverTopBrand}>HIDDENATLAS</Text>
        <Text style={s.coverTopLabel}>CURATED TRAVEL GUIDE</Text>
      </View>

      {/* Centre hero text */}
      <View style={s.coverCenter}>
        <Text style={s.coverEyebrow}>{country.toUpperCase()}{region ? ` · ${region.toUpperCase()}` : ''}</Text>
        <Text style={s.coverTitle}>{title}</Text>
        <Text style={s.coverSubtitle}>{subtitle}</Text>
        <View style={s.coverDivider} />
      </View>

      {/* Bottom meta strip */}
      <View style={s.coverBottomBar}>
        <View style={s.coverMetaItem}>
          <Text style={s.coverMetaLabel}>DESTINATION</Text>
          <Text style={s.coverMetaValue}>{country}{region ? `, ${region}` : ''}</Text>
        </View>
        <View style={s.coverMetaSep} />
        {duration ? (
          <View style={[s.coverMetaItem, { paddingLeft: 28 }]}>
            <Text style={s.coverMetaLabel}>DURATION</Text>
            <Text style={s.coverMetaValue}>{duration}</Text>
          </View>
        ) : null}
        {groupSize ? (
          <View style={[s.coverMetaItem, { paddingLeft: 28 }]}>
            <Text style={s.coverMetaLabel}>IDEAL FOR</Text>
            <Text style={s.coverMetaValue}>{groupSize}</Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

function OverviewPage({ itinerary }) {
  const {
    title, subtitle, country, region, description,
    highlights = [], routeOverview, included = [],
    duration, difficulty, bestFor = [],
  } = itinerary;

  return (
    <Page size="A4" style={s.infoPage}>
      <RunHeader country={country} title={title} />

      {/* Teal info banner */}
      <View style={s.infoBanner}>
        <Text style={s.infoEyebrow}>TRIP OVERVIEW</Text>
        <Text style={s.infoTitle}>{title}</Text>
        {subtitle ? <Text style={s.infoSubtitle}>{subtitle}</Text> : null}
        <View style={s.infoMetaRow}>
          <View style={s.infoMetaBlock}>
            <Text style={s.infoMetaLabel}>DESTINATION</Text>
            <Text style={s.infoMetaValue}>{country}{region ? `, ${region}` : ''}</Text>
          </View>
          {duration ? (
            <View style={s.infoMetaBlock}>
              <Text style={s.infoMetaLabel}>DURATION</Text>
              <Text style={s.infoMetaValue}>{duration}</Text>
            </View>
          ) : null}
          {difficulty ? (
            <View style={s.infoMetaBlock}>
              <Text style={s.infoMetaLabel}>PACE</Text>
              <Text style={s.infoMetaValue}>{difficulty}</Text>
            </View>
          ) : null}
          {bestFor.length > 0 ? (
            <View style={s.infoMetaBlock}>
              <Text style={s.infoMetaLabel}>BEST FOR</Text>
              <Text style={s.infoMetaValue}>{bestFor.join(', ')}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={s.infoBody}>
        {/* Description */}
        {description ? (
          <>
            <View style={s.sectionDivider} />
            <Text style={s.descText}>{description}</Text>
          </>
        ) : null}

        {/* Highlights */}
        {highlights.length > 0 ? (
          <>
            <Text style={s.sectionLabel}>HIGHLIGHTS</Text>
            <View style={s.highlightsList}>
              {highlights.map((h, i) => (
                <View key={i} style={s.highlightItem}>
                  <View style={s.highlightDot} />
                  <Text style={s.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Route */}
        {routeOverview ? (
          <View style={s.routeBox}>
            <Text style={s.routeLabel}>ROUTE OVERVIEW</Text>
            <Text style={s.routeText}>{routeOverview}</Text>
          </View>
        ) : null}

        {/* Included */}
        {included.length > 0 ? (
          <>
            <Text style={[s.sectionLabel, { marginTop: 4 }]}>WHAT'S INCLUDED</Text>
            <View style={s.includedGrid}>
              {included.map((item, i) => (
                <View key={i} style={s.includedItem}>
                  <View style={s.includedDot} />
                  <Text style={s.includedText}>{item}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function RouteMapPage({ itinerary }) {
  const { title, country, days = [] } = itinerary;
  const stops = days.map((d) => stopName(d.title));
  const isTwoCol = stops.length > 6;

  const half = Math.ceil(stops.length / 2);
  const col1 = isTwoCol ? stops.slice(0, half) : stops;
  const col2 = isTwoCol ? stops.slice(half) : [];

  function StopList({ items, startIndex = 0 }) {
    return (
      <View style={isTwoCol ? s.stopsColumn : { flex: 1 }}>
        {items.map((name, i) => {
          const n = startIndex + i;
          const isLast = n === stops.length - 1;
          return (
            <View key={n}>
              <View style={s.stopRow}>
                <View style={s.stopLeft}>
                  <View style={s.stopCircle}>
                    <Text style={s.stopNumber}>{n + 1}</Text>
                  </View>
                </View>
                <View style={s.stopRight}>
                  <Text style={s.stopName}>{name}</Text>
                  <Text style={s.stopDay}>Day {n + 1}</Text>
                </View>
              </View>
              {!isLast && (
                <View style={s.stopRow}>
                  <View style={s.stopLeft}>
                    <View style={s.stopConnector} />
                  </View>
                  <View style={{ flex: 1 }} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <Page size="A4" style={s.routeMapPage}>
      <RunHeader country={country} title={title} />

      {/* Dark teal banner */}
      <View style={s.routeMapBanner}>
        <Text style={s.routeMapEyebrow}>YOUR JOURNEY</Text>
        <Text style={s.routeMapTitle}>Route Map</Text>
      </View>

      <View style={s.routeMapBody}>
        {isTwoCol ? (
          <View style={s.stopsColumns}>
            <StopList items={col1} startIndex={0} />
            <StopList items={col2} startIndex={half} />
          </View>
        ) : (
          <StopList items={col1} startIndex={0} />
        )}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function DayPage({ day, index, itinerary }) {
  const { title: itinTitle, country } = itinerary;
  const { title, desc, description, bullets = [], activities = [], stay, img, tip } = day;
  const dayDesc = desc || description || null;
  const dayActivities = bullets.length ? bullets : activities;
  const hero = imgUrl(img);

  return (
    <Page size="A4" style={s.dayPage}>
      <RunHeader country={country} title={itinTitle} />

      {/* Banner image */}
      {hero ? (
        <Image src={hero} style={s.dayImageStrip} />
      ) : (
        <View style={s.dayImagePlaceholder}>
          <Text style={s.dayPlaceholderText}>{country.toUpperCase()}</Text>
        </View>
      )}

      <View style={s.dayBody}>
        <Text style={s.dayChip}>DAY {index + 1}</Text>
        <Text style={s.dayTitle}>{title}</Text>
        <View style={s.dayDivider} />

        {dayDesc ? <Text style={s.dayDesc}>{dayDesc}</Text> : null}

        {dayActivities.length > 0 ? (
          <View style={s.dayBullets}>
            {dayActivities.map((act, i) => (
              <View key={i} style={s.dayBulletRow}>
                <View style={s.dayBulletDot} />
                <Text style={s.dayBulletText}>{act}</Text>
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
  const { title } = itinerary;
  const bullets = [
    'Handpicked boutique hotels — personally vetted, never generic',
    'Restaurant reservations at the places locals actually eat',
    'Private guides & exclusive experiences off the tourist trail',
    'Seamless logistics and real-time support throughout your trip',
  ];
  return (
    <Page size="A4" style={s.ctaPage}>
      <View style={s.ctaContent}>
        <Text style={s.ctaBrand}>HIDDENATLAS · CURATED TRAVEL</Text>
        <Text style={s.ctaTitle}>Ready to make{'\n'}this trip yours?</Text>
        <View style={s.ctaDivider} />
        <Text style={s.ctaBody}>
          This itinerary gives you the framework. Our expert planners build the personalised version:
        </Text>

        {/* Bullet list */}
        <View style={s.ctaBulletList}>
          {bullets.map((b, i) => (
            <View key={i} style={s.ctaBulletRow}>
              <View style={s.ctaBulletDot} />
              <Text style={s.ctaBulletText}>{b}</Text>
            </View>
          ))}
        </View>

        {/* CTA button block */}
        <View style={s.ctaButton}>
          <Text style={s.ctaButtonLabel}>PLAN YOUR TRIP</Text>
          <Text style={s.ctaButtonUrl}>hiddenatlas.travel/custom</Text>
        </View>

        <Text style={s.ctaFooter}>{title} · Free Itinerary · hiddenatlas.travel</Text>
      </View>
    </Page>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────

export default function ItineraryPDF({ itinerary }) {
  const { days = [] } = itinerary;

  return (
    <Document
      title={itinerary.title}
      author="HiddenAtlas"
      subject={`${itinerary.title} – Free Itinerary`}
      keywords="travel, itinerary, luxury, HiddenAtlas"
    >
      <CoverPage itinerary={itinerary} />
      <OverviewPage itinerary={itinerary} />
      <RouteMapPage itinerary={itinerary} />
      {days.map((day, i) => (
        <DayPage key={i} day={day} index={i} itinerary={itinerary} />
      ))}
      <CTAPage itinerary={itinerary} />
    </Document>
  );
}
