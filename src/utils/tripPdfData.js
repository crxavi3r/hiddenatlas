/**
 * tripPdfData
 *
 * Pure, framework-agnostic helpers used by the personalised "My Trips" PDF
 * pipeline (downloadPersonalisedPDF.js + PersonalisedItineraryPDF.jsx):
 *   - partitionDayContent / matchBookingToItem — dedup bookings vs stops/items
 *   - buildOrderedStopList — chronological stop list (replaces the abstract SVG map)
 *   - resolveAccommodationName — single source of truth for the hotel name shown
 *   - parseNoteBulletSections — turns "#"-prefixed lines into bullet lists
 *   - linkifyText — splits raw text into text/link runs for clickable URLs
 *   - validatePersonalisedPdfData — lightweight pre-render data checks
 */

// ── Dedup: bookings vs itinerary stops / user items ──────────────────────────

export function normalizeTitle(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fallback matcher used when a booking has neither metadata.itineraryDayStopId
// nor tripItemId set — same title (or booking title vs item location) and,
// when both sides have a time, the same time. Caller already scopes `items`
// to the same day, so no date comparison is needed here.
export function matchBookingToItem(booking, items) {
  const bTime  = booking.time || booking.metadata?.checkInTime || null;
  const bTitle = normalizeTitle(booking.title);
  const bLoc   = normalizeTitle(booking.locationName);
  if (!bTitle && !bLoc) return null;

  return items.find(item => {
    const iTitle = normalizeTitle(item.title);
    const iLoc   = normalizeTitle(item.locationName);
    const titleMatches = (bTitle && (iTitle === bTitle || (iLoc && bTitle === iLoc)))
      || (bLoc && iTitle === bLoc);
    if (!titleMatches) return false;
    if (bTime && item.startTime) return bTime === item.startTime;
    return true;
  }) || null;
}

// Splits one day's bookings into three buckets so a booking linked to a stop
// or item is never also rendered as a standalone "booking" card:
//   stopBookings[stopId]  — booking.metadata.itineraryDayStopId matches a visible stop
//   itemBookings[itemId]  — booking.tripItemId matches a user item, or (fallback)
//                            same time + normalized title match
//   dayOnlyBookings       — everything else (a true standalone booking for the day)
export function partitionDayContent({ visibleStops = [], dayItems = [], dayBookings = [] }) {
  const stopBookings = {};
  const itemBookings = {};
  const dayOnlyBookings = [];
  const candidateItems = dayItems.filter(i => i.type !== 'itinerary_item');

  dayBookings.forEach(b => {
    const sid = b.metadata?.itineraryDayStopId;
    const iid = b.tripItemId;

    if (sid && visibleStops.some(s => s.id === sid)) {
      (stopBookings[sid] = stopBookings[sid] || []).push(b);
      return;
    }
    if (iid && candidateItems.some(i => i.id === iid)) {
      (itemBookings[iid] = itemBookings[iid] || []).push(b);
      return;
    }
    const fallback = matchBookingToItem(b, candidateItems);
    if (fallback) {
      (itemBookings[fallback.id] = itemBookings[fallback.id] || []).push(b);
      return;
    }
    dayOnlyBookings.push(b);
  });

  return { stopBookings, itemBookings, dayOnlyBookings };
}

// ── Ordered stop list (replaces the abstract SVG route map) ─────────────────

// Day → time → real sequence, merging itinerary stops and user-added items.
// Entries without a time fall back to their stored sortOrder, preserving
// authoring order as the tiebreak.
export function buildOrderedStopList({ tripDays = [], itineraryDayStops = [], hiddenStopIds = [], tripItems = [] }) {
  const sortedDays = [...tripDays].sort((a, b) => (a.sortOrder ?? a.dayNumber) - (b.sortOrder ?? b.dayNumber));
  const rows = [];

  sortedDays.forEach(day => {
    const stops = itineraryDayStops
      .filter(s => s.dayNumber === day.dayNumber && !hiddenStopIds.includes(s.id))
      .map(s => ({ title: s.title, time: s.suggestedTime || null, sortOrder: s.sortOrder ?? 0 }));
    const items = (tripItems || [])
      .filter(i => i.tripDayId === day.id && !i.isHidden && i.type !== 'itinerary_item')
      .map(i => ({ title: i.title, time: i.startTime || null, sortOrder: 999 }));

    const merged = [...stops, ...items].sort((a, b) => {
      if (a.time && b.time) return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.sortOrder - b.sortOrder;
    });

    merged.forEach(m => rows.push({ dayNumber: day.dayNumber, title: m.title, time: m.time }));
  });

  return rows;
}

// ── Accommodation name resolution (single source of truth: the booking) ─────

// Same convention as TripDetailPage.jsx's calcDayNumber: local-midnight diff
// against trip.startDate, 1-based, null if either date is missing/invalid.
function toDayNumber(dateStr, tripStartDate) {
  if (!dateStr || !tripStartDate) return null;
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00Z');
  const start = new Date(String(tripStartDate).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d) || isNaN(start)) return null;
  const diff = Math.round((d.getTime() - start.getTime()) / 86400000);
  return diff < 0 ? null : diff + 1;
}

