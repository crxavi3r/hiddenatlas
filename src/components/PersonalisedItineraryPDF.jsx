// PersonalisedItineraryPDF
// Premium personalised HiddenAtlas guide — reuses ItineraryPDF design with My Trips overlays.
// Generated when a traveller downloads the "My Guide" PDF from My Trips workspace.

import {
  Document, Page, Text, View, Image, StyleSheet,
  Svg, Path, Rect, Circle, G, Polygon,
} from '@react-pdf/renderer';
import { buildRouteMapLayout, detectOutlierStops, parseCoordValue } from '../utils/routeMapLayout';

// ── Colour tokens (mirrors ItineraryPDF) ─────────────────────────────────────
const C = {
  teal:     '#1B6B65',
  tealDark: '#123F3A',
  tealMid:  '#164F4A',
  gold:     '#C9A96E',
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

const s = StyleSheet.create({
  // ── Cover ──────────────────────────────────────────────────────────────────
  coverWrapper: { position: 'relative', width: PAGE_W, height: PAGE_H, overflow: 'hidden', backgroundColor: C.darkBg },
  coverBg:       { position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover' },
  coverOverlay:  { position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, backgroundColor: 'rgba(10,18,14,0.60)' },
  coverTopBar:   {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 52, paddingTop: 38,
  },
  coverBrand:   { fontFamily: 'Helvetica-Bold', fontSize: 9, letterSpacing: 3, color: C.gold },
  coverTagline: { fontFamily: 'Helvetica', fontSize: 8, letterSpacing: 1.5, color: 'rgba(255,255,255,0.40)' },
  coverCenter: {
    position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 60,
  },
  coverEyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 3.5, color: C.gold, marginBottom: 20, textAlign: 'center' },
  coverTitle:    { fontFamily: 'Times-Bold', fontSize: 64, color: C.white, lineHeight: 1.05, marginBottom: 14, textAlign: 'center' },
  coverSubtitle: { fontFamily: 'Helvetica', fontSize: 15, color: 'rgba(255,255,255,0.70)', textAlign: 'center', lineHeight: 1.55, marginBottom: 32 },
  coverGoldLine: { width: 52, height: 1.5, backgroundColor: C.gold },
  coverBottomStrip: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', paddingHorizontal: 52, paddingVertical: 22,
    backgroundColor: 'rgba(10,18,14,0.55)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
  },
  coverMeta:      { flex: 1 },
  coverMetaSep:   { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 0 },
  coverMetaLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1.5, color: C.gold, marginBottom: 4 },
  coverMetaValue: { fontFamily: 'Helvetica', fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 1.35 },
  coverPersonalBadge: {
    position: 'absolute', top: 42, right: 52,
    backgroundColor: 'rgba(201,169,110,0.18)', borderWidth: 0.75, borderColor: 'rgba(201,169,110,0.50)',
    borderRadius: 2, paddingVertical: 4, paddingHorizontal: 8,
  },
  coverPersonalBadgeText: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.5, color: C.gold },

  // ── Running header ─────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 48, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.white,
  },
  headerBrand:   { fontFamily: 'Times-Bold', fontSize: 10, color: C.teal, letterSpacing: 0.5 },
  headerSection: { fontFamily: 'Helvetica', fontSize: 7.5, letterSpacing: 1.5, color: C.muted },

  // ── Trip details page ──────────────────────────────────────────────────────
  detailsBody: { paddingHorizontal: 48, paddingTop: 28, paddingBottom: 32 },
  detailsEyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 },
  detailsTitle:   { fontFamily: 'Times-Bold', fontSize: 28, color: C.charcoal, lineHeight: 1.15, marginBottom: 4 },
  detailsRule:    { width: 32, height: 1.5, backgroundColor: C.gold, marginTop: 16, marginBottom: 22 },
  detailBox: {
    backgroundColor: C.cream, borderRadius: 4, padding: 16, marginBottom: 16,
  },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  detailLabel:    { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.5, color: C.teal, width: 120, flexShrink: 0, paddingTop: 1.5 },
  detailValue:    { fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal, flex: 1, lineHeight: 1.55 },
  detailBoxLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 12 },
  accommodationTitle: { fontFamily: 'Times-Bold', fontSize: 11, color: C.charcoal, marginBottom: 2 },
  accommodationMeta:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },
  accommodationRef:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.teal },

  // ── Route map page ─────────────────────────────────────────────────────────
  mapPage: { backgroundColor: C.stone },
  mapHeader: {
    paddingHorizontal: 48, paddingTop: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },

  // ── Day pages ──────────────────────────────────────────────────────────────
  dayPage:   { backgroundColor: C.white },
  dayImg:    { width: '100%', height: 205, objectFit: 'cover', objectPosition: 'center', breakInside: 'avoid' },
  dayBody:   { paddingHorizontal: 48, paddingTop: 22, paddingBottom: 24, breakInside: 'avoid' },
  dayChip:   { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.gold, marginBottom: 7 },
  dayTitle:  { fontFamily: 'Times-Bold', fontSize: 21, color: C.charcoal, lineHeight: 1.22, widows: 2, orphans: 2 },
  dayRule:   { width: 26, height: 1.5, backgroundColor: C.gold, marginTop: 12, marginBottom: 14 },
  dayDesc:   { fontFamily: 'Helvetica', fontSize: 10, color: C.muted, lineHeight: 1.78, marginBottom: 14 },
  dayBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 5, breakInside: 'avoid' },
  dayBulletDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.teal, marginTop: 3.5, flexShrink: 0 },
  dayBulletText:{ fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.58, flex: 1 },
  tipBox: {
    backgroundColor: C.mapBg, borderLeftWidth: 3, borderLeftColor: C.gold,
    borderRadius: 4, paddingHorizontal: 16, paddingVertical: 11, breakInside: 'avoid',
  },
  tipLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.gold, marginBottom: 5 },
  tipText:  { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.65 },
  stayRow:  {
    flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center', breakInside: 'avoid',
  },
  stayLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.5, color: C.muted },
  stayValue: { fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal },

  // ── Personalisation sections (in day pages) ────────────────────────────────
  personalDivider: { borderTopWidth: 0.75, borderTopColor: C.border, marginTop: 18, marginBottom: 14 },
  personalSectionLabel: {
    fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal,
    marginBottom: 8, textTransform: 'uppercase',
  },

  // Booking card
  bookingCard: {
    borderWidth: 0.75, borderColor: C.border, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, breakInside: 'avoid',
  },
  bookingTypeBadge: {
    fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.5,
    color: C.gold, marginBottom: 3,
  },
  bookingTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.charcoal, marginBottom: 2 },
  bookingMeta:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },
  bookingRef:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.teal, marginTop: 2 },

  // Added item (user TripItem)
  addedCard: {
    backgroundColor: '#F7F4EE',
    borderLeftWidth: 2, borderLeftColor: C.teal,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, breakInside: 'avoid',
  },
  addedBadge: {
    fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.5,
    color: C.teal, marginBottom: 3,
  },
  addedTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.charcoal, marginBottom: 2 },
  addedMeta:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },

  // Note box
  noteBox: {
    backgroundColor: '#FFFBF2', borderLeftWidth: 2, borderLeftColor: C.gold,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, breakInside: 'avoid',
  },
  noteLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1.5, color: '#9B7B3A', marginBottom: 3 },
  noteContent: { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.6 },

  // Page number
  pageNum: { position: 'absolute', bottom: 18, right: 48, fontFamily: 'Helvetica', fontSize: 8, color: C.muted },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function imgUrl(src) {
  if (!src || typeof src !== 'string') return null;
  if (!src.startsWith('http')) return src;
  return `${src.replace(/\?.*/, '')}?w=1000&q=85`;
}

function formatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return iso; }
}

function normalizeContentDay(d) {
  if (!d) return null;
  return {
    dayNumber: d.dayNumber || d.day || 0,
    title:       d.title || '',
    description: d.desc || d.description || '',
    bullets:     d.bullets || d.highlights || [],
    tip:         d.tip || d.insiderTip || '',
    stay:        d.stay || '',
    imgs:        d.imgs || [],
  };
}

// ── SVG helpers (Catmull-Rom spline) ─────────────────────────────────────────
function _pdfProj(lon, lat, X0, X1, Y0, Y1, VW, VH) {
  return [(lon - X0) / (X1 - X0) * VW, (1 - (lat - Y0) / (Y1 - Y0)) * VH];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StarMark({ size = 12, color = C.gold }) {
  return (
    <Svg width={size} height={size} viewBox="0 2 20 20">
      <Polygon points="10,2 12,10 20,12 12,14 10,22 8,14 0,12 8,10" fill={color} />
    </Svg>
  );
}

function RunHeader({ country, title, badge }) {
  const c = (country || '').toUpperCase();
  const t = (title || '').toUpperCase();
  const right = badge || (c && t ? `${c} — ${t}` : c || t);
  return (
    <View style={s.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StarMark size={11} color={C.gold} />
        <Text style={s.headerBrand}>HiddenAtlas</Text>
      </View>
      <Text style={s.headerSection}>{right}</Text>
    </View>
  );
}

// Compact booking card for day pages
function BookingCard({ booking }) {
  const meta = booking.metadata || {};
  const timeParts = [booking.date ? formatDate(booking.date) : null, booking.time].filter(Boolean);
  const adults = meta.adults || meta.guests || meta.pax;
  const paid   = meta.totalAmount || meta.amount;
  const currency = meta.currency || '';

  return (
    <View style={s.bookingCard} wrap={false}>
      <Text style={s.bookingTypeBadge}>{(booking.type || 'BOOKING').toUpperCase()}</Text>
      <Text style={s.bookingTitle}>{booking.title}</Text>
      {timeParts.length > 0 && <Text style={s.bookingMeta}>{timeParts.join(' · ')}</Text>}
      {meta.checkInDate && (
        <Text style={s.bookingMeta}>
          Check-in: {meta.checkInDate}{meta.checkInTime ? ` at ${meta.checkInTime}` : ''}
          {meta.checkOutDate ? `  ·  Check-out: ${meta.checkOutDate}` : ''}
        </Text>
      )}
      {booking.locationName && !meta.checkInDate && (
        <Text style={s.bookingMeta}>{booking.locationName}</Text>
      )}
      {booking.confirmationReference && (
        <Text style={s.bookingRef}>Ref: {booking.confirmationReference}</Text>
      )}
      {adults && paid ? (
        <Text style={s.bookingMeta}>{adults} {Number(adults) === 1 ? 'person' : 'people'} · Paid: {paid} {currency}</Text>
      ) : adults ? (
        <Text style={s.bookingMeta}>{adults} {Number(adults) === 1 ? 'person' : 'people'}</Text>
      ) : paid ? (
        <Text style={s.bookingMeta}>Paid: {paid} {currency}</Text>
      ) : null}
      {booking.notes && <Text style={[s.bookingMeta, { marginTop: 2, fontStyle: 'italic' }]}>{booking.notes}</Text>}
    </View>
  );
}

// User-added TripItem card
function AddedItemCard({ item }) {
  const timePart = item.startTime && item.endTime
    ? `${item.startTime} – ${item.endTime}`
    : item.startTime || item.time || '';
  return (
    <View style={s.addedCard} wrap={false}>
      <Text style={s.addedBadge}>ADDED BY YOU</Text>
      <Text style={s.addedTitle}>{item.title}</Text>
      {(timePart || item.locationName) ? (
        <Text style={s.addedMeta}>{[timePart, item.locationName].filter(Boolean).join(' · ')}</Text>
      ) : null}
      {item.notes ? <Text style={[s.addedMeta, { marginTop: 2, fontStyle: 'italic' }]}>{item.notes}</Text> : null}
    </View>
  );
}

// TripNote box
function NoteBox({ note }) {
  return (
    <View style={s.noteBox} wrap={false}>
      {note.title ? <Text style={s.noteLabel}>{note.title.toUpperCase()}</Text> : null}
      <Text style={s.noteContent}>{note.content}</Text>
    </View>
  );
}

// ── Dynamic route SVG map (personalised stops) ────────────────────────────────
const MAP_W = 499; // PAGE_W - paddingHorizontal 48×2
const MAP_H = Math.round(MAP_W * 0.58);
const STOP_NUM_W = 22;
const STOP_FS    = 9;
const STOP_MB    = 5;
const COL_GAP    = 16;

const PDF_TIER_NUM = {
  1: { r: 7,   sw: 1.8, fill: '#F2E4CB', edge: '#C9A96E', lFs: 8, dFs: 6 },
  2: { r: 5.5, sw: 1.4, fill: '#D5E8E6', edge: '#1B6B65', lFs: 7, dFs: 5 },
};

function PersonalisedDynamicSvgMap({ stops = [] }) {
  const valid = stops.filter(s => s.latitude != null && s.longitude != null);
  if (valid.length < 2) return null;

  const sorted = [...valid].sort((a, b) =>
    (a.dayNumber ?? 99) - (b.dayNumber ?? 99) || (a.order ?? 0) - (b.order ?? 0)
  );
  const { mainStops, remoteStops } = detectOutlierStops(sorted);
  const numberedMain   = mainStops.map((s, i) => ({ ...s, num: i + 1 }));
  const numberedRemote = remoteStops.map((s, i) => ({ ...s, num: mainStops.length + i + 1 }));

  const layout = buildRouteMapLayout(numberedMain, MAP_W, MAP_H, {
    pad: 0.12, margin: 20, tiers: PDF_TIER_NUM, prioritizeMajor: true, preserveAspect: true,
  });
  if (!layout) return null;
  const { routePathD, labeledStops } = layout;

  const n        = numberedMain.length;
  const colCount = n > 12 ? 3 : 2;
  const perCol   = Math.ceil(n / colCount);
  const colW     = (MAP_W - COL_GAP * (colCount - 1)) / colCount;
  const remColW  = (MAP_W - COL_GAP) / 2;
  const cols     = Array.from({ length: colCount }, (_, ci) => numberedMain.slice(ci * perCol, (ci + 1) * perCol));

  return (
    <View style={{ width: MAP_W }}>
      <Svg width={MAP_W} height={MAP_H} viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#F4F1E8" />
        <Path d={routePathD} fill="none" stroke="#1C1A16" strokeWidth="2.5" opacity={0.06} strokeLinecap="round" />
        <Path d={routePathD} fill="none" stroke="#C9A96E" strokeWidth="1.8" strokeOpacity="0.20" strokeLinecap="round" />
        <Path d={routePathD} fill="none" stroke="#1B6B65" strokeWidth="1.2" strokeDasharray="6,3.5" strokeLinecap="round" />
        {labeledStops.map(({ cx, cy, r }, i) => (
          <Circle key={`wh${i}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={(r + 2.5).toString()} fill="#FFFFFF" fillOpacity="0.65" />
        ))}
        {labeledStops.map(({ cx, cy, tier, cfg, r }, i) => (
          <G key={`mc${i}`}>
            <Circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={r.toString()} fill={cfg.fill} stroke={cfg.edge} strokeWidth={cfg.sw.toString()} />
            {tier === 1 && (
              <Circle cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={(r + 4).toString()} fill="none" stroke={cfg.edge} strokeWidth="0.7" strokeOpacity="0.28" />
            )}
          </G>
        ))}
        {labeledStops.map(({ cx, cy }, i) => {
          const numStr = String(numberedMain[i].num);
          const nFs    = numStr.length > 1 ? 5.5 : 6.5;
          return (
            <Text key={`mn${i}`} x={cx.toFixed(1)} y={(cy + nFs * 0.38).toFixed(1)}
              textAnchor="middle" fontFamily="Helvetica-Bold" fontSize={nFs}
              fill={numberedMain[i].tier === 1 ? '#7A5A20' : '#0D4440'}>
              {numStr}
            </Text>
          );
        })}
        {labeledStops.reduce((acc, { stop, tier, labelAnchor, labelX, labelY, fs }, i) => {
          if (tier === 1) {
            acc.push(
              <Text key={`lh${i}`} x={labelX.toFixed(1)} y={labelY.toFixed(1)}
                textAnchor={labelAnchor} fontFamily="Helvetica-Bold" fontSize={fs}
                fill="#F4F1E8" stroke="#F4F1E8" strokeWidth="2.5">{stop.name}</Text>
            );
            acc.push(
              <Text key={`lt${i}`} x={labelX.toFixed(1)} y={labelY.toFixed(1)}
                textAnchor={labelAnchor} fontFamily="Helvetica-Bold" fontSize={fs} fill="#1C1A16">{stop.name}</Text>
            );
          }
          return acc;
        }, [])}
      </Svg>

      <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 0.75, borderTopColor: C.border, marginBottom: 9 }}>
        <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 2, color: C.teal }}>Route stops</Text>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {cols.map((col, ci) => (
          <View key={ci} style={{ width: colW, marginRight: ci < colCount - 1 ? COL_GAP : 0 }}>
            {col.map(stop => (
              <View key={stop.num} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: STOP_MB }}>
                <Text style={{ fontSize: STOP_FS, fontFamily: 'Helvetica-Bold', color: stop.isUserAdded ? C.gold : C.teal, width: STOP_NUM_W, flexShrink: 0 }}>
                  {String(stop.num).padStart(2, '0')}
                </Text>
                <Text style={{ fontSize: STOP_FS, color: C.charcoal, lineHeight: 1.45, width: colW - STOP_NUM_W }}>
                  {stop.name}{stop.isUserAdded ? ' ·' : ''}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {numberedRemote.length > 0 && (
        <View style={{ marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F9F5EE', borderLeftWidth: 2, borderLeftColor: C.gold }}>
          <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, color: '#8C7050', marginBottom: 3 }}>Day trips &amp; remote stops</Text>
          <Text style={{ fontSize: 8, color: '#9B8870', marginBottom: 8, lineHeight: 1.4 }}>Shown separately to keep the route readable.</Text>
          <View style={{ flexDirection: 'row' }}>
            {[0, 1].map(ci => {
              const col = numberedRemote.filter((_, ri) => ri % 2 === ci);
              if (!col.length) return null;
              return (
                <View key={ci} style={{ width: remColW, marginRight: ci === 0 ? COL_GAP : 0 }}>
                  {col.map(stop => (
                    <View key={stop.num} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: STOP_MB }}>
                      <Text style={{ fontSize: STOP_FS, fontFamily: 'Helvetica-Bold', color: C.gold, width: STOP_NUM_W, flexShrink: 0 }}>
                        {String(stop.num).padStart(2, '0')}
                      </Text>
                      <Text style={{ fontSize: STOP_FS, color: '#4A433A', lineHeight: 1.45, width: remColW - STOP_NUM_W }}>
                        {stop.name}{stop.dayNumber ? `  ·  Day ${stop.dayNumber}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Page components ───────────────────────────────────────────────────────────

function PersonalisedCoverPage({ itinerary, trip }) {
  const {
    title = '', subtitle = '', country = '', region,
    duration = '', nights, coverImage,
  } = itinerary;
  const durationLabel = nights
    ? `${duration.replace(/\bdays?\b/i, 'Days')} • ${nights} Nights`
    : duration;
  const hero = imgUrl(coverImage);

  const hasDates = trip?.startDate || trip?.endDate;
  const hasTravellers = trip?.travellers;

  return (
    <Page size="A4">
      <View style={s.coverWrapper}>
        {hero ? <Image src={hero} style={s.coverBg} /> : null}
        <View style={s.coverOverlay} />

        <View style={s.coverTopBar}>
          <Text style={s.coverBrand}>HIDDENATLAS</Text>
          <Text style={s.coverTagline}>PERSONALISED TRAVEL GUIDE</Text>
        </View>

        <View style={s.coverCenter}>
          <Text style={s.coverEyebrow}>
            {country.toUpperCase()}{region ? ` · ${region.toUpperCase()}` : ''}
          </Text>
          <Text style={s.coverTitle}>{title}</Text>
          {subtitle ? <Text style={s.coverSubtitle}>{subtitle}</Text> : null}
          <View style={s.coverGoldLine} />
        </View>

        <View style={s.coverBottomStrip}>
          <View style={s.coverMeta}>
            <Text style={s.coverMetaLabel}>DESTINATION</Text>
            <Text style={s.coverMetaValue}>{country}{region ? `, ${region}` : ''}</Text>
          </View>
          {(duration || durationLabel) ? (
            <>
              <View style={s.coverMetaSep} />
              <View style={[s.coverMeta, { paddingLeft: 24 }]}>
                <Text style={s.coverMetaLabel}>DURATION</Text>
                <Text style={s.coverMetaValue}>{durationLabel || duration}</Text>
              </View>
            </>
          ) : null}
          {hasDates ? (
            <>
              <View style={s.coverMetaSep} />
              <View style={[s.coverMeta, { paddingLeft: 24 }]}>
                <Text style={s.coverMetaLabel}>TRAVEL DATES</Text>
                <Text style={s.coverMetaValue}>
                  {trip.startDate ? formatDate(trip.startDate) : ''}
                  {trip.startDate && trip.endDate ? ' – ' : ''}
                  {trip.endDate ? formatDate(trip.endDate) : ''}
                </Text>
              </View>
            </>
          ) : null}
          {hasTravellers ? (
            <>
              <View style={s.coverMetaSep} />
              <View style={[s.coverMeta, { paddingLeft: 24 }]}>
                <Text style={s.coverMetaLabel}>TRAVELLERS</Text>
                <Text style={s.coverMetaValue}>{trip.travellers}</Text>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Page>
  );
}

function TripDetailsPage({ itinerary, trip, tripBookings }) {
  const hasPersonalInfo = trip.startDate || trip.travellers || trip.accommodationSummary
    || trip.arrivalInfo || trip.departureInfo || trip.generalNotes;
  if (!hasPersonalInfo) return null;

  const hotelBookings = (tripBookings || [])
    .filter(b => b.type === 'hotel')
    .sort((a, b) => {
      const ma = a.metadata || {}, mb = b.metadata || {};
      const da = ma.checkInDate || a.date || '';
      const db = mb.checkInDate || b.date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });

  return (
    <Page size="A4" style={{ backgroundColor: C.stone }}>
      <RunHeader country={itinerary.country} title={itinerary.title} badge="YOUR TRIP" />

      <View style={s.detailsBody}>
        <Text style={s.detailsEyebrow}>YOUR JOURNEY DETAILS</Text>
        <Text style={s.detailsTitle}>{itinerary.title || trip.title || trip.destination}</Text>
        {itinerary.description ? (
          <Text style={{ fontFamily: 'Helvetica', fontSize: 10, color: C.muted, lineHeight: 1.7, marginTop: 8 }}>
            {itinerary.description}
          </Text>
        ) : null}
        <View style={s.detailsRule} />

        {/* Trip logistics box */}
        <View style={s.detailBox}>
          <Text style={s.detailBoxLabel}>TRIP DETAILS</Text>
          {trip.startDate && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Dates</Text>
              <Text style={s.detailValue}>
                {formatDate(trip.startDate)}{trip.endDate ? ` – ${formatDate(trip.endDate)}` : ''}
              </Text>
            </View>
          )}
          {trip.travellers && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Travellers</Text>
              <Text style={s.detailValue}>{trip.travellers}</Text>
            </View>
          )}
          {trip.accommodationSummary && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Accommodation</Text>
              <Text style={s.detailValue}>{trip.accommodationSummary}</Text>
            </View>
          )}
          {trip.arrivalInfo && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Arrival</Text>
              <Text style={s.detailValue}>{trip.arrivalInfo}</Text>
            </View>
          )}
          {trip.departureInfo && (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Departure</Text>
              <Text style={s.detailValue}>{trip.departureInfo}</Text>
            </View>
          )}
          {trip.generalNotes && (
            <View style={[s.detailRow, { marginBottom: 0 }]}>
              <Text style={s.detailLabel}>Notes</Text>
              <Text style={s.detailValue}>{trip.generalNotes}</Text>
            </View>
          )}
        </View>

        {/* Hotel bookings summary */}
        {hotelBookings.length > 0 && (
          <View style={{ marginTop: 4 }}>
            <Text style={[s.detailBoxLabel, { marginBottom: 10 }]}>ACCOMMODATION</Text>
            {hotelBookings.map((b, i) => {
              const meta = b.metadata || {};
              return (
                <View key={b.id} wrap={false} style={{
                  marginBottom: i < hotelBookings.length - 1 ? 12 : 0,
                  paddingBottom: i < hotelBookings.length - 1 ? 12 : 0,
                  borderBottomWidth: i < hotelBookings.length - 1 ? 0.5 : 0,
                  borderBottomColor: C.border,
                }}>
                  <Text style={s.accommodationTitle}>{b.title}</Text>
                  {meta.checkInDate && (
                    <Text style={s.accommodationMeta}>
                      Check-in: {meta.checkInDate}{meta.checkInTime ? ` at ${meta.checkInTime}` : ''}
                      {meta.checkOutDate ? `  ·  Check-out: ${meta.checkOutDate}` : ''}
                    </Text>
                  )}
                  {b.locationName && <Text style={s.accommodationMeta}>{b.locationName}</Text>}
                  {b.address && <Text style={s.accommodationMeta}>{b.address}</Text>}
                  {b.confirmationReference && (
                    <Text style={s.accommodationRef}>Ref: {b.confirmationReference}</Text>
                  )}
                  {b.notes && <Text style={[s.accommodationMeta, { marginTop: 2, fontStyle: 'italic' }]}>{b.notes}</Text>}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function PersonalisedRouteMapPage({ itinerary, itineraryDayStops, hiddenStopIds, tripItems }) {
  // Build personalised stops: base stops minus hidden ones, plus user-added items with coords
  const baseStops = (itineraryDayStops || [])
    .filter(s => s.showOnMap !== false && s.latitude != null && s.longitude != null)
    .filter(s => !hiddenStopIds.includes(s.id))
    .map(s => ({
      name: s.title,
      latitude: parseCoordValue(s.latitude),
      longitude: parseCoordValue(s.longitude),
      type: s.isMajorStop ? 'major' : 'stop',
      dayNumber: s.dayNumber,
      order: s.sortOrder,
      isUserAdded: false,
    }));

  const userStops = (tripItems || [])
    .filter(i => i.latitude != null && i.longitude != null && !i.isHidden)
    .map(i => ({
      name: i.title,
      latitude: parseCoordValue(i.latitude),
      longitude: parseCoordValue(i.longitude),
      type: 'stop',
      dayNumber: i.dayNumber || 999,
      order: i.sortOrder || 999,
      isUserAdded: true,
    }));

  const allStops = [...baseStops, ...userStops]
    .sort((a, b) => (a.dayNumber - b.dayNumber) || (a.order - b.order));

  if (allStops.length < 2) return null;

  const { title, country, duration } = itinerary;

  return (
    <Page size="A4" style={s.mapPage}>
      <RunHeader country={country} title={title} badge="ROUTE MAP" />

      <View style={s.mapHeader}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2.5, color: C.teal, marginBottom: 7 }}>
            YOUR PERSONALISED ROUTE
          </Text>
          <Text style={{ fontFamily: 'Times-Bold', fontSize: 26, color: C.charcoal, lineHeight: 1.1 }}>
            {title}
          </Text>
        </View>
        {duration ? (
          <View style={{ alignItems: 'flex-end', paddingBottom: 3 }}>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: C.muted, marginBottom: 6 }}>{duration}</Text>
            <View style={{ width: 30, height: 1.5, backgroundColor: C.gold }} />
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 48, paddingTop: 16, paddingBottom: 8 }}>
        <PersonalisedDynamicSvgMap stops={allStops} />
        {userStops.length > 0 && (
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 10 }}>
            Numbered stops marked with · are your personal additions.
          </Text>
        )}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function PersonalisedDayPage({ tripDay, contentDay, itinerary, dayStops, hiddenStopIds, dayItems, dayBookings, dayNotes }) {
  const title = tripDay.titleOverride || contentDay?.title || tripDay.title || `Day ${tripDay.dayNumber}`;
  const description = tripDay.descriptionOverride || contentDay?.description || tripDay.description || '';
  const tip   = contentDay?.tip || '';
  const stay  = contentDay?.stay || '';

  // Stops for "Places Today": original stops minus hidden
  const visibleStops = (dayStops || [])
    .filter(s => !hiddenStopIds.includes(s.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Legacy bullets fallback when no structured stops
  const bullets = visibleStops.length > 0 ? [] : (contentDay?.bullets || []);

  // Filter out itinerary-type items from user items (those are template copies, not additions)
  const userItems = (dayItems || []).filter(i => i.type !== 'itinerary_item');
  const nonHotelBookings = (dayBookings || []).filter(b => b.type !== 'hotel');
  const hasPersonalContent = nonHotelBookings.length > 0 || userItems.length > 0 || dayNotes.length > 0;

  const imgs = (contentDay?.imgs || []).map(imgUrl).filter(Boolean);
  const { country } = itinerary;

  return (
    <Page size="A4" style={s.dayPage}>
      <RunHeader country={country} title={itinerary.title} />

      {imgs.length === 2 ? (
        <View style={{ flexDirection: 'row', width: '100%', height: 205, breakInside: 'avoid' }}>
          <Image src={imgs[0]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
          <Image src={imgs[1]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
        </View>
      ) : imgs.length === 1 ? (
        <Image src={imgs[0]} style={s.dayImg} />
      ) : null}

      <View style={s.dayBody}>
        {/* Title block */}
        <View wrap={false}>
          <Text style={s.dayChip}>DAY {tripDay.dayNumber}</Text>
          <Text style={s.dayTitle}>{title}</Text>
          <View style={s.dayRule} />
          {description ? <Text style={s.dayDesc}>{description}</Text> : null}
        </View>

        {/* Structured stops — "Places Today" */}
        {visibleStops.length > 0 ? (
          <View style={{ marginBottom: 14, breakInside: 'avoid' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 8 }}>
              PLACES TODAY
            </Text>
            {visibleStops.map((stop, i) => (
              <View key={i} wrap={false} style={[s.dayBulletRow, { alignItems: 'flex-start' }]}>
                <View style={[s.dayBulletDot, { marginTop: 5 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.dayBulletText, { fontFamily: 'Helvetica-Bold' }]}>
                    {stop.title}{stop.description ? ` — ${stop.description}` : ''}
                  </Text>
                  {stop.suggestedTime ? (
                    <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 1 }}>{stop.suggestedTime}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Legacy bullets */}
        {bullets.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            {bullets.map((b, i) => (
              <View key={i} wrap={false} style={s.dayBulletRow}>
                <View style={s.dayBulletDot} />
                <Text style={s.dayBulletText}>{typeof b === 'string' ? b : String(b)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Insider tip */}
        {tip ? (
          <View wrap={false} style={[s.tipBox, { marginBottom: 14 }]}>
            <Text style={s.tipLabel}>INSIDER TIP</Text>
            <Text style={s.tipText}>{tip}</Text>
          </View>
        ) : null}

        {/* Tonight's stay */}
        {stay ? (
          <View style={s.stayRow} wrap={false}>
            <Text style={s.stayLabel}>TONIGHT'S STAY:</Text>
            <Text style={s.stayValue}>{stay}</Text>
          </View>
        ) : null}

        {/* ── Personalisation section ── */}
        {hasPersonalContent && (
          <View>
            <View style={s.personalDivider} />

            {/* Your Bookings Today */}
            {nonHotelBookings.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={s.personalSectionLabel}>YOUR BOOKINGS TODAY</Text>
                {nonHotelBookings.map(b => <BookingCard key={b.id} booking={b} />)}
              </View>
            )}

            {/* Your Additions */}
            {userItems.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={s.personalSectionLabel}>YOUR ADDITIONS</Text>
                {userItems.map(item => <AddedItemCard key={item.id} item={item} />)}
              </View>
            )}

            {/* Your Notes */}
            {dayNotes.length > 0 && (
              <View>
                <Text style={s.personalSectionLabel}>YOUR NOTES</Text>
                {dayNotes.map(n => <NoteBox key={n.id} note={n} />)}
              </View>
            )}
          </View>
        )}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

function MyNotesPage({ itinerary, tripNotes, tripBookings }) {
  // General notes: tripNotes with no dayId + non-day bookings (flight, transfer, car rental, other)
  const generalNotes = (tripNotes || []).filter(n => !n.tripDayId && n.content);
  const tripLevelBookings = (tripBookings || [])
    .filter(b => !b.tripDayId && b.type !== 'hotel')
    .sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      return da < db ? -1 : da > db ? 1 : 0;
    });

  if (!generalNotes.length && !tripLevelBookings.length) return null;

  return (
    <Page size="A4" style={{ backgroundColor: C.stone }}>
      <RunHeader country={itinerary.country} title={itinerary.title} badge="MY NOTES" />

      <View style={{ paddingHorizontal: 48, paddingTop: 28, paddingBottom: 32 }}>
        {tripLevelBookings.length > 0 && (
          <View style={{ marginBottom: generalNotes.length > 0 ? 28 : 0 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 }}>
              TRIP BOOKINGS
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: C.gold, marginBottom: 18 }} />
            {tripLevelBookings.map(b => <BookingCard key={b.id} booking={b} />)}
          </View>
        )}

        {generalNotes.length > 0 && (
          <View>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 }}>
              MY NOTES
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: C.gold, marginBottom: 18 }} />
            {generalNotes.map(n => <NoteBox key={n.id} note={n} />)}
          </View>
        )}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────
export default function PersonalisedItineraryPDF({ itinerary, personalisationContext = {} }) {
  const {
    trip = {},
    tripDays = [],
    tripItems = [],
    tripNotes = [],
    tripBookings = [],
    hiddenStopIds = [],
  } = personalisationContext;

  const itineraryDayStops = itinerary.dayStops || [];

  // Content days: parsed from itinerary.content or itinerary.days
  const content = itinerary.content || {};
  const contentDays = (content.days || itinerary.days || []).map(normalizeContentDay).filter(Boolean);
  const contentDayMap = {};
  for (const d of contentDays) {
    contentDayMap[d.dayNumber] = d;
  }

  // Sorted trip days (drive iteration)
  const sortedDays = [...tripDays].sort((a, b) =>
    (a.sortOrder ?? a.dayNumber) - (b.sortOrder ?? b.dayNumber)
  );

  // Has route map?
  const validMapStops = itineraryDayStops
    .filter(s => s.showOnMap !== false && s.latitude != null && s.longitude != null)
    .filter(s => !hiddenStopIds.includes(s.id));
  const userMapItems = tripItems.filter(i => i.latitude != null && i.longitude != null && !i.isHidden);
  const hasRouteMap = (validMapStops.length + userMapItems.length) >= 2;

  const title = itinerary.title || trip.title || trip.destination || 'My Journey';

  const pages = [
    <PersonalisedCoverPage key="cover" itinerary={itinerary} trip={trip} />,

    <TripDetailsPage
      key="trip-details"
      itinerary={itinerary}
      trip={trip}
      tripBookings={tripBookings}
    />,

    ...(hasRouteMap ? [
      <PersonalisedRouteMapPage
        key="route-map"
        itinerary={itinerary}
        itineraryDayStops={itineraryDayStops}
        hiddenStopIds={hiddenStopIds}
        tripItems={tripItems}
      />
    ] : []),

    ...sortedDays.map(tripDay => {
      const contentDay = contentDayMap[tripDay.dayNumber] || null;
      const dayStops = itineraryDayStops.filter(s => s.dayNumber === tripDay.dayNumber);
      const dayItems = tripItems.filter(i => i.tripDayId === tripDay.id);
      const dayBookings = tripBookings.filter(b => b.tripDayId === tripDay.id);
      const dayNotes = tripNotes.filter(n => n.tripDayId === tripDay.id);
      return (
        <PersonalisedDayPage
          key={tripDay.id}
          tripDay={tripDay}
          contentDay={contentDay}
          itinerary={itinerary}
          dayStops={dayStops}
          hiddenStopIds={hiddenStopIds}
          dayItems={dayItems}
          dayBookings={dayBookings}
          dayNotes={dayNotes}
        />
      );
    }),

    <MyNotesPage
      key="notes"
      itinerary={itinerary}
      tripNotes={tripNotes}
      tripBookings={tripBookings}
    />,
  ].filter(Boolean);

  return (
    <Document
      title={`${title} — My HiddenAtlas Guide`}
      author="HiddenAtlas"
      subject={`${title} — Personalised Travel Guide`}
      keywords="travel, itinerary, personalised, HiddenAtlas"
      hyphenationCallback={word => [word]}
    >
      {pages}
    </Document>
  );
}
