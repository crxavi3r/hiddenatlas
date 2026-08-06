// PersonalisedItineraryPDF
// Premium personalised HiddenAtlas guide — reuses ItineraryPDF design with My Trips overlays.
// Generated when a traveller downloads the "My Guide" PDF from My Trips workspace.

import {
  Document, Page, Text, View, Image, Link, StyleSheet,
  Svg, Polygon,
} from '@react-pdf/renderer';
import {
  partitionDayContent, parseNoteBulletSections, linkifyText,
} from '../utils/tripPdfData';

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
const ACTIVITY_IMG_W = 130;
const ACTIVITY_MIN_H = 84;

const s = StyleSheet.create({
  // ── Cover ──────────────────────────────────────────────────────────────────
  coverWrapper:  { position: 'relative', width: PAGE_W, height: PAGE_H, overflow: 'hidden', backgroundColor: C.darkBg },
  coverBg:       { position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, objectFit: 'cover' },
  coverOverlay:  { position: 'absolute', top: 0, left: 0, width: PAGE_W, height: PAGE_H, backgroundColor: 'rgba(10,18,14,0.60)' },
  coverTopBar: {
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
  coverEyebrow:  { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 3.5, color: C.gold, marginBottom: 20, textAlign: 'center' },
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

  // ── Running header ─────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 48, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.white,
  },
  headerBrand:   { fontFamily: 'Times-Bold', fontSize: 10, color: C.teal, letterSpacing: 0.5 },
  headerSection: { fontFamily: 'Helvetica', fontSize: 7.5, letterSpacing: 1.5, color: C.muted },

  // ── Journey overview / expedition route page ────────────────────────────────
  mapPage:          { backgroundColor: C.stone },
  mapBanner:        { backgroundColor: C.tealMid, paddingHorizontal: 48, paddingTop: 26, paddingBottom: 26 },
  mapBannerEyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
  mapBannerTitle:   { fontFamily: 'Times-Bold', fontSize: 26, color: C.white, marginBottom: 4 },
  mapBannerSub:     { fontFamily: 'Helvetica', fontSize: 10, color: 'rgba(255,255,255,0.60)' },
  mapHighlights:    { paddingHorizontal: 48, paddingTop: 16, paddingBottom: 24, breakInside: 'avoid' },
  mapHlLabel:       { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 10 },
  mapHlGrid:        { flexDirection: 'row', flexWrap: 'wrap' },
  mapHlItem:        { width: '50%', flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7, paddingRight: 12, breakInside: 'avoid' },
  mapHlDot:         { width: 5, height: 5, borderRadius: 3, backgroundColor: C.gold, marginTop: 3.5, flexShrink: 0 },
  mapHlText:        { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.55, flex: 1 },

  // ── Trip details page ──────────────────────────────────────────────────────
  detailsBody:    { paddingHorizontal: 48, paddingTop: 28, paddingBottom: 32 },
  detailsEyebrow: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 },
  detailsTitle:   { fontFamily: 'Times-Bold', fontSize: 28, color: C.charcoal, lineHeight: 1.15, marginBottom: 4 },
  detailsRule:    { width: 32, height: 1.5, backgroundColor: C.gold, marginTop: 16, marginBottom: 22 },
  detailBox:      { backgroundColor: C.cream, borderRadius: 4, padding: 16, marginBottom: 16 },
  detailRow:      { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  // letterSpacing intentionally 0 — these are plain labels ("Dates", "Travellers"), not badges
  detailLabel:    { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.teal, width: 124, flexShrink: 0, paddingTop: 0.5 },
  detailValue:    { fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal, flex: 1, lineHeight: 1.55 },
  detailBoxLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 12 },
  accommodationTitle: { fontFamily: 'Times-Bold', fontSize: 11, color: C.charcoal, marginBottom: 2 },
  accommodationMeta:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },
  accommodationRef:   { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.teal },

  // ── Ordered stop list (replaces the abstract SVG map) ───────────────────────
  stopListLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 12 },
  stopListRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8, breakInside: 'avoid' },
  stopListNum:   { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.gold, width: 20, flexShrink: 0 },
  stopListDay:   { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1, color: C.teal, width: 46, flexShrink: 0, paddingTop: 1.5 },
  stopListTime:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, width: 40, flexShrink: 0, paddingTop: 1 },
  stopListTitle: { fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal, flex: 1, lineHeight: 1.4 },
  summaryText:   { fontFamily: 'Helvetica', fontSize: 10, color: C.muted, lineHeight: 1.75, marginBottom: 20 },

  // ── Day pages ──────────────────────────────────────────────────────────────
  dayPage:       { backgroundColor: C.white },
  dayDivider:    { borderTopWidth: 1, borderTopColor: C.border, marginTop: 26, marginBottom: 20 },
  dayImg:        { width: '100%', height: 205, objectFit: 'cover', objectPosition: 'center', breakInside: 'avoid' },
  // No breakInside here — this wraps ALL days now, and must be allowed to
  // split across physical pages so several short days can share a page.
  dayBody:       { paddingHorizontal: 48, paddingTop: 22, paddingBottom: 24 },
  dayChip:       { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.gold, marginBottom: 7 },
  dayTitle:      { fontFamily: 'Times-Bold', fontSize: 21, color: C.charcoal, lineHeight: 1.22, widows: 2, orphans: 2 },
  dayRule:       { width: 26, height: 1.5, backgroundColor: C.gold, marginTop: 12, marginBottom: 14 },
  dayDesc:       { fontFamily: 'Helvetica', fontSize: 10, color: C.muted, lineHeight: 1.78, marginBottom: 14 },
  dayBulletRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 5, breakInside: 'avoid' },
  dayBulletDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: C.teal, marginTop: 3.5, flexShrink: 0 },
  dayBulletText: { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.58, flex: 1 },
  tipBox: {
    backgroundColor: C.mapBg, borderLeftWidth: 3, borderLeftColor: C.gold,
    borderRadius: 4, paddingHorizontal: 16, paddingVertical: 11, breakInside: 'avoid',
  },
  tipLabel:  { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.gold, marginBottom: 5 },
  tipText:   { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.65 },
  stayRow:   { flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, alignItems: 'center', breakInside: 'avoid' },
  stayLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 1.5, color: C.muted },
  stayValue: { fontFamily: 'Helvetica', fontSize: 10, color: C.charcoal },

  // ── Personalisation sections ───────────────────────────────────────────────
  personalDivider:      { borderTopWidth: 0.75, borderTopColor: C.border, marginTop: 18, marginBottom: 14 },
  personalSectionLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 8 },

  // Booking card — structured labelled rows instead of a raw text dump
  bookingCard: {
    borderWidth: 0.75, borderColor: C.border, borderRadius: 3,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8, breakInside: 'avoid',
  },
  bookingTypePill: {
    backgroundColor: C.teal, paddingVertical: 2, paddingHorizontal: 5,
    borderRadius: 2, alignSelf: 'flex-start', marginBottom: 5,
  },
  bookingTypePillText: { fontFamily: 'Helvetica-Bold', fontSize: 6, letterSpacing: 0.8, color: C.white },
  bookingTitle:    { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.charcoal, marginBottom: 4 },
  bookingMeta:     { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },
  fieldRow:        { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  fieldLabel:      { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.muted, width: 84, flexShrink: 0 },
  fieldValue:      { fontFamily: 'Helvetica', fontSize: 9, color: C.charcoal, flex: 1, lineHeight: 1.45 },
  bookingRef:      { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.teal },
  bulletHeading:   { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.muted, marginTop: 4, marginBottom: 3 },
  bulletRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 2 },
  bulletDot:       { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.teal, marginTop: 4, flexShrink: 0 },
  bulletText:      { fontFamily: 'Helvetica', fontSize: 9, color: C.charcoal, lineHeight: 1.45, flex: 1 },

  // Added item (user TripItem) — no image / compact fallback
  addedCard: {
    backgroundColor: '#F7F4EE', borderLeftWidth: 2, borderLeftColor: C.teal,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, breakInside: 'avoid',
  },
  addedBadge: { fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.5, color: C.teal, marginBottom: 3 },
  addedTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10, color: C.charcoal, marginBottom: 2 },
  addedMeta:  { fontFamily: 'Helvetica', fontSize: 9, color: C.muted, lineHeight: 1.5 },

  // Consolidated activity card (stop/item + its booking, image right when available)
  activityCard: {
    borderWidth: 0.75, borderColor: C.border, borderRadius: 4,
    backgroundColor: C.white, marginBottom: 8, breakInside: 'avoid', overflow: 'hidden',
  },
  activityCardBody:  { paddingHorizontal: 12, paddingVertical: 9 },
  activityBadge:     { fontFamily: 'Helvetica-Bold', fontSize: 6.5, letterSpacing: 1.5, color: C.teal, marginBottom: 3 },
  activityTitle:     { fontFamily: 'Helvetica-Bold', fontSize: 10.5, color: C.charcoal, marginBottom: 3 },
  activityTimePill: {
    backgroundColor: C.mapBg, paddingVertical: 2, paddingHorizontal: 6,
    borderRadius: 2, alignSelf: 'flex-start', marginBottom: 4,
  },
  activityTimePillText: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: C.tealDark },
  activityImg: { position: 'absolute', top: 0, bottom: 0, right: 0, objectFit: 'cover' },

  // Note box
  noteBox:     { backgroundColor: '#FFFBF2', borderLeftWidth: 2, borderLeftColor: C.gold, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, breakInside: 'avoid' },
  noteLabel:   { fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 1.5, color: '#9B7B3A', marginBottom: 3 },
  noteContent: { fontFamily: 'Helvetica', fontSize: 9.5, color: C.charcoal, lineHeight: 1.6, marginBottom: 4 },
  noteLink:    { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.teal, textDecoration: 'underline' },

  // Page number
  pageNum: { position: 'absolute', bottom: 18, right: 48, fontFamily: 'Helvetica', fontSize: 8, color: C.muted },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function imgUrl(src) {
  if (!src || typeof src !== 'string') return null;
  if (!src.startsWith('http')) return src;
  return `${src.replace(/\?.*/, '')}?w=1000&q=85`;
}

