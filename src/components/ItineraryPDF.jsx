// @react-pdf/renderer only supports TTF/OTF — no WOFF.
// We use built-in PDF fonts to guarantee zero network dependency:
//   Times-Roman / Times-Bold  → headings (Playfair Display equivalent)
//   Helvetica / Helvetica-Bold → body (Inter equivalent)

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const C = {
  teal: '#1B6B65',
  gold: '#C9A96E',
  cream: '#F4F1EC',
  stone: '#FAFAF8',
  charcoal: '#1C1A16',
  muted: '#6B6156',
  border: '#E8E3DA',
  white: '#FFFFFF',
  darkBg: '#111510',
};

const s = StyleSheet.create({
  // --- Cover ---
  coverPage: {
    backgroundColor: C.darkBg,
    padding: 0,
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0.45,
  },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(17,21,16,0.55)',
  },
  coverContent: {
    position: 'absolute',
    bottom: 72,
    left: 56,
    right: 56,
  },
  coverBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 3,
    color: C.gold,
    marginBottom: 24,
  },
  coverTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 44,
    color: C.white,
    lineHeight: 1.15,
    marginBottom: 14,
  },
  coverSubtitle: {
    fontFamily: 'Helvetica',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 32,
    lineHeight: 1.5,
  },
  coverMeta: {
    flexDirection: 'row',
    gap: 24,
  },
  coverMetaItem: {
    flexDirection: 'column',
    gap: 3,
  },
  coverMetaLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.gold,
  },
  coverMetaValue: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: C.white,
  },
  coverDivider: {
    width: 40,
    height: 2,
    backgroundColor: C.gold,
    marginBottom: 28,
  },

  // --- Standard page ---
  page: {
    backgroundColor: C.stone,
    padding: 0,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.white,
  },
  pageHeaderBrand: {
    fontFamily: 'Times-Bold',
    fontSize: 11,
    color: C.teal,
    letterSpacing: 1,
  },
  pageHeaderSection: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2,
    color: C.muted,
  },
  pageBody: {
    padding: '32px 48px',
    flex: 1,
  },

  // --- Section headings ---
  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.teal,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 28,
    color: C.charcoal,
    lineHeight: 1.2,
    marginBottom: 16,
  },
  sectionDivider: {
    width: 32,
    height: 2,
    backgroundColor: C.gold,
    marginBottom: 20,
  },

  // --- Overview page ---
  overviewDescription: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: C.muted,
    lineHeight: 1.75,
    marginBottom: 28,
  },
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 28,
  },
  highlightPill: {
    backgroundColor: '#EFF6F5',
    borderWidth: 1,
    borderColor: '#A8D5D1',
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  highlightText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: C.teal,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 28,
  },
  metaCard: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  metaCardLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.muted,
    marginBottom: 6,
  },
  metaCardValue: {
    fontFamily: 'Times-Bold',
    fontSize: 16,
    color: C.charcoal,
  },
  routeBox: {
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    marginBottom: 24,
  },
  routeBoxTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 2,
    color: C.teal,
    marginBottom: 10,
  },
  routeBoxText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.7,
  },
  includedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  includedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '48%',
    marginBottom: 6,
  },
  includedDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gold,
  },
  includedText: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.charcoal,
    flex: 1,
    lineHeight: 1.5,
  },

  // --- Day page ---
  dayPage: {
    backgroundColor: C.white,
    padding: 0,
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
  dayImagePlaceholderText: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.border,
    letterSpacing: 2,
  },
  dayContent: {
    padding: '28px 48px',
  },
  dayNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.gold,
    marginBottom: 6,
  },
  dayTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 22,
    color: C.charcoal,
    marginBottom: 6,
    lineHeight: 1.2,
  },
  daySubtitle: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    marginBottom: 14,
  },
  dayDivider: {
    width: 28,
    height: 1.5,
    backgroundColor: C.gold,
    marginBottom: 16,
  },
  dayDescription: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.75,
    marginBottom: 20,
  },
  dayActivities: {
    gap: 8,
  },
  dayActivity: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  dayActivityBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.teal,
    marginTop: 4,
    flexShrink: 0,
  },
  dayActivityText: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.charcoal,
    lineHeight: 1.6,
    flex: 1,
  },
  dayStayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  dayStayLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.muted,
  },
  dayStayValue: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.charcoal,
  },

  // --- CTA page ---
  ctaPage: {
    backgroundColor: C.teal,
    padding: '72px 56px',
    justifyContent: 'center',
  },
  ctaBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },
  ctaTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 34,
    color: C.white,
    lineHeight: 1.2,
    marginBottom: 20,
  },
  ctaDivider: {
    width: 40,
    height: 2,
    backgroundColor: C.gold,
    marginBottom: 24,
  },
  ctaBody: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 1.75,
    marginBottom: 36,
    maxWidth: 400,
  },
  ctaUrl: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 13,
    color: C.gold,
    letterSpacing: 0.5,
  },
  ctaNote: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 48,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 20,
    right: 48,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.muted,
  },
});