function bookingCoversDay(booking, dayNumber, tripStartDate) {
  const meta = booking.metadata || {};
  const checkIn = toDayNumber(meta.checkInDate, tripStartDate);
  if (checkIn == null) return false;
  const checkOut = toDayNumber(meta.checkOutDate, tripStartDate);
  if (checkOut == null) return dayNumber === checkIn;
  return dayNumber >= checkIn && dayNumber < checkOut;
}

// Priority: a TripBooking of type "hotel" covering this night (source of truth,
// per the traveller's actual reservation) > contentDay.stay (CMS recommendation)
// > trip.accommodationSummary (free-text fallback).
export function resolveAccommodationName({ hotelBookings = [], contentDay, trip, dayNumber, tripStartDate }) {
  const match = hotelBookings.find(b => bookingCoversDay(b, dayNumber, tripStartDate)) || null;
  if (match) return { name: match.title, source: 'booking', booking: match };
  if (contentDay?.stay) return { name: contentDay.stay, source: 'content' };
  if (trip?.accommodationSummary) return { name: trip.accommodationSummary, source: 'trip' };
  return null;
}

// ── Note section parser (headings + bullets + plain paragraphs) ─────────────

// A "heading" line is short and ends in ":" (e.g. "What's included:",
// "Meeting point:") and starts a new named section. Within a section, lines
// starting with "#" become bullet items (the "#" is stripped); any other
// line becomes wrapped paragraph text for that section. Lines before the
// first heading are returned as plain `intro` text. Supports multiple
// heading blocks in one note (e.g. "Instructions:" ... "Meeting point:" ...
// "What's included:" #bullet #bullet).
const HEADING_RE = /:\s*$/;
const MAX_HEADING_LEN = 60;

export function parseNoteBulletSections(text) {
  if (!text) return { intro: '', sections: [] };
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const sections = [];
  const introLines = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('#')) {
      const item = line.replace(/^#+\s*/, '').trim();
      if (!current) { current = { heading: '', items: [], paragraphs: [] }; sections.push(current); }
      if (item) current.items.push(item);
    } else if (HEADING_RE.test(line) && line.length <= MAX_HEADING_LEN) {
      current = { heading: line.replace(HEADING_RE, ''), items: [], paragraphs: [] };
      sections.push(current);
    } else if (current) {
      current.paragraphs.push(line);
    } else {
      introLines.push(line);
    }
  }

  return { intro: introLines.join(' '), sections };
}

// ── URL → clickable link runs ────────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s)]+/g;

function shortLinkLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const key  = host.split('.')[0];
    if (!key) return 'View link';
    return `View on ${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  } catch {
    return 'View link';
  }
}

// Splits text into an array of { type: 'text', value } / { type: 'link', url, label }
// runs so callers can render URLs as short clickable labels inline instead of
// printing the raw address. Pass `labelOverride` to force a specific label
// (e.g. a field-contextual one) instead of the generic hostname-based one.
export function linkifyText(text, labelOverride) {
  if (!text) return [];
  const parts = [];
  let lastIndex = 0;
  let match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text))) {
    const rawUrl = match[0].replace(/[.,;:)]+$/, '');
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    parts.push({ type: 'link', url: rawUrl, label: labelOverride || shortLinkLabel(rawUrl) });
    lastIndex = match.index + rawUrl.length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

// True when a field's whole value is itself a URL — callers should render a
// short clickable label instead of the raw address so it never overflows a
// card's width.
export function isUrlLike(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

// Context-aware short link label for a booking/activity field (Google Maps
// link, meeting point, contact, booking reference) — distinct from the
// generic hostname-based label used for freeform note text.
export function contextualLinkLabel(fieldKeyOrHeading, url) {
  const key = (fieldKeyOrHeading || '').toLowerCase();
  if (/maps\.google|google\.[a-z.]+\/maps|goo\.gl\/maps/i.test(url || '')) return 'Open in Google Maps';
  if (/encontro|meeting/.test(key)) return 'View meeting point';
  if (/contact|contacto/.test(key)) return 'View contact';
  if (/reserva|booking/.test(key)) return 'View booking';
  return shortLinkLabel(url);
}

// ── Pre-render validation (lightweight, data-level only) ────────────────────

const REPLACEMENT_CHAR_RE = /�/;

function hasCorruptedChars(str) {
  return typeof str === 'string' && REPLACEMENT_CHAR_RE.test(str);
}

// Runs a handful of cheap sanity checks on the data about to be rendered.
// Returns { warnings } — callers should console.warn and still proceed with
// the download; this is a diagnostic aid, not a hard gate.
export function validatePersonalisedPdfData({
  tripDays = [], tripNotes = [], tripBookings = [], orderedStops = [],
  resolvedItinerary = {}, computedDurationDays = null, coverImageRequested = false, coverImageResolved = true,
}) {
  const warnings = [];

  if (tripDays.length === 0) {
    warnings.push('No trip days found — the day-by-day section will be empty.');
  }

  const parsedDuration = parseInt(resolvedItinerary.duration, 10);
  if (computedDurationDays && parsedDuration && parsedDuration !== computedDurationDays) {
    warnings.push(`Duration mismatch: computed ${computedDurationDays} day(s) but itinerary.duration reads "${resolvedItinerary.duration}".`);
  }

  const dayNumbers = tripDays.map(d => d.dayNumber).sort((a, b) => a - b);
  dayNumbers.forEach((n, i) => {
    if (n !== i + 1) warnings.push(`Day numbering gap or duplicate near day ${n}.`);
  });

  [...tripNotes, ...tripBookings].forEach(entry => {
    const text = entry.content || entry.notes || '';
    if (!text) return;
    const label = entry.title || entry.id || 'entry';
    if (hasCorruptedChars(text)) warnings.push(`Corrupted characters detected in "${label}".`);
    const urlCount = (text.match(/https?:\/\//g) || []).length;
    if (urlCount > 0) {
      const linked = linkifyText(text).filter(p => p.type === 'link').length;
      if (linked < urlCount) warnings.push(`Not all URLs were linkified in "${label}".`);
    }
  });

  if (coverImageRequested && !coverImageResolved) {
    warnings.push('Cover image failed to resolve to base64.');
  }

  if (tripDays.length > 0 && orderedStops.length === 0) {
    warnings.push('Ordered stop list is empty despite having trip days — the route page may look sparse.');
  }

  return { warnings };
}