// Parse a date string to a local Date, avoiding UTC midnight → previous-day shift.
// "2026-06-04" or "2026-06-04T00:00:00.000Z" → Date(2026, 5, 4) in local time.
function parseDateLocal(iso) {
  if (!iso) return null;
  const s = typeof iso === 'string' ? iso : (iso instanceof Date ? iso.toISOString() : String(iso));
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}

function formatDate(iso) {
  const d = parseDateLocal(iso);
  if (!d || isNaN(d)) return String(iso || '');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Real calendar date for a given 1-based trip day number, derived from trip.startDate.
function getDayDateLabel(dayNumber, trip) {
  if (!dayNumber || !trip?.startDate) return null;
  const base = parseDateLocal(trip.startDate);
  if (!base || isNaN(base)) return null;
  base.setDate(base.getDate() + (dayNumber - 1));
  return base.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Compute a booking's display date.
// Priority: dayNumber + trip.startDate (avoids UTC midnight timezone shift on stored dates) > booking.date
function getBookingDateLabel(booking, trip) {
  return getDayDateLabel(booking.dayNumber, trip) || (booking.date ? formatDate(booking.date) : null);
}

function normalizeContentDay(d) {
  if (!d) return null;
  return {
    dayNumber:   d.dayNumber || d.day || 0,
    title:       d.title || '',
    description: d.desc || d.description || '',
    route:       d.route || d.title || '',
    bullets:     d.bullets || d.highlights || [],
    tip:         d.tip || d.insiderTip || '',
    stay:        d.stay || '',
    // imgs are injected by downloadPersonalisedPDF after base64 resolution
    imgs:        d.imgs || [],
  };
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StarMark({ size = 12, color = C.gold }) {
  return (
    <Svg width={size} height={size} viewBox="0 2 20 20">
      <Polygon points="10,2 12,10 20,12 12,14 10,22 8,14 0,12 8,10" fill={color} />
    </Svg>
  );
}

// `fixed` repeats this header on every physical page produced when its parent
// <Page> element's content overflows — used on the merged, multi-day page so
// several days can share physical pages while the header still repeats.
function RunHeader({ country, title, badge, fixed = false }) {
  const c = (country || '').toUpperCase();
  const t = (title || '').toUpperCase();
  const right = badge || (c && t ? `${c} — ${t}` : c || t);
  return (
    <View style={s.header} fixed={fixed}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StarMark size={11} color={C.gold} />
        <Text style={s.headerBrand}>HiddenAtlas</Text>
      </View>
      <Text style={s.headerSection}>{right}</Text>
    </View>
  );
}

function formatDurationMinutes(mins) {
  const m = Number(mins);
  if (!m) return null;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}

// Renders text with any "#"-prefixed lines turned into a bulleted list (and,
// when present, the plain line right before them as the block's heading) —
// used for booking.notes instead of a raw text dump.
function BulletedNotes({ text }) {
  if (!text) return null;
  const { intro, sections } = parseNoteBulletSections(text);
  return (
    <>
      {intro ? <Text style={s.fieldValue}>{intro}</Text> : null}
      {sections.map((sec, i) => (
        <View key={i} style={{ marginTop: i === 0 && !intro ? 0 : 2 }}>
          {sec.heading ? <Text style={s.bulletHeading}>{sec.heading}:</Text> : null}
          {sec.items.map((item, j) => (
            <View key={j} style={s.bulletRow}>
              <View style={s.bulletDot} />
              <Text style={s.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ))}
    </>
  );
}

// Renders linkified text as inline runs — plain text stays as-is, URLs become
// short clickable labels via <Link> instead of printing the raw address.
function LinkifiedText({ text, textStyle, linkStyle }) {
  if (!text) return null;
  const parts = linkifyText(text);
  if (!parts.some(p => p.type === 'link')) return <Text style={textStyle}>{text}</Text>;
  return (
    <Text style={textStyle}>
      {parts.map((part, i) => part.type === 'link'
        ? <Link key={i} src={part.url} style={linkStyle}>{part.label}</Link>
        : <Text key={i}>{part.value}</Text>
      )}
    </Text>
  );
}

// Structured booking card: labelled fields (time, meeting point, reference,
// contact) instead of a raw text dump, with "#"-prefixed note lines rendered
// as bullets (e.g. "What's included").
function BookingCard({ booking, trip }) {
  const meta      = booking.metadata || {};
  const dateLabel = getBookingDateLabel(booking, trip);
  const timeLabel = booking.time;
  const dateTimeLine = [dateLabel, timeLabel].filter(Boolean).join(' · ');
  const adults    = meta.adults || meta.guests || meta.pax;
  const paid      = meta.totalAmount || meta.amount;
  const currency  = meta.currency || '';
  const meetingPoint = booking.locationName || booking.address || null;

  return (
    <View style={s.bookingCard} wrap={false}>
      <View style={s.bookingTypePill}>
        <Text style={s.bookingTypePillText}>{(booking.type || 'BOOKING').toUpperCase()}</Text>
      </View>
      <Text style={s.bookingTitle}>{booking.title}</Text>

      {dateTimeLine ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Time</Text>
          <Text style={s.fieldValue}>{dateTimeLine}</Text>
        </View>
      ) : null}
      {meta.checkInDate ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Check-in</Text>
          <Text style={s.fieldValue}>
            {meta.checkInDate}{meta.checkInTime ? ` at ${meta.checkInTime}` : ''}
            {meta.checkOutDate ? `  ·  Check-out: ${meta.checkOutDate}` : ''}
          </Text>
        </View>
      ) : null}
      {meetingPoint ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Meeting point</Text>
          <Text style={s.fieldValue}>{meetingPoint}</Text>
        </View>
      ) : null}
      {booking.confirmationReference ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Reference</Text>
          <Text style={s.bookingRef}>{booking.confirmationReference}</Text>
        </View>
      ) : null}
      {(booking.provider || booking.url) ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Contact</Text>
          {booking.url ? (
            <Link src={booking.url} style={[s.fieldValue, { color: C.teal, textDecoration: 'underline' }]}>
              {booking.provider || 'View booking'}
            </Link>
          ) : (
            <Text style={s.fieldValue}>{booking.provider}</Text>
          )}
        </View>
      ) : null}
      {adults && paid ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Party</Text>
          <Text style={s.fieldValue}>{adults} {Number(adults) === 1 ? 'person' : 'people'} · Paid: {paid} {currency}</Text>
        </View>
      ) : adults ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Party</Text>
          <Text style={s.fieldValue}>{adults} {Number(adults) === 1 ? 'person' : 'people'}</Text>
        </View>
      ) : paid ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Paid</Text>
          <Text style={s.fieldValue}>{paid} {currency}</Text>
        </View>
      ) : null}
      {booking.notes ? <BulletedNotes text={booking.notes} /> : null}
    </View>
  );
}

