// Calendar export helpers for TripBooking items.
// Generates Google Calendar URLs and ICS content client-side.

// Default durations in minutes per booking type
const DEFAULT_DURATION = {
  hotel:      1440, // 1 day (all-day handled separately)
  restaurant:   90,
  experience:   90,
  flight:      120,
  transfer:     60,
  event:        60,
  other:        60,
};

function pad(n) { return String(n).padStart(2, '0'); }

// Parse a "YYYY-MM-DD" date string into {year, month, day}
function parseDateStr(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

// Format a date as YYYYMMDD (all-day event)
function formatAllDay(s) {
  const p = parseDateStr(s);
  if (!p) return null;
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

// Format a datetime as YYYYMMDDTHHmmss (floating / local time)
function formatDateTime(dateStr, timeStr) {
  const p = parseDateStr(dateStr);
  if (!p) return null;
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(h || 0)}${pad(m || 0)}00`;
}

// Add minutes to a YYYYMMDDTHHmmss string (no timezone, simple arithmetic)
function addMinutes(dtStr, minutes) {
  // dtStr format: YYYYMMDDTHHmmss
  const year  = parseInt(dtStr.slice(0, 4));
  const month = parseInt(dtStr.slice(4, 6)) - 1;
  const day   = parseInt(dtStr.slice(6, 8));
  const hour  = parseInt(dtStr.slice(9, 11));
  const min   = parseInt(dtStr.slice(11, 13));
  const d = new Date(year, month, day, hour, min + minutes);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

// Escape ICS text fields
function icsEscape(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// Wrap long ICS lines at 75 bytes
function foldLine(line) {
  const bytes = [...line];
  const chunks = [];
  while (bytes.length > 75) {
    chunks.push(bytes.splice(0, 75).join(''));
  }
  chunks.push(bytes.join(''));
  return chunks.join('\r\n ');
}

/**
 * Determine whether a booking has enough date/time info to add to calendar.
 * Returns: 'ok' | 'date-only' (hotel) | 'missing'
 */
export function calendarReadiness(booking) {
  const meta = booking.metadata || {};
  if (booking.type === 'hotel') {
    // Hotels are OK with just checkInDate / date
    const start = meta.checkInDate || (booking.date ? booking.date.slice(0, 10) : null);
    if (start) return 'date-only';
    return 'missing';
  }
  if (booking.type === 'flight') {
    const dep = meta.departureDate || (booking.date ? booking.date.slice(0, 10) : null);
    if (dep) return 'ok';
    return 'missing';
  }
  // All others need at least a date
  const dateStr = booking.date ? booking.date.slice(0, 10) : null;
  if (!dateStr) return 'missing';
  return 'ok';
}

/**
 * Build the description string for a calendar event.
 */
function buildDescription(booking, tripName, itineraryDayStops = []) {
  const catLabel = { hotel: 'Hotel', restaurant: 'Restaurant', experience: 'Experience',
    flight: 'Flight', transfer: 'Transfer', event: 'Event', other: 'Other' }[booking.type] || booking.type;
  const lines = [];
  if (tripName) lines.push(`HiddenAtlas trip: ${tripName}`);

  // Linked stop context
  const stopId = booking.metadata?.itineraryDayStopId;
  if (stopId) {
    const stop = itineraryDayStops.find(s => s.id === stopId);
    if (stop) {
      const dayPart = booking.dayNumber ? `Day ${booking.dayNumber}` : null;
      lines.push(`Linked to: ${[dayPart, stop.title].filter(Boolean).join(' · ')}`);
    }
  }

  lines.push(`Type: ${catLabel}`);
  if (booking.provider)              lines.push(`Provider: ${booking.provider}`);
  if (booking.confirmationReference) lines.push(`Reference: ${booking.confirmationReference}`);
  if (booking.notes)                 lines.push(`Notes: ${booking.notes}`);
  if (booking.url)                   lines.push(`View booking: ${booking.url}`);
  return lines.join('\n');
}

/**
 * Resolve start/end for a booking.
 * Returns { startDt, endDt, allDay } where:
 *   allDay = true  → startDt and endDt are YYYYMMDD strings
 *   allDay = false → startDt and endDt are YYYYMMDDTHHmmss strings
 */
function resolveDateRange(booking) {
  const meta = booking.metadata || {};
  const dateStr  = booking.date ? booking.date.slice(0, 10) : null;
  const timeStr  = booking.time || null;

  if (booking.type === 'hotel') {
    const checkIn  = meta.checkInDate  || dateStr;
    const checkOut = meta.checkOutDate || null;
    const inTime   = meta.checkInTime  || null;
    const outTime  = meta.checkOutTime || null;

    if (inTime && outTime && checkIn && checkOut) {
      return {
        startDt: formatDateTime(checkIn, inTime),
        endDt:   formatDateTime(checkOut, outTime),
        allDay:  false,
      };
    }
    if (inTime && checkIn) {
      const start = formatDateTime(checkIn, inTime);
      return { startDt: start, endDt: addMinutes(start, 60), allDay: false };
    }
    // All-day hotel
    const start = formatAllDay(checkIn);
    // ICS DTEND for all-day is exclusive (next day); Google Calendar uses the same
    const endDate = checkOut || checkIn;
    const endP = parseDateStr(endDate);
    const nextDay = endP
      ? new Date(endP.year, endP.month - 1, endP.day + 1)
      : null;
    const end = nextDay
      ? `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`
      : start;
    return { startDt: start, endDt: end, allDay: true };
  }

  if (booking.type === 'flight') {
    const depDate = meta.departureDate || dateStr;
    const depTime = meta.departureTime || timeStr;
    const arrDate = meta.arrivalDate   || null;
    const arrTime = meta.arrivalTime   || null;
    const start = formatDateTime(depDate, depTime || '00:00');
    const end = (arrDate || arrTime)
      ? formatDateTime(arrDate || depDate, arrTime || '02:00')
      : addMinutes(start, DEFAULT_DURATION.flight);
    return { startDt: start, endDt: end, allDay: false };
  }

  if (booking.type === 'transfer') {
    const pickup = meta.pickupTime || timeStr;
    const start = formatDateTime(dateStr, pickup || '00:00');
    return { startDt: start, endDt: addMinutes(start, DEFAULT_DURATION.transfer), allDay: false };
  }

  if (booking.type === 'event') {
    const start = formatDateTime(dateStr, timeStr || '00:00');
    const end = meta.endTime
      ? formatDateTime(dateStr, meta.endTime)
      : addMinutes(start, DEFAULT_DURATION.event);
    return { startDt: start, endDt: end, allDay: false };
  }

  if (booking.type === 'experience') {
    const start = formatDateTime(dateStr, timeStr || '00:00');
    const dur = meta.durationMinutes ? Number(meta.durationMinutes) : DEFAULT_DURATION.experience;
    return { startDt: start, endDt: addMinutes(start, dur), allDay: false };
  }

  if (booking.type === 'restaurant') {
    const start = formatDateTime(dateStr, timeStr || '00:00');
    return { startDt: start, endDt: addMinutes(start, DEFAULT_DURATION.restaurant), allDay: false };
  }

  // other / fallback
  const start = formatDateTime(dateStr, timeStr || '00:00');
  return { startDt: start, endDt: addMinutes(start, DEFAULT_DURATION.other), allDay: false };
}

/**
 * Build a Google Calendar URL for a booking.
 */
export function buildGoogleCalendarUrl(booking, tripName, itineraryDayStops = []) {
  const { startDt, endDt } = resolveDateRange(booking);
  if (!startDt) return null;

  const location = [booking.locationName, booking.address].filter(Boolean).join(', ');
  const text     = encodeURIComponent(booking.title);
  const dates    = encodeURIComponent(`${startDt}/${endDt}`);
  const details  = encodeURIComponent(buildDescription(booking, tripName, itineraryDayStops));
  const loc      = location ? encodeURIComponent(location) : '';

  let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;
  if (loc) url += `&location=${loc}`;
  return url;
}

/**
 * Generate an ICS file content string for a booking (client-side fallback).
 */
export function buildIcsContent(booking, tripName, itineraryDayStops = []) {
  const { startDt, endDt, allDay } = resolveDateRange(booking);
  if (!startDt) return null;

  const location    = [booking.locationName, booking.address].filter(Boolean).join(', ');
  const description = buildDescription(booking, tripName, itineraryDayStops);
  const uid         = `hiddenatlas-booking-${booking.id}@hiddenatlas.travel`;
  const now         = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const dtStartProp = allDay ? `DTSTART;VALUE=DATE:${startDt}` : `DTSTART:${startDt}`;
  const dtEndProp   = allDay ? `DTEND;VALUE=DATE:${endDt}`     : `DTEND:${endDt}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HiddenAtlas//My Trips//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${now}`),
    foldLine(dtStartProp),
    foldLine(dtEndProp),
    foldLine(`SUMMARY:${icsEscape(booking.title)}`),
    foldLine(`DESCRIPTION:${icsEscape(description)}`),
  ];

  if (location)    lines.push(foldLine(`LOCATION:${icsEscape(location)}`));
  if (booking.url) lines.push(foldLine(`URL:${booking.url}`));

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Build the API URL for server-side ICS generation.
 * The token is passed as a query param so iOS Safari can navigate directly to the URL
 * and trigger the native "Add to Calendar" sheet.
 */
export function buildIcsApiUrl(bookingId, token) {
  return `/api/trips?action=booking-ics&bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Client-side ICS fallback: generates blob and triggers browser download.
 * Used when the API endpoint is not reachable or token is unavailable.
 */
export function downloadIcsFallback(booking, tripName, itineraryDayStops = []) {
  const content = buildIcsContent(booking, tripName, itineraryDayStops);
  if (!content) return;

  const slug = (booking.title || booking.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `hiddenatlas-${slug}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Build a plain-text event summary for copying to clipboard.
 */
export function buildCopyText(booking, itineraryDayStops = []) {
  const meta    = booking.metadata || {};
  const dateStr = booking.date ? new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const lines   = [booking.title];
  if (dateStr) lines.push(`Date: ${dateStr}`);
  if (booking.time) lines.push(`Time: ${booking.time}`);
  const loc = booking.address || booking.locationName;
  if (loc) lines.push(`Location: ${loc}`);
  if (booking.confirmationReference) lines.push(`Reference: ${booking.confirmationReference}`);
  if (booking.provider) lines.push(`Provider: ${booking.provider}`);
  if (booking.notes) lines.push(`Notes: ${booking.notes}`);
  if (booking.url) lines.push(`Booking: ${booking.url}`);
  // Hotel extras
  if (booking.type === 'hotel' && (meta.checkInDate || meta.checkOutDate)) {
    if (meta.checkInDate)  lines.push(`Check-in: ${meta.checkInDate}${meta.checkInTime ? ' ' + meta.checkInTime : ''}`);
    if (meta.checkOutDate) lines.push(`Check-out: ${meta.checkOutDate}${meta.checkOutTime ? ' ' + meta.checkOutTime : ''}`);
  }
  // Linked stop context
  const stopId = meta.itineraryDayStopId;
  if (stopId) {
    const stop = itineraryDayStops.find(s => s.id === stopId);
    if (stop) {
      const dayPart = booking.dayNumber ? `Day ${booking.dayNumber}` : null;
      lines.push(`Linked to: ${[dayPart, stop.title].filter(Boolean).join(' · ')}`);
    }
  }
  return lines.join('\n');
}