// ── Sub-components ────────────────────────────────────────────────────────────

function PageHeader({ section, title }) {
  return (
    <View style={s.pageHeader}>
      <Text style={s.pageHeaderBrand}>HiddenAtlas</Text>
      <Text style={s.pageHeaderSection}>{section} — {title}</Text>
    </View>
  );
}

function CoverPage({ itinerary }) {
  const { title, subtitle, country, region, duration, groupSize, coverImage, image } = itinerary;
  const heroUrl = (coverImage || image || '').replace(/\?.*/, '') + '?w=1200&q=80';

  return (
    <Page size="A4" style={s.coverPage}>
      {heroUrl ? <Image src={heroUrl} style={s.coverImage} /> : null}
      <View style={s.coverOverlay} />
      <View style={s.coverContent}>
        <Text style={s.coverBrand}>HIDDENATLAS · CURATED TRAVEL</Text>
        <View style={s.coverDivider} />
        <Text style={s.coverTitle}>{title}</Text>
        <Text style={s.coverSubtitle}>{subtitle || [country, region].filter(Boolean).join(' · ')}</Text>
        <View style={s.coverMeta}>
          <View style={s.coverMetaItem}>
            <Text style={s.coverMetaLabel}>DESTINATION</Text>
            <Text style={s.coverMetaValue}>{country}{region ? `, ${region}` : ''}</Text>
          </View>
          {duration ? (
            <View style={s.coverMetaItem}>
              <Text style={s.coverMetaLabel}>DURATION</Text>
              <Text style={s.coverMetaValue}>{duration} days</Text>
            </View>
          ) : null}
          {groupSize ? (
            <View style={s.coverMetaItem}>
              <Text style={s.coverMetaLabel}>IDEAL FOR</Text>
              <Text style={s.coverMetaValue}>{groupSize}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Page>
  );
}

function OverviewPage({ itinerary }) {
  const {
    title, country, description, highlights = [],
    routeOverview, included = [], duration, difficulty, bestFor = [],
  } = itinerary;

  return (
    <Page size="A4" style={s.page}>
      <PageHeader section={country} title={title} />
      <View style={s.pageBody}>
        <Text style={s.sectionLabel}>TRIP OVERVIEW</Text>
        <Text style={s.sectionTitle}>{title}</Text>
        <View style={s.sectionDivider} />

        {description ? <Text style={s.overviewDescription}>{description}</Text> : null}

        <View style={s.metaRow}>
          {duration ? (
            <View style={s.metaCard}>
              <Text style={s.metaCardLabel}>DURATION</Text>
              <Text style={s.metaCardValue}>{duration} days</Text>
            </View>
          ) : null}
          {difficulty ? (
            <View style={s.metaCard}>
              <Text style={s.metaCardLabel}>PACE</Text>
              <Text style={s.metaCardValue}>{difficulty}</Text>
            </View>
          ) : null}
          {bestFor.length > 0 ? (
            <View style={s.metaCard}>
              <Text style={s.metaCardLabel}>BEST FOR</Text>
              <Text style={s.metaCardValue}>{bestFor.join(', ')}</Text>
            </View>
          ) : null}
        </View>

        {highlights.length > 0 ? (
          <>
            <Text style={[s.sectionLabel, { marginBottom: 8 }]}>HIGHLIGHTS</Text>
            <View style={s.highlightsGrid}>
              {highlights.map((h, i) => (
                <View key={i} style={s.highlightPill}>
                  <Text style={s.highlightText}>{h}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {routeOverview ? (
          <View style={s.routeBox}>
            <Text style={s.routeBoxTitle}>ROUTE OVERVIEW</Text>
            <Text style={s.routeBoxText}>{routeOverview}</Text>
          </View>
        ) : null}

        {included.length > 0 ? (
          <>
            <Text style={[s.sectionLabel, { marginBottom: 10 }]}>WHAT'S INCLUDED</Text>
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
      <Text style={s.pageNumber} render={({ pageNumber }) => `${pageNumber}`} fixed />
    </Page>
  );
}

function DayPage({ day, index, itinerary }) {
  const { title: itinTitle, country } = itinerary;
  const { title, subtitle, desc, description, bullets = [], activities = [], stay, img } = day;
  const dayDesc = desc || description || null;
  const dayActivities = bullets.length ? bullets : activities;
  const imgUrl = img
    ? img.startsWith('http')
      ? img.replace(/\?.*/, '') + '?w=1000&q=80'
      : `https://images.unsplash.com/photo-${img}?w=1000&q=80`
    : null;

  return (
    <Page size="A4" style={s.dayPage}>
      <PageHeader section={country} title={itinTitle} />

      {imgUrl ? (
        <Image src={imgUrl} style={s.dayImageStrip} />
      ) : (
        <View style={s.dayImagePlaceholder}>
          <Text style={s.dayImagePlaceholderText}>{country.toUpperCase()}</Text>
        </View>
      )}

      <View style={s.dayContent}>
        <Text style={s.dayNumber}>DAY {index + 1}</Text>
        <Text style={s.dayTitle}>{title}</Text>
        {subtitle ? <Text style={s.daySubtitle}>{subtitle}</Text> : null}
        <View style={s.dayDivider} />

        {dayDesc ? <Text style={s.dayDescription}>{dayDesc}</Text> : null}

        {dayActivities.length > 0 ? (
          <View style={s.dayActivities}>
            {dayActivities.map((act, i) => (
              <View key={i} style={s.dayActivity}>
                <View style={s.dayActivityBullet} />
                <Text style={s.dayActivityText}>{act}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {stay ? (
          <View style={s.dayStayRow}>
            <Text style={s.dayStayLabel}>TONIGHT'S STAY:</Text>
            <Text style={s.dayStayValue}>{stay}</Text>
          </View>
        ) : null}
      </View>

      <Text style={s.pageNumber} render={({ pageNumber }) => `${pageNumber}`} fixed />
    </Page>
  );
}

function CTAPage({ itinerary }) {
  const { title } = itinerary;
  return (
    <Page size="A4" style={s.ctaPage}>
      <Text style={s.ctaBrand}>HIDDENATLAS</Text>
      <Text style={s.ctaTitle}>Ready to make{'\n'}this trip yours?</Text>
      <View style={s.ctaDivider} />
      <Text style={s.ctaBody}>
        This itinerary gives you the framework. If you'd like a fully personalised version — with handpicked accommodation, restaurant reservations, and real-time logistics — our team of expert planners would love to help.
      </Text>
      <Text style={s.ctaUrl}>hiddenatlas.travel/custom</Text>
      <Text style={s.ctaNote}>{title} · Free Itinerary · hiddenatlas.travel</Text>
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
      {days.map((day, i) => (
        <DayPage key={i} day={day} index={i} itinerary={itinerary} />
      ))}
      <CTAPage itinerary={itinerary} />
    </Document>
  );
}