// Car rental / transport structured card
function CarRentalCard({ booking }) {
  const meta = booking.metadata || {};
  return (
    <View style={s.bookingCard} wrap={false}>
      <View style={[s.bookingTypePill, { backgroundColor: '#4A3A7A' }]}>
        <Text style={s.bookingTypePillText}>CAR RENTAL</Text>
      </View>
      <Text style={s.bookingTitle}>{booking.title}</Text>
      {booking.confirmationReference ? <Text style={s.bookingRef}>Booking code: {booking.confirmationReference}</Text> : null}
      {meta.pickupDate && (
        <Text style={s.bookingMeta}>
          Pickup: {meta.pickupDate}{meta.pickupTime ? ' at ' + meta.pickupTime : ''}{meta.pickupLocation ? ' · ' + meta.pickupLocation : ''}
        </Text>
      )}
      {meta.returnDate && (
        <Text style={s.bookingMeta}>
          Return: {meta.returnDate}{meta.returnTime ? ' at ' + meta.returnTime : ''}{meta.returnLocation ? ' · ' + meta.returnLocation : ''}
        </Text>
      )}
      {meta.carType && <Text style={s.bookingMeta}>Vehicle: {meta.carType}{meta.extras ? ' · ' + meta.extras : ''}</Text>}
      {(meta.totalAmount || meta.amount) && (
        <Text style={s.bookingMeta}>Paid: {meta.totalAmount || meta.amount} {meta.currency || ''}</Text>
      )}
    </View>
  );
}

// Detect if a booking is a car rental (explicit metadata or text patterns in title/notes)
function isCarRental(b) {
  if (b.type === 'transfer') return false;
  const meta  = b.metadata || {};
  const title = (b.title || '').toLowerCase();
  const notes = (b.notes || '').toLowerCase();
  if (meta.pickupDate || meta.returnDate || meta.carType) return true;
  if (title.includes('car rental') || title.includes('rent a car') || title.includes('car hire') ||
      title.includes('rent-a-car') || title.includes('alquiler')) return true;
  // Notes-based detection: pasted car rental confirmation (pickup + return mentioned)
  const hasPickup = notes.includes('pickup') || notes.includes('pick up') || notes.includes('recogida') || notes.includes('pick-up');
  const hasReturn = notes.includes('return') || notes.includes('devolucion') || notes.includes('dropoff') || notes.includes('drop off');
  if (hasPickup && hasReturn) return true;
  return false;
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

// One consolidated card per activity that has both an itinerary stop/user
// item AND a linked booking — replaces separately showing the bare stop/item
// title AND a duplicate booking card for the same real-world activity.
// `primary` is the stop or item (name/location/duration source); `bookings`
// are its linked TripBooking row(s) (date/time/reference/notes/contact source).
function ConsolidatedActivityCard({ primary, bookings = [], trip }) {
  const booking      = bookings[0] || null;
  const extraBookings = bookings.slice(1);
  const meta          = booking?.metadata || {};

  const title       = primary?.title || booking?.title || 'Activity';
  const dateLabel   = booking ? getBookingDateLabel(booking, trip) : null;
  const timeLabel   = primary?.suggestedTime || primary?.startTime || booking?.time || meta.checkInTime || null;
  const durationLabel = primary?.durationMinutes ? formatDurationMinutes(primary.durationMinutes) : null;
  const timePill    = [dateLabel, timeLabel].filter(Boolean).join(' · ') || timeLabel;
  const location    = primary?.locationName || booking?.locationName || booking?.address || null;
  const notesText    = booking?.notes || primary?.notes || primary?.description || null;
  const imageUrl     = primary?.imageUrl ? imgUrl(primary.imageUrl) : null;

  const body = (
    <View style={s.activityCardBody}>
      <Text style={s.activityBadge}>ACTIVITY</Text>
      <Text style={s.activityTitle}>{title}</Text>
      {(timePill || durationLabel) ? (
        <View style={s.activityTimePill}>
          <Text style={s.activityTimePillText}>{[timePill, durationLabel].filter(Boolean).join('  ·  ')}</Text>
        </View>
      ) : null}
      {location ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Location</Text>
          <Text style={s.fieldValue}>{location}</Text>
        </View>
      ) : null}
      {booking?.confirmationReference ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Reference</Text>
          <Text style={s.bookingRef}>{booking.confirmationReference}</Text>
        </View>
      ) : null}
      {(booking?.provider || booking?.url) ? (
        <View style={s.fieldRow}>
          <Text style={s.fieldLabel}>Contact</Text>
          {booking.url ? (
            <Link src={booking.url} style={[s.fieldValue, { color: C.teal, textDecoration: 'underline' }]}>
              {booking.provider || 'View booking'}
            </Link>
          ) : (
            <Text style={s.fieldValue}>{booking.provider}</Text>
          )}
        </View>
      ) : null}
      {notesText ? <BulletedNotes text={notesText} /> : null}
      {extraBookings.map(b => (
        <View key={b.id} style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.border }}>
          <Text style={[s.fieldValue, { fontFamily: 'Helvetica-Bold' }]}>{b.title}</Text>
          {b.confirmationReference ? <Text style={s.bookingRef}>{b.confirmationReference}</Text> : null}
        </View>
      ))}
    </View>
  );

  if (!imageUrl) {
    return <View style={s.activityCard} wrap={false}>{body}</View>;
  }
  return (
    <View style={[s.activityCard, { position: 'relative', minHeight: ACTIVITY_MIN_H }]} wrap={false}>
      <View style={{ paddingRight: ACTIVITY_IMG_W }}>{body}</View>
      <Image src={imageUrl} style={[s.activityImg, { width: ACTIVITY_IMG_W }]} />
    </View>
  );
}

function NoteBox({ note }) {
  const lines = (note.content || '').split(/\r?\n/).filter(l => l.trim().length > 0);
  return (
    <View style={s.noteBox} wrap={false}>
      {note.title ? <Text style={s.noteLabel}>{note.title.toUpperCase()}</Text> : null}
      {lines.length > 0
        ? lines.map((line, i) => (
          <LinkifiedText key={i} text={line} textStyle={s.noteContent} linkStyle={s.noteLink} />
        ))
        : <Text style={s.noteContent}>{note.content}</Text>}
    </View>
  );
}

// ── Page components ───────────────────────────────────────────────────────────

function PersonalisedCoverPage({ itinerary, trip }) {
  const { title = '', subtitle = '', country = '', region, duration = '', nights, coverImage } = itinerary;
  const durationLabel = nights ? `${duration.replace(/\bdays?\b/i, 'Days')} • ${nights} Nights` : duration;
  const hero = imgUrl(coverImage);
  const hasDates      = trip?.startDate || trip?.endDate;
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

// Merged "your journey" page: title/dates/duration banner, an ordered stop
// list (day → time → real sequence — replaces the abstract SVG route map,
// since this project has no static-map API to render real geography), a
// short trip summary, and journey highlights. One page instead of a near-empty
// "Expedition Route" banner page followed by a separate map page.
function JourneyAndRoutePage({ itinerary, trip, orderedStops = [] }) {
  const { title = '', country = '', region, duration = '', nights, description = '' } = itinerary;
  const durationLabel = nights ? `${duration.replace(/\bdays?\b/i, 'Days')} • ${nights} Nights` : duration;
  const highlights = itinerary.highlights || [];

  return (
    <Page size="A4" style={s.mapPage}>
      <RunHeader country={country} title={title} badge="YOUR JOURNEY" />

      <View style={s.mapBanner}>
        <Text style={s.mapBannerEyebrow}>YOUR JOURNEY</Text>
        <Text style={s.mapBannerTitle}>{title || 'Your Route'}</Text>
        <Text style={s.mapBannerSub}>
          {country}{region ? ` · ${region}` : ''}{duration ? `  ·  ${durationLabel}` : ''}
        </Text>
      </View>

      {/* Personal dates + travellers inline */}
      {(trip?.startDate || trip?.travellers) ? (
        <View style={{ paddingHorizontal: 48, paddingTop: 10, paddingBottom: 4, borderBottomWidth: 0.5, borderBottomColor: C.border, flexDirection: 'row', gap: 24 }}>
          {trip.startDate ? (
            <Text style={{ fontFamily: 'Helvetica', fontSize: 9, color: C.muted }}>
              {formatDate(trip.startDate)}{trip.endDate ? ` – ${formatDate(trip.endDate)}` : ''}
            </Text>
          ) : null}
          {trip.travellers ? (
            <Text style={{ fontFamily: 'Helvetica', fontSize: 9, color: C.muted }}>
              {trip.travellers} traveller{Number(trip.travellers) !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 48, paddingTop: 20 }}>
        {description ? <Text style={s.summaryText}>{description}</Text> : null}

        {orderedStops.length > 0 ? (
          <View style={{ marginBottom: highlights.length > 0 ? 20 : 0 }}>
            <Text style={s.stopListLabel}>YOUR ROUTE, IN ORDER</Text>
            {orderedStops.map((stop, i) => (
              <View key={i} style={s.stopListRow}>
                <Text style={s.stopListNum}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={s.stopListDay}>DAY {stop.dayNumber}</Text>
                <Text style={s.stopListTime}>{stop.time || ''}</Text>
                <Text style={s.stopListTitle}>{stop.title}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {highlights.length > 0 ? (
          <View style={{ paddingBottom: 8 }}>
            <Text style={s.mapHlLabel}>JOURNEY HIGHLIGHTS</Text>
            <View style={s.mapHlGrid}>
              {highlights.slice(0, 6).map((h, i) => (
                <View key={i} style={s.mapHlItem}>
                  <View style={s.mapHlDot} />
                  <Text style={s.mapHlText}>{typeof h === 'string' ? h : String(h)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// Polished trip details + hotel bookings + car rental
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

  const carRentals = (tripBookings || []).filter(b => isCarRental(b));

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
          {trip.startDate ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Dates</Text>
              <Text style={s.detailValue}>
                {formatDate(trip.startDate)}{trip.endDate ? ` – ${formatDate(trip.endDate)}` : ''}
              </Text>
            </View>
          ) : null}
          {trip.travellers ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Travellers</Text>
              <Text style={s.detailValue}>{trip.travellers}</Text>
            </View>
          ) : null}
          {/* Only shown when there's no actual hotel booking below — the booking's own
              title is the source of truth for the accommodation name (avoids showing
              two differently-typed variants of the same hotel in this document). */}
          {trip.accommodationSummary && hotelBookings.length === 0 ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Accommodation</Text>
              <Text style={s.detailValue}>{trip.accommodationSummary}</Text>
            </View>
          ) : null}
          {trip.arrivalInfo ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Arrival</Text>
              <Text style={s.detailValue}>{trip.arrivalInfo}</Text>
            </View>
          ) : null}
          {trip.departureInfo ? (
            <View style={s.detailRow}>
              <Text style={s.detailLabel}>Departure</Text>
              <Text style={s.detailValue}>{trip.departureInfo}</Text>
            </View>
          ) : null}
          {trip.generalNotes ? (
            <View style={[s.detailRow, { marginBottom: 0 }]}>
              <Text style={s.detailLabel}>Notes</Text>
              <Text style={s.detailValue}>{trip.generalNotes}</Text>
            </View>
          ) : null}
        </View>

        {/* Hotel bookings summary */}
        {hotelBookings.length > 0 ? (
          <View style={{ marginTop: 4, marginBottom: carRentals.length > 0 ? 16 : 0 }}>
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
                  {meta.checkInDate ? (
                    <Text style={s.accommodationMeta}>
                      Check-in: {meta.checkInDate}{meta.checkInTime ? ` at ${meta.checkInTime}` : ''}
                      {meta.checkOutDate ? `  ·  Check-out: ${meta.checkOutDate}` : ''}
                    </Text>
                  ) : null}
                  {b.locationName ? <Text style={s.accommodationMeta}>{b.locationName}</Text> : null}
                  {b.address ? <Text style={s.accommodationMeta}>{b.address}</Text> : null}
                  {b.confirmationReference ? (
                    <Text style={s.accommodationRef}>Ref: {b.confirmationReference}</Text>
                  ) : null}
                  {b.notes ? <BulletedNotes text={b.notes} /> : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Car rental / transport logistics */}
        {carRentals.length > 0 ? (
          <View style={{ marginTop: 4 }}>
            <Text style={[s.detailBoxLabel, { marginBottom: 10 }]}>TRANSPORT & LOGISTICS</Text>
            {carRentals.map(b => <CarRentalCard key={b.id} booking={b} />)}
          </View>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// One day's content as a <View> (not a <Page>) so several days can share a
// physical page — see the merged, continuous day <Page> in the main export.
// Stops/items with a linked booking render as a single ConsolidatedActivityCard
// (name, date/time, duration, location, reference, notes, image) instead of
// showing the plain stop/item AND a separate booking card for the same thing.
function DaySection({ tripDay, contentDay, dayStops, hiddenStopIds, dayItems, dayBookings, dayNotes, trip, accommodation, isFirst }) {
  const title       = tripDay.titleOverride || contentDay?.title || tripDay.title || `Day ${tripDay.dayNumber}`;
  const description = tripDay.descriptionOverride || contentDay?.description || tripDay.description || '';
  const tip         = contentDay?.tip || '';
  const stayName    = accommodation?.name || null;

  const visibleStops = (dayStops || [])
    .filter(s => !hiddenStopIds.includes(s.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const bullets = visibleStops.length > 0 ? [] : (contentDay?.bullets || []);

  // Filter out itinerary_item type (template copies) from user additions
  const userItems = (dayItems || []).filter(i => i.type !== 'itinerary_item');
  // Hotel/car-rental bookings live in TripDetailsPage, not on day pages
  const filteredBookings = (dayBookings || []).filter(b => b.type !== 'hotel' && !isCarRental(b));
  // Partition so a booking linked to a stop/item is never also shown standalone
  const { stopBookings, itemBookings, dayOnlyBookings } = partitionDayContent({
    visibleStops, dayItems: userItems, dayBookings: filteredBookings,
  });
  const hasPersonalContent = dayOnlyBookings.length > 0 || userItems.length > 0 || dayNotes.length > 0;

  // Day images — prefer imgs from resolved content day (base64 from download utility)
  const imgs = (contentDay?.imgs || []).map(imgUrl).filter(Boolean);

  return (
    <View>
      {!isFirst ? <View style={s.dayDivider} /> : null}

      {imgs.length === 2 ? (
        <View style={{ flexDirection: 'row', width: '100%', height: 205, breakInside: 'avoid', marginBottom: 18 }}>
          <Image src={imgs[0]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
          <Image src={imgs[1]} style={{ width: '50%', height: 205, objectFit: 'cover', objectPosition: 'center' }} />
        </View>
      ) : imgs.length === 1 ? (
        <Image src={imgs[0]} style={[s.dayImg, { marginBottom: 18 }]} />
      ) : null}

      <View wrap={false}>
        <Text style={s.dayChip}>
          DAY {tripDay.dayNumber}{getDayDateLabel(tripDay.dayNumber, trip) ? ` · ${getDayDateLabel(tripDay.dayNumber, trip)}` : ''}
        </Text>
        <Text style={s.dayTitle}>{title}</Text>
        <View style={s.dayRule} />
        {description ? <Text style={s.dayDesc}>{description}</Text> : null}
      </View>

      {/* Places Today — plain bullet, or a consolidated card when a booking is linked */}
      {visibleStops.length > 0 ? (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7, letterSpacing: 2, color: C.teal, marginBottom: 8 }}>
            PLACES TODAY
          </Text>
          {visibleStops.map((stop, i) => {
            const linked = stopBookings[stop.id];
            if (linked?.length > 0) {
              return <ConsolidatedActivityCard key={stop.id} primary={stop} bookings={linked} trip={trip} />;
            }
            return (
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
            );
          })}
        </View>
      ) : null}

      {/* Legacy bullets fallback */}
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

      {tip ? (
        <View wrap={false} style={[s.tipBox, { marginBottom: 14 }]}>
          <Text style={s.tipLabel}>INSIDER TIP</Text>
          <Text style={s.tipText}>{tip}</Text>
        </View>
      ) : null}

      {stayName ? (
        <View style={s.stayRow} wrap={false}>
          <Text style={s.stayLabel}>TONIGHT'S STAY:</Text>
          <Text style={s.stayValue}>{stayName}</Text>
        </View>
      ) : null}

      {/* ── Personalisation section ── */}
      {hasPersonalContent ? (
        <View>
          <View style={s.personalDivider} />

          {userItems.length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              <View wrap={false}>
                <Text style={s.personalSectionLabel}>YOUR ADDITIONS</Text>
                {itemBookings[userItems[0].id]?.length > 0
                  ? <ConsolidatedActivityCard primary={userItems[0]} bookings={itemBookings[userItems[0].id]} trip={trip} />
                  : <AddedItemCard item={userItems[0]} />}
              </View>
              {userItems.slice(1).map(item => (
                itemBookings[item.id]?.length > 0
                  ? <ConsolidatedActivityCard key={item.id} primary={item} bookings={itemBookings[item.id]} trip={trip} />
                  : <AddedItemCard key={item.id} item={item} />
              ))}
            </View>
          ) : null}

          {dayOnlyBookings.length > 0 ? (
            <View style={{ marginBottom: 10 }}>
              {/* Keep section label + first card together to prevent orphan headers */}
              <View wrap={false}>
                <Text style={s.personalSectionLabel}>YOUR BOOKINGS TODAY</Text>
                <BookingCard booking={dayOnlyBookings[0]} trip={trip} />
              </View>
              {dayOnlyBookings.slice(1).map(b => <BookingCard key={b.id} booking={b} trip={trip} />)}
            </View>
          ) : null}

          {dayNotes.length > 0 ? (
            <View>
              <View wrap={false}>
                <Text style={s.personalSectionLabel}>YOUR NOTES</Text>
                <NoteBox note={dayNotes[0]} />
              </View>
              {dayNotes.slice(1).map(n => <NoteBox key={n.id} note={n} />)}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// General notes + trip-level bookings (flights, transfers, non-car-rental others)
function MyNotesPage({ itinerary, tripNotes, tripBookings }) {
  const generalNotes = (tripNotes || []).filter(n => !n.tripDayId && n.content);
  const tripLevelBookings = (tripBookings || [])
    .filter(b => !b.tripDayId && b.type !== 'hotel' && !isCarRental(b))
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
        {tripLevelBookings.length > 0 ? (
          <View style={{ marginBottom: generalNotes.length > 0 ? 28 : 0 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 }}>
              TRIP BOOKINGS
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: C.gold, marginBottom: 18 }} />
            {tripLevelBookings.map(b => <BookingCard key={b.id} booking={b} />)}
          </View>
        ) : null}

        {generalNotes.length > 0 ? (
          <View>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.5, letterSpacing: 2.5, color: C.teal, marginBottom: 14 }}>
              MY NOTES
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: C.gold, marginBottom: 18 }} />
            {generalNotes.map(n => <NoteBox key={n.id} note={n} />)}
          </View>
        ) : null}
      </View>

      <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
    </Page>
  );
}

// Soft closing page — replaces the "Ready to make this trip yours?" CTA
function PersonalisedClosingPage({ itinerary }) {
  return (
    <Page size="A4" style={{ backgroundColor: C.tealDark }}>
      <View style={{ flex: 1, paddingHorizontal: 64, paddingTop: 80, paddingBottom: 60, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 52 }}>
          <StarMark size={18} color={C.gold} />
          <View style={{ width: 10 }} />
          <Text style={{ fontFamily: 'Times-Bold', fontSize: 13, color: C.white, letterSpacing: 3 }}>HIDDEN</Text>
          <Text style={{ fontFamily: 'Times-Bold', fontSize: 13, color: C.gold, letterSpacing: 3 }}>ATLAS</Text>
        </View>

        <Text style={{ fontFamily: 'Times-Bold', fontSize: 36, color: C.white, lineHeight: 1.22, marginBottom: 6 }}>
          Your trip,{'\n'}ready to go.
        </Text>
        <View style={{ width: 44, height: 1.5, backgroundColor: C.gold, marginTop: 18, marginBottom: 24 }} />
        <Text style={{ fontFamily: 'Helvetica', fontSize: 11.5, color: 'rgba(255,255,255,0.68)', lineHeight: 1.8, marginBottom: 40, maxWidth: 400 }}>
          This is your personalised guide for {itinerary.title || 'this journey'}.{'\n'}
          May every stop be worth the detour.
        </Text>
        <Text style={{ fontFamily: 'Helvetica', fontSize: 8.5, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
          {[itinerary.title, itinerary.country].filter(Boolean).join(' · ')}{'  ·  '}Personalised guide{'  ·  '}hiddenatlas.travel
        </Text>
      </View>
    </Page>
  );
}

// ── Main document ─────────────────────────────────────────────────────────────
export default function PersonalisedItineraryPDF({ itinerary, personalisationContext = {} }) {
  const {
    trip              = {},
    tripDays          = [],
    tripItems         = [],
    tripNotes         = [],
    tripBookings      = [],
    hiddenStopIds     = [],
    orderedStops      = [],
    accommodationByDay = {},
  } = personalisationContext;

  const itineraryDayStops = itinerary.dayStops || [];

  // Content days with images — itinerary.days is the resolved array (with base64 imgs),
  // content.days is the raw JSON without images. Prefer itinerary.days.
  const content     = itinerary.content || {};
  const contentDays = (itinerary.days || content.days || []).map(normalizeContentDay).filter(Boolean);
  const contentDayMap = {};
  for (const d of contentDays) contentDayMap[d.dayNumber] = d;

  // Sorted trip days
  const sortedDays = [...tripDays].sort((a, b) =>
    (a.sortOrder ?? a.dayNumber) - (b.sortOrder ?? b.dayNumber)
  );

  const pages = [
    <PersonalisedCoverPage key="cover" itinerary={itinerary} trip={trip} />,

    <JourneyAndRoutePage key="journey" itinerary={itinerary} trip={trip} orderedStops={orderedStops} />,

    <TripDetailsPage
      key="trip-details"
      itinerary={itinerary}
      trip={trip}
      tripBookings={tripBookings}
    />,

    // All days as siblings inside ONE continuous <Page> — react-pdf only starts
    // a new physical page when this flow actually overflows, so several short
    // days share a page instead of each getting its own, near-empty page.
    sortedDays.length > 0 ? (
      <Page key="days" size="A4" style={s.dayPage}>
        <RunHeader country={itinerary.country} title={itinerary.title} fixed />
        <View style={s.dayBody}>
          {sortedDays.map((tripDay, i) => {
            const contentDay  = contentDayMap[tripDay.dayNumber] || null;
            const dayStops    = itineraryDayStops.filter(s => s.dayNumber === tripDay.dayNumber);
            const dayItems    = tripItems.filter(i2 => i2.tripDayId === tripDay.id);
            const dayBookings = tripBookings.filter(b => b.tripDayId === tripDay.id);
            const dayNotes    = tripNotes.filter(n => n.tripDayId === tripDay.id);
            return (
              <DaySection
                key={tripDay.id}
                tripDay={tripDay}
                contentDay={contentDay}
                dayStops={dayStops}
                hiddenStopIds={hiddenStopIds}
                dayItems={dayItems}
                dayBookings={dayBookings}
                dayNotes={dayNotes}
                trip={trip}
                accommodation={accommodationByDay[tripDay.dayNumber] || null}
                isFirst={i === 0}
              />
            );
          })}
        </View>
        <Text style={s.pageNum} render={({ pageNumber }) => String(pageNumber)} fixed />
      </Page>
    ) : null,

    <MyNotesPage
      key="notes"
      itinerary={itinerary}
      tripNotes={tripNotes}
      tripBookings={tripBookings}
    />,

    <PersonalisedClosingPage key="closing" itinerary={itinerary} />,
  ].filter(Boolean);

  return (
    <Document
      title={`${itinerary.title || 'My Journey'} — My HiddenAtlas Guide`}
      author="HiddenAtlas"
      subject={`${itinerary.title || 'My Journey'} — Personalised Travel Guide`}
      keywords="travel, itinerary, personalised, HiddenAtlas"
      hyphenationCallback={word => [word]}
    >
      {pages}
    </Document>
  );
}
