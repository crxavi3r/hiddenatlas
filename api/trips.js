import pg from 'pg';
import { createTripEvent } from './_lib/audit.js';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// ─────────────────────────────────────────────
// ICS generation helpers (server-side)
// Mirrors src/lib/calendarExport.js — kept inline to avoid bundler coupling.
// ─────────────────────────────────────────────
function _pad(n) { return String(n).padStart(2, '0'); }

// Normalise a value that may be a JS Date object (pg timestamptz) or a
// "YYYY-MM-DD..." string into a "YYYY-MM-DD" string, or null.
function _normDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val);
  return s.match(/^\d{4}-\d{2}-\d{2}/) ? s.slice(0, 10) : null;
}
function _parseDateStr(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return (y && m && d) ? { year: y, month: m, day: d } : null;
}
function _fmtAllDay(s) {
  const p = _parseDateStr(s);
  return p ? `${p.year}${_pad(p.month)}${_pad(p.day)}` : null;
}
function _fmtDT(dateStr, timeStr) {
  const p = _parseDateStr(dateStr);
  if (!p) return null;
  const [h = 0, m = 0] = (timeStr || '00:00').split(':').map(Number);
  return `${p.year}${_pad(p.month)}${_pad(p.day)}T${_pad(h || 0)}${_pad(m || 0)}00`;
}
// Returns null when dt is null/undefined rather than crashing.
function _addMin(dt, mins) {
  if (!dt) return null;
  const yr = parseInt(dt.slice(0, 4)), mo = parseInt(dt.slice(4, 6)) - 1,
        dy = parseInt(dt.slice(6, 8)), hr = parseInt(dt.slice(9, 11)),
        mn = parseInt(dt.slice(11, 13));
  const d = new Date(yr, mo, dy, hr, mn + mins);
  return `${d.getFullYear()}${_pad(d.getMonth()+1)}${_pad(d.getDate())}T${_pad(d.getHours())}${_pad(d.getMinutes())}00`;
}
function _icsEsc(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function _icsFold(line) {
  const chars = [...line], chunks = [];
  while (chars.length > 75) chunks.push(chars.splice(0, 75).join(''));
  chunks.push(chars.join(''));
  return chunks.join('\r\n ');
}
const _DUR = { hotel: 1440, restaurant: 90, experience: 90, flight: 120, transfer: 60, event: 60, other: 60 };

function _icsRange(booking) {
  const raw = booking.metadata;
  const meta = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
  // booking.date is a JS Date object from pg (timestamptz column) — normalise it.
  const dateStr = _normDate(booking.date);
  const timeStr = booking.time || null;

  if (booking.type === 'hotel') {
    const ci = meta.checkInDate || dateStr, co = meta.checkOutDate || null;
    const inT = meta.checkInTime || null, outT = meta.checkOutTime || null;
    if (inT && outT && ci && co) return { s: _fmtDT(ci, inT), e: _fmtDT(co, outT), allDay: false };
    if (inT && ci) { const s = _fmtDT(ci, inT); return { s, e: _addMin(s, 60), allDay: false }; }
    const s = _fmtAllDay(ci);
    const endDate = co || ci, ep = _parseDateStr(endDate);
    const nd = ep ? new Date(ep.year, ep.month - 1, ep.day + 1) : null;
    const e = nd ? `${nd.getFullYear()}${_pad(nd.getMonth()+1)}${_pad(nd.getDate())}` : s;
    return { s, e, allDay: true };
  }
  if (booking.type === 'flight') {
    const dep = meta.departureDate || dateStr, depT = meta.departureTime || timeStr;
    const arr = meta.arrivalDate || null, arrT = meta.arrivalTime || null;
    const s = _fmtDT(dep, depT || '00:00');
    const e = (arr || arrT) ? _fmtDT(arr || dep, arrT || '02:00') : _addMin(s, _DUR.flight);
    return { s, e, allDay: false };
  }
  if (booking.type === 'transfer') {
    const s = _fmtDT(dateStr, meta.pickupTime || timeStr || '00:00');
    return { s, e: _addMin(s, _DUR.transfer), allDay: false };
  }
  if (booking.type === 'event') {
    const s = _fmtDT(dateStr, timeStr || '00:00');
    return { s, e: meta.endTime ? _fmtDT(dateStr, meta.endTime) : _addMin(s, _DUR.event), allDay: false };
  }
  if (booking.type === 'experience') {
    const s = _fmtDT(dateStr, timeStr || '00:00');
    return { s, e: _addMin(s, meta.durationMinutes ? Number(meta.durationMinutes) : _DUR.experience), allDay: false };
  }
  if (booking.type === 'restaurant') {
    const s = _fmtDT(dateStr, timeStr || '00:00');
    return { s, e: _addMin(s, _DUR.restaurant), allDay: false };
  }
  const s = _fmtDT(dateStr, timeStr || '00:00');
  return { s, e: _addMin(s, _DUR.other), allDay: false };
}

function _icsDesc(booking, tripName) {
  const meta = booking.metadata ? (typeof booking.metadata === 'string' ? JSON.parse(booking.metadata) : booking.metadata) : {};
  const catLabel = { hotel:'Hotel', restaurant:'Restaurant', experience:'Experience', flight:'Flight', transfer:'Transfer', event:'Event', other:'Other' }[booking.type] || booking.type;
  const lines = [];
  if (tripName) lines.push(`HiddenAtlas trip: ${tripName}`);
  if (booking.dayNumber) lines.push(`Day: ${booking.dayNumber}`);
  lines.push(`Type: ${catLabel}`);
  if (booking.provider)              lines.push(`Provider: ${booking.provider}`);
  if (booking.confirmationReference) lines.push(`Reference: ${booking.confirmationReference}`);
  if (booking.notes)                 lines.push(`Notes: ${booking.notes}`);
  if (booking.url)                   lines.push(`View booking: ${booking.url}`);
  if (booking.address)               lines.push(`Address: ${booking.address}`);
  return lines.join('\n');
}

function generateBookingIcs(booking, tripName) {
  const range = _icsRange(booking);
  if (!range?.s) return null;
  const { s, e, allDay } = range;
  const loc  = [booking.address, booking.locationName].filter(Boolean).join(', ');
  const uid  = `hiddenatlas-booking-${booking.id}@hiddenatlas.travel`;
  const now  = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const desc = _icsDesc(booking, tripName);
  const slug = (booking.title || booking.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HiddenAtlas//My Trips//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    _icsFold(`UID:${uid}`),
    _icsFold(`DTSTAMP:${now}`),
    _icsFold(allDay ? `DTSTART;VALUE=DATE:${s}` : `DTSTART:${s}`),
    _icsFold(allDay ? `DTEND;VALUE=DATE:${e}`   : `DTEND:${e}`),
    _icsFold(`SUMMARY:${_icsEsc(booking.title)}`),
    _icsFold(`DESCRIPTION:${_icsEsc(desc)}`),
  ];
  if (loc)         lines.push(_icsFold(`LOCATION:${_icsEsc(loc)}`));
  if (booking.url) lines.push(_icsFold(`URL:${booking.url}`));
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return { ics: lines.join('\r\n'), slug };
}

// ─────────────────────────────────────────────
// Booking day-mapping helper
// Returns { dayNumber, tripDayId } given a booking date and the trip's TripDays.
// dayNumber = differenceInCalendarDays(bookingDate, startDate) + 1
// ─────────────────────────────────────────────
function resolveBookingDay(bookingDateStr, startDateStr, tripDays) {
  if (!bookingDateStr || !startDateStr) return { dayNumber: null, tripDayId: null };
  const booking = new Date(bookingDateStr + 'T00:00:00Z');
  const start   = new Date(startDateStr   + 'T00:00:00Z');
  const diffMs  = booking.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays < 0) return { dayNumber: null, tripDayId: null };   // before trip
  const dayNumber = diffDays + 1;
  const matchDay = (tripDays || []).find(d => d.dayNumber === dayNumber);
  return { dayNumber, tripDayId: matchDay?.id || null };
}

// ─────────────────────────────────────────────
// Booking validation helper
// ─────────────────────────────────────────────
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateBooking(type, body, meta) {
  const errs = [];

  if (body.date && !DATE_RE.test(body.date))
    errs.push('Invalid date format — use YYYY-MM-DD');
  if (body.time && !TIME_RE.test(body.time))
    errs.push('Invalid time format — use HH:mm');

  // All metadata time fields must be HH:mm
  const metaTimeKeys = ['checkInTime','checkOutTime','departureTime','arrivalTime','pickupTime','endTime'];
  for (const k of metaTimeKeys) {
    if (meta[k] && !TIME_RE.test(meta[k]))
      errs.push(`Invalid ${k} — use HH:mm`);
  }
  // All metadata date fields must be YYYY-MM-DD
  const metaDateKeys = ['checkInDate','checkOutDate','departureDate','arrivalDate'];
  for (const k of metaDateKeys) {
    if (meta[k] && !DATE_RE.test(meta[k]))
      errs.push(`Invalid ${k} — use YYYY-MM-DD`);
  }

  if (type === 'hotel') {
    if (!meta.checkInDate)  errs.push('checkInDate is required for hotel bookings');
    if (!meta.checkOutDate) errs.push('checkOutDate is required for hotel bookings');
    if (meta.checkInDate && meta.checkOutDate &&
        DATE_RE.test(meta.checkInDate) && DATE_RE.test(meta.checkOutDate)) {
      if (meta.checkOutDate < meta.checkInDate)
        errs.push('Check-out date must be on or after check-in date');
      if (meta.checkOutDate === meta.checkInDate &&
          meta.checkInTime && meta.checkOutTime &&
          TIME_RE.test(meta.checkInTime) && TIME_RE.test(meta.checkOutTime) &&
          meta.checkOutTime <= meta.checkInTime)
        errs.push('Same-day check-out time must be after check-in time');
    }
  }

  if (type === 'flight') {
    const { departureDate: dd, arrivalDate: ad, departureTime: dt, arrivalTime: at } = meta;
    if (dd && ad && dt && at &&
        DATE_RE.test(dd) && DATE_RE.test(ad) &&
        TIME_RE.test(dt) && TIME_RE.test(at) &&
        dd === ad && at <= dt)
      errs.push('Same-day arrival time must be after departure time');
  }

  if (type === 'event') {
    const st = body.time;
    const et = meta.endTime;
    if (st && et && TIME_RE.test(st) && TIME_RE.test(et) && et <= st)
      errs.push('End time must be after start time');
  }

  return errs;
}

// GET    /api/trips                          — list all trips for user
// GET    /api/trips?id=<uuid>                — get single trip with days (basic)
// GET    /api/trips?id=<uuid>&action=workspace — full workspace data (trip + itinerary + items + notes + bookings + assets)
// GET    /api/trips?action=booking-ics&bookingId=<id>&token=<jwt> — serve .ics calendar file
// POST   /api/trips                          — save new trip (body: { trip, source })
// POST   /api/trips?id=<uuid>                — log audit event (body: { eventType, metadata })
// POST   /api/trips?action=track             — log client-side analytics event (optional auth)
// POST   /api/trips?id=<uuid>&action=details — update trip personal fields
// POST   /api/trips?id=<uuid>&action=item    — create TripItem
// POST   /api/trips?action=item&itemId=<id>  — update TripItem
// POST   /api/trips?action=delete-item&itemId=<id> — delete TripItem
// POST   /api/trips?id=<uuid>&action=note    — create TripNote
// POST   /api/trips?action=note&noteId=<id>  — update TripNote
// POST   /api/trips?action=delete-note&noteId=<id> — delete TripNote
// POST   /api/trips?id=<uuid>&action=booking — create TripBooking
// POST   /api/trips?action=booking&bookingId=<id> — update TripBooking
// POST   /api/trips?action=delete-booking&bookingId=<id> — delete TripBooking
// POST   /api/trips?action=day&dayId=<id>    — update TripDay overrides
// DELETE /api/trips?id=<uuid>                — delete trip
export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ── POST /api/trips?action=track — analytics event (optional auth) ─────────
  // Auth is optional: anonymous events are recorded with userId = NULL.
  if (req.method === 'POST' && req.query.action === 'track') {
    const { eventType, itinerarySlug, pagePath, source, sessionId, deviceType, metadata } = req.body ?? {};
    if (!eventType) return res.status(400).json({ error: 'eventType is required' });

    const ua             = req.headers['user-agent'] ?? '';
    const resolvedDevice = deviceType ?? (/mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop');
    const country        = req.headers['x-vercel-ip-country'] ?? null;

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      let userId = null;
      if (req.headers.authorization?.startsWith('Bearer ')) {
        try {
          const clerkId = await verifyAuth(req.headers.authorization);
          const { rows } = await pool.query(`SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]);
          userId = rows[0]?.id ?? null;
        } catch { /* anonymous */ }
      }
      await pool.query(
        `INSERT INTO "Event" (id, "userId", "sessionId", "eventType", "itinerarySlug", "pagePath", source, country, "deviceType", metadata, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [userId, sessionId ?? null, eventType, itinerarySlug ?? null, pagePath ?? null,
         source ?? null, country, resolvedDevice, JSON.stringify(metadata ?? {})]
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[trips/track] DB error:', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  // ── GET /api/trips?action=booking-ics&bookingId=<id> — serve ICS calendar file ──
  // Accepts the Clerk JWT via Authorization header OR ?token= query param.
  // The ?token= fallback is required so iOS Safari can navigate directly to the URL
  // and trigger the system "Add to Calendar" sheet for text/calendar responses.
  if (req.method === 'GET' && req.query.action === 'booking-ics' && req.query.bookingId) {
    if (!process.env.CLERK_SECRET_KEY) return res.status(500).json({ error: 'Server misconfigured' });
    const rawToken = req.query.token;
    const authHeader = req.headers.authorization || (rawToken ? `Bearer ${rawToken}` : undefined);
    let icsClerkId;
    try { icsClerkId = await verifyAuth(authHeader); } catch {
      return res.status(401).set('Content-Type', 'application/json').json({ error: 'Unauthorized' });
    }
    const icsPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows: icsUsers } = await icsPool.query(
        `SELECT id FROM "User" WHERE "clerkId" = $1`, [icsClerkId]
      );
      if (!icsUsers.length) return res.status(404).json({ error: 'User not found' });
      const icsUserId = icsUsers[0].id;

      const { rows: bRows } = await icsPool.query(
        `SELECT b.id, b."tripId", b.type, b.title, b.date, b.time,
                b."locationName", b.address, b.provider,
                b."confirmationReference", b.notes, b.url,
                b.metadata, b."dayNumber",
                t.title AS "tripTitle", t.destination
         FROM "TripBooking" b
         JOIN "Trip" t ON t.id = b."tripId"
         WHERE b.id = $1 AND t."userId" = $2`,
        [req.query.bookingId, icsUserId]
      );
      if (!bRows.length) return res.status(404).json({ error: 'Booking not found' });
      const bk = bRows[0];
      const tripName = bk.tripTitle || bk.destination || '';

      console.log('[trips/booking-ics] booking:', {
        id: bk.id, type: bk.type, title: bk.title,
        date: bk.date, dateNorm: _normDate(bk.date),
        time: bk.time, metadata: bk.metadata, dayNumber: bk.dayNumber,
      });

      const result = generateBookingIcs(bk, tripName);
      if (!result) {
        console.warn('[trips/booking-ics] no date/time usable — returning 400');
        return res.status(400).json({ error: 'Booking does not have enough date/time information for calendar export' });
      }

      console.log('[trips/booking-ics] ICS length:', result.ics.length, 'slug:', result.slug);
      const filename = `hiddenatlas-booking-${result.slug}.ics`;
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(result.ics);
    } catch (e) {
      console.error('[trips/booking-ics] exception:', e.message, e.stack);
      return res.status(500).json({ error: 'Internal server error', detail: e.message });
    } finally {
      await icsPool.end();
    }
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { id, action, itemId, noteId, bookingId, dayId } = req.query;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const userId = users[0].id;

    // ── Helper: verify trip ownership ──────────────────────────────────────
    async function getOwnedTrip(tripId) {
      const { rows } = await pool.query(
        `SELECT id FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [tripId, userId]
      );
      return rows[0] || null;
    }

    // ── GET /api/trips — list all trips ────────────────────────────────────
    if (req.method === 'GET' && !id) {
      const { rows } = await pool.query(
        `SELECT
           t.id,
           t.title,
           t.destination,
           t.country,
           t.duration,
           t.overview,
           t.source,
           t."coverImage",
           t."heroImage",
           t."itinerarySlug",
           t."itineraryId",
           t."createdAt",
           COUNT(d.id)::int AS "dayCount",
           COALESCE(
             t."heroImage",
             t."coverImage",
             (SELECT i."coverImage" FROM "Itinerary" i
              WHERE (t."itineraryId" IS NOT NULL AND i.id = t."itineraryId")
                 OR (t."itineraryId" IS NULL AND t."itinerarySlug" IS NOT NULL AND i.slug = t."itinerarySlug")
              LIMIT 1)
           ) AS "resolvedCoverImage"
         FROM "Trip" t
         LEFT JOIN "TripDay" d ON d."tripId" = t.id
         WHERE t."userId" = $1
         GROUP BY t.id
         ORDER BY t."createdAt" DESC`,
        [userId]
      );
      return res.status(200).json(rows);
    }

    // ── GET /api/trips?id=&action=workspace — full workspace data ─────────
    if (req.method === 'GET' && id && action === 'workspace') {
      const { rows: tripRows } = await pool.query(
        `SELECT
           id, "userId", "itinerarySlug", "itineraryId", title, destination, country,
           duration, "durationDays", overview, highlights, hotels, experiences,
           source, "coverImage", subtitle, "heroImage",
           "startDate", "endDate", travellers,
           "accommodationSummary", "arrivalInfo", "departureInfo", "generalNotes",
           "createdAt", "updatedAt"
         FROM "Trip"
         WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!tripRows.length) return res.status(404).json({ error: 'Trip not found' });
      const trip = tripRows[0];

      // Resolve itinerary via itineraryId (FK) or itinerarySlug (legacy)
      let itinerary = null;
      if (trip.itineraryId) {
        const { rows } = await pool.query(
          `SELECT id, slug, title, subtitle, description, destination, country, "durationDays",
                  "coverImage", "pdfUrl", content, type, "accessType"
           FROM "Itinerary" WHERE id = $1`,
          [trip.itineraryId]
        );
        itinerary = rows[0] || null;
      }
      if (!itinerary && trip.itinerarySlug) {
        const { rows } = await pool.query(
          `SELECT id, slug, title, subtitle, description, destination, country, "durationDays",
                  "coverImage", "pdfUrl", content, type, "accessType"
           FROM "Itinerary" WHERE slug = $1`,
          [trip.itinerarySlug]
        );
        itinerary = rows[0] || null;
      }

      const { rows: tripDays } = await pool.query(
        `SELECT id, "tripId", "dayNumber", title, description,
                "sourceDayNumber", "titleOverride", "descriptionOverride",
                notes, "sortOrder", "isHidden", "updatedAt"
         FROM "TripDay"
         WHERE "tripId" = $1
         ORDER BY "sortOrder" ASC, "dayNumber" ASC`,
        [id]
      );

      const { rows: tripItems } = await pool.query(
        `SELECT id, "tripId", "tripDayId", "dayNumber", type, title, description,
                time, "startTime", "endTime", "durationMinutes", "locationName", address,
                latitude, longitude, notes, "bookingReference", provider, url,
                status, "isHidden", "isLocked", "sortOrder", metadata,
                "createdAt", "updatedAt"
         FROM "TripItem"
         WHERE "tripId" = $1 AND "isHidden" = false
         ORDER BY "tripDayId" NULLS LAST, "sortOrder" ASC, "createdAt" ASC`,
        [id]
      );

      const { rows: tripNotes } = await pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", title, content,
                "noteType", "isPinned", "createdAt", "updatedAt"
         FROM "TripNote"
         WHERE "tripId" = $1
         ORDER BY "createdAt" ASC`,
        [id]
      );

      const { rows: tripBookings } = await pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", type, title,
                date, time, "locationName", address, latitude, longitude,
                provider, "confirmationReference", notes, url,
                "attachmentUrl", status, metadata, "createdAt", "updatedAt"
         FROM "TripBooking"
         WHERE "tripId" = $1
         ORDER BY date ASC NULLS LAST, "createdAt" ASC`,
        [id]
      );

      let assets = [];
      let itineraryDayStops = [];
      if (itinerary?.id) {
        const { rows: assetRows } = await pool.query(
          `SELECT id, "itineraryId", "assetType", url, alt, caption, "sortOrder", source, active, "createdAt"
           FROM "ItineraryAsset"
           WHERE "itineraryId" = $1 AND active = true
           ORDER BY "sortOrder" ASC, "createdAt" ASC`,
          [itinerary.id]
        );
        assets = assetRows;

        // Original itinerary day stops (template content — read-only for users)
        try {
          const { rows: stopRows } = await pool.query(
            `SELECT id, "dayNumber", title, description, type,
                    "locationName", address, latitude, longitude,
                    "suggestedTime", "durationMinutes",
                    "sortOrder", "isOptional", "isMajorStop", "showOnMap",
                    "bookingRecommended", "bookingUrl", metadata
             FROM "ItineraryDayStop"
             WHERE "itineraryId" = $1
             ORDER BY "dayNumber" ASC, "sortOrder" ASC`,
            [itinerary.id]
          );
          itineraryDayStops = stopRows;
        } catch { /* table not yet migrated */ }
      }

      // Hidden itinerary stop overrides — stored as isHidden TripItems with overrideType metadata
      let hiddenStopIds = [];
      try {
        const { rows: hiddenRows } = await pool.query(
          `SELECT metadata->>'itineraryDayStopId' AS "stopId"
           FROM "TripItem"
           WHERE "tripId" = $1
             AND "isHidden" = true
             AND metadata->>'overrideType' = 'hidden_original_stop'`,
          [id]
        );
        hiddenStopIds = hiddenRows.map(r => r.stopId).filter(Boolean);
      } catch { /* graceful fallback */ }

      return res.status(200).json({ trip, itinerary, tripDays, tripItems, tripNotes, tripBookings, assets, itineraryDayStops, hiddenStopIds });
    }

    // ── GET /api/trips?id= — single trip (basic) ───────────────────────────
    if (req.method === 'GET' && id) {
      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, country, duration, overview,
                highlights, hotels, experiences, source, "coverImage",
                "itinerarySlug", "itineraryId", "createdAt"
         FROM "Trip"
         WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!trips.length) return res.status(404).json({ error: 'Trip not found' });

      const { rows: days } = await pool.query(
        `SELECT id, "dayNumber", title, description
         FROM "TripDay"
         WHERE "tripId" = $1
         ORDER BY "dayNumber" ASC`,
        [id]
      );
      return res.status(200).json({ ...trips[0], days });
    }

    // ── Workspace POST mutations ────────────────────────────────────────────
    // These are checked before the generic POST+id audit-event handler.

    // Update trip personal details
    if (req.method === 'POST' && action === 'details' && id) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const {
        startDate, endDate, travellers, accommodationSummary,
        arrivalInfo, departureInfo, generalNotes, subtitle, heroImage,
      } = req.body || {};

      await pool.query(
        `UPDATE "Trip"
         SET "startDate" = $1, "endDate" = $2, travellers = $3,
             "accommodationSummary" = $4, "arrivalInfo" = $5, "departureInfo" = $6,
             "generalNotes" = $7, subtitle = $8, "heroImage" = $9, "updatedAt" = NOW()
         WHERE id = $10`,
        [
          startDate || null, endDate || null,
          travellers != null ? Number(travellers) : null,
          accommodationSummary || null, arrivalInfo || null, departureInfo || null,
          generalNotes || null, subtitle || null, heroImage || null, id,
        ]
      );
      return res.status(200).json({ ok: true });
    }

    // Create TripItem
    if (req.method === 'POST' && action === 'item' && id && !itemId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripDayId, type, title, description, time, startTime, endTime, durationMinutes, locationName, notes, sortOrder } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title is required' });

      const { rows } = await pool.query(
        `INSERT INTO "TripItem" (id, "tripId", "tripDayId", type, title, description, time, "startTime", "endTime", "durationMinutes", "locationName", notes, "sortOrder", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING id`,
        [id, tripDayId || null, type || 'place', title, description || null,
         time || null, startTime || null, endTime || null,
         durationMinutes != null ? Number(durationMinutes) : null,
         locationName || null, notes || null,
         sortOrder != null ? Number(sortOrder) : 0]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    // Update TripItem
    if (req.method === 'POST' && action === 'item' && itemId) {
      const { rows: itemRows } = await pool.query(
        `SELECT ti.id FROM "TripItem" ti
         JOIN "Trip" t ON t.id = ti."tripId"
         WHERE ti.id = $1 AND t."userId" = $2`,
        [itemId, userId]
      );
      if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });

      const { type, title, description, time, startTime, endTime, durationMinutes, locationName, notes, bookingReference, status, sortOrder, latitude, longitude } = req.body || {};
      await pool.query(
        `UPDATE "TripItem"
         SET type = COALESCE($1, type), title = COALESCE($2, title),
             description = $3, time = $4, "startTime" = $5, "endTime" = $6,
             "durationMinutes" = $7, "locationName" = $8, notes = $9,
             "bookingReference" = $10, status = COALESCE($11, status),
             "sortOrder" = COALESCE($12, "sortOrder"),
             latitude = COALESCE($14::float8, latitude),
             longitude = COALESCE($15::float8, longitude),
             "updatedAt" = NOW()
         WHERE id = $13`,
        [type || null, title || null, description || null, time || null,
         startTime || null, endTime || null,
         durationMinutes != null ? Number(durationMinutes) : null,
         locationName || null, notes || null, bookingReference || null,
         status || null, sortOrder != null ? Number(sortOrder) : null,
         itemId,
         latitude != null ? Number(latitude) : null,
         longitude != null ? Number(longitude) : null]
      );
      return res.status(200).json({ ok: true });
    }

    // Delete TripItem
    if (req.method === 'POST' && action === 'delete-item' && itemId) {
      const { rows } = await pool.query(
        `DELETE FROM "TripItem" USING "Trip"
         WHERE "TripItem".id = $1
           AND "TripItem"."tripId" = "Trip".id
           AND "Trip"."userId" = $2
         RETURNING "TripItem".id`,
        [itemId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Item not found' });
      return res.status(200).json({ ok: true });
    }

    // Create TripNote
    if (req.method === 'POST' && action === 'note' && id && !noteId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripDayId, tripItemId, noteType, title, content } = req.body || {};
      if (!content) return res.status(400).json({ error: 'content is required' });

      const { rows } = await pool.query(
        `INSERT INTO "TripNote" (id, "tripId", "tripDayId", "tripItemId", "noteType", title, content, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [id, tripDayId || null, tripItemId || null, noteType || 'general', title || null, content]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    // Update TripNote
    if (req.method === 'POST' && action === 'note' && noteId) {
      const { rows: noteRows } = await pool.query(
        `SELECT tn.id FROM "TripNote" tn
         JOIN "Trip" t ON t.id = tn."tripId"
         WHERE tn.id = $1 AND t."userId" = $2`,
        [noteId, userId]
      );
      if (!noteRows.length) return res.status(404).json({ error: 'Note not found' });

      const { title, content } = req.body || {};
      await pool.query(
        `UPDATE "TripNote"
         SET title = $1, content = COALESCE($2, content), "updatedAt" = NOW()
         WHERE id = $3`,
        [title || null, content || null, noteId]
      );
      return res.status(200).json({ ok: true });
    }

    // Delete TripNote
    if (req.method === 'POST' && action === 'delete-note' && noteId) {
      const { rows } = await pool.query(
        `DELETE FROM "TripNote" USING "Trip"
         WHERE "TripNote".id = $1
           AND "TripNote"."tripId" = "Trip".id
           AND "Trip"."userId" = $2
         RETURNING "TripNote".id`,
        [noteId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ ok: true });
    }

    // Create TripBooking
    if (req.method === 'POST' && action === 'booking' && id && !bookingId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripItemId, type, title, date, time, locationName, provider, confirmationReference, notes, url, metadata } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title is required' });

      const meta = (metadata && typeof metadata === 'object') ? metadata : {};
      const bookingType = type || 'other';
      const valErrs = validateBooking(bookingType, { date, time }, meta);
      if (valErrs.length) return res.status(400).json({ error: 'Validation failed', errors: valErrs });

      // Resolve dayNumber from trip dates
      const { rows: tripInfo } = await pool.query(
        `SELECT "startDate", "endDate" FROM "Trip" WHERE id = $1`, [id]
      );
      const { rows: tripDayRows } = await pool.query(
        `SELECT id, "dayNumber" FROM "TripDay" WHERE "tripId" = $1`, [id]
      );
      const startDate = tripInfo[0]?.startDate?.toISOString().slice(0, 10) || null;
      const { dayNumber, tripDayId } = resolveBookingDay(date, startDate, tripDayRows);

      const { rows } = await pool.query(
        `INSERT INTO "TripBooking" (id, "tripId", "tripDayId", "tripItemId", "dayNumber", type, title, date, time, "locationName", provider, "confirmationReference", notes, url, metadata, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), NOW())
         RETURNING id, "dayNumber", "tripDayId"`,
        [id, tripDayId, tripItemId || null, dayNumber, bookingType, title,
         date || null, time || null, locationName || null, provider || null,
         confirmationReference || null, notes || null, url || null, JSON.stringify(meta)]
      );
      return res.status(200).json({ id: rows[0].id, dayNumber: rows[0].dayNumber, tripDayId: rows[0].tripDayId });
    }

    // Update TripBooking
    if (req.method === 'POST' && action === 'booking' && bookingId) {
      const { rows: bookingRows } = await pool.query(
        `SELECT tb.id, tb.type AS "currentType", tb."tripId" FROM "TripBooking" tb
         JOIN "Trip" t ON t.id = tb."tripId"
         WHERE tb.id = $1 AND t."userId" = $2`,
        [bookingId, userId]
      );
      if (!bookingRows.length) return res.status(404).json({ error: 'Booking not found' });

      const tripId = bookingRows[0].tripId;
      const { type, title, date, time, locationName, provider, confirmationReference, notes, url, metadata, latitude, longitude, dayNumber: explicitDayNumber, tripDayId: explicitTripDayId } = req.body || {};

      const meta = (metadata && typeof metadata === 'object') ? metadata : {};
      const bookingType = type || bookingRows[0].currentType || 'other';
      const valErrs = validateBooking(bookingType, { date, time }, meta);
      if (valErrs.length) return res.status(400).json({ error: 'Validation failed', errors: valErrs });

      const { rows: tripDayRows } = await pool.query(
        `SELECT id, "dayNumber" FROM "TripDay" WHERE "tripId" = $1`, [tripId]
      );

      let dayNumber, tripDayId;
      if (explicitDayNumber != null) {
        // Manual day link takes precedence over date-derived calculation
        dayNumber = Number(explicitDayNumber);
        tripDayId = explicitTripDayId || tripDayRows.find(d => d.dayNumber === dayNumber)?.id || null;
      } else {
        // Fall back to deriving from booking date
        const { rows: tripInfo } = await pool.query(
          `SELECT "startDate" FROM "Trip" WHERE id = $1`, [tripId]
        );
        const startDate = tripInfo[0]?.startDate?.toISOString().slice(0, 10) || null;
        ({ dayNumber, tripDayId } = resolveBookingDay(date, startDate, tripDayRows));
      }

      const { rows: updated } = await pool.query(
        `UPDATE "TripBooking"
         SET type = COALESCE($1, type), title = COALESCE($2, title),
             date = $3, time = $4, "locationName" = $5, provider = $6,
             "confirmationReference" = $7, notes = $8, url = $9,
             metadata = $10::jsonb, "dayNumber" = $11, "tripDayId" = $12,
             latitude = COALESCE($14::float8, latitude),
             longitude = COALESCE($15::float8, longitude),
             "updatedAt" = NOW()
         WHERE id = $13
         RETURNING id, "dayNumber", "tripDayId", metadata, latitude, longitude`,
        [type || null, title || null, date || null, time || null,
         locationName || null, provider || null, confirmationReference || null,
         notes || null, url || null, JSON.stringify(meta), dayNumber, tripDayId, bookingId,
         latitude != null ? Number(latitude) : null,
         longitude != null ? Number(longitude) : null]
      );
      const saved = updated[0] || {};
      return res.status(200).json({ ok: true, dayNumber: saved.dayNumber, tripDayId: saved.tripDayId, metadata: saved.metadata });
    }

    // Remap all bookings for a trip when startDate changes
    if (req.method === 'POST' && action === 'remap-bookings' && id) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { rows: tripInfo } = await pool.query(
        `SELECT "startDate" FROM "Trip" WHERE id = $1`, [id]
      );
      const startDate = tripInfo[0]?.startDate?.toISOString().slice(0, 10) || null;
      if (!startDate) return res.status(200).json({ ok: true, remapped: 0 });

      const { rows: tripDayRows } = await pool.query(
        `SELECT id, "dayNumber" FROM "TripDay" WHERE "tripId" = $1`, [id]
      );
      const { rows: bookings } = await pool.query(
        `SELECT id, date FROM "TripBooking" WHERE "tripId" = $1 AND date IS NOT NULL`, [id]
      );

      let remapped = 0;
      for (const b of bookings) {
        const bookingDate = b.date instanceof Date
          ? b.date.toISOString().slice(0, 10)
          : String(b.date).slice(0, 10);
        const { dayNumber, tripDayId } = resolveBookingDay(bookingDate, startDate, tripDayRows);
        await pool.query(
          `UPDATE "TripBooking" SET "dayNumber" = $1, "tripDayId" = $2, "updatedAt" = NOW() WHERE id = $3`,
          [dayNumber, tripDayId, b.id]
        );
        remapped++;
      }
      return res.status(200).json({ ok: true, remapped });
    }

    // Delete TripBooking
    if (req.method === 'POST' && action === 'delete-booking' && bookingId) {
      const { rows } = await pool.query(
        `DELETE FROM "TripBooking" USING "Trip"
         WHERE "TripBooking".id = $1
           AND "TripBooking"."tripId" = "Trip".id
           AND "Trip"."userId" = $2
         RETURNING "TripBooking".id`,
        [bookingId, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Booking not found' });
      return res.status(200).json({ ok: true });
    }

    // Hide an original ItineraryDayStop from this trip (creates a hidden override TripItem)
    if (req.method === 'POST' && action === 'hide-itinerary-stop' && id) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });
      const { stopId, dayNumber, tripDayId, title, type } = req.body || {};
      if (!stopId) return res.status(400).json({ error: 'stopId required' });
      // Avoid duplicates
      const { rows: existing } = await pool.query(
        `SELECT id FROM "TripItem"
         WHERE "tripId" = $1 AND "isHidden" = true
           AND metadata->>'itineraryDayStopId' = $2
           AND metadata->>'overrideType' = 'hidden_original_stop'`,
        [id, stopId]
      );
      if (!existing.length) {
        const metadata = JSON.stringify({ itineraryDayStopId: stopId, overrideType: 'hidden_original_stop' });
        await pool.query(
          `INSERT INTO "TripItem" (id, "tripId", "tripDayId", "dayNumber", title, type, "isHidden", metadata, "sortOrder", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, $6::jsonb, 0, NOW(), NOW())`,
          [id, tripDayId || null, dayNumber ? Number(dayNumber) : null, title || '', type || 'other', metadata]
        );
      }
      return res.status(200).json({ ok: true });
    }

    // Unhide a specific ItineraryDayStop for this trip (removes the override)
    if (req.method === 'POST' && action === 'unhide-itinerary-stop' && id) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });
      const { stopId } = req.body || {};
      if (!stopId) return res.status(400).json({ error: 'stopId required' });
      await pool.query(
        `DELETE FROM "TripItem"
         WHERE "tripId" = $1 AND "isHidden" = true
           AND metadata->>'itineraryDayStopId' = $2
           AND metadata->>'overrideType' = 'hidden_original_stop'`,
        [id, stopId]
      );
      return res.status(200).json({ ok: true });
    }

    // Unhide all hidden stops for a day (reset day to original itinerary stops)
    if (req.method === 'POST' && action === 'unhide-day-stops' && id) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });
      const { dayNumber } = req.body || {};
      if (!dayNumber) return res.status(400).json({ error: 'dayNumber required' });
      await pool.query(
        `DELETE FROM "TripItem"
         WHERE "tripId" = $1 AND "isHidden" = true
           AND "dayNumber" = $2
           AND metadata->>'overrideType' = 'hidden_original_stop'`,
        [id, Number(dayNumber)]
      );
      return res.status(200).json({ ok: true });
    }

    // Update TripDay overrides
    if (req.method === 'POST' && action === 'day' && dayId) {
      const { rows: dayRows } = await pool.query(
        `SELECT td.id FROM "TripDay" td
         JOIN "Trip" t ON t.id = td."tripId"
         WHERE td.id = $1 AND t."userId" = $2`,
        [dayId, userId]
      );
      if (!dayRows.length) return res.status(404).json({ error: 'Day not found' });

      const { titleOverride, descriptionOverride, notes, isHidden } = req.body || {};
      await pool.query(
        `UPDATE "TripDay"
         SET "titleOverride" = $1, "descriptionOverride" = $2, notes = $3,
             "isHidden" = COALESCE($4, "isHidden"), "updatedAt" = NOW()
         WHERE id = $5`,
        [titleOverride || null, descriptionOverride || null, notes || null,
         isHidden != null ? Boolean(isHidden) : null, dayId]
      );
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/trips?id= — log audit event ──────────────────────────────
    if (req.method === 'POST' && id) {
      const { eventType, metadata = {} } = req.body || {};

      if (eventType !== 'DOWNLOADED') {
        return res.status(400).json({ error: 'Invalid eventType. Allowed via POST: DOWNLOADED' });
      }

      const { rows: trips } = await pool.query(
        `SELECT id, destination FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!trips.length) return res.status(404).json({ error: 'Trip not found' });

      await createTripEvent(pool, {
        userId, tripId: id, eventType: 'DOWNLOADED',
        metadata: {
          destination: trips[0].destination,
          source: metadata.source || 'unknown',
          ...metadata,
        },
      });

      return res.status(200).json({ ok: true });
    }

    // ── POST /api/trips — save new trip ────────────────────────────────────
    if (req.method === 'POST' && !id) {
      const { trip, source = 'AI_GENERATED' } = req.body || {};
      if (!trip?.destination) {
        return res.status(400).json({ error: 'Missing trip data — expected { trip: { destination, ... } }' });
      }

      const coverImage = (typeof trip.coverImage === 'string' && trip.coverImage.startsWith('http'))
        ? trip.coverImage
        : null;
      const validSources = ['AI_GENERATED', 'FREE_JOURNEY', 'PREMIUM_JOURNEY'];
      const tripSource = validSources.includes(source) ? source : 'AI_GENERATED';
      const itinerarySlug = (typeof trip.itinerarySlug === 'string' && trip.itinerarySlug)
        ? trip.itinerarySlug
        : null;

      // ── Deduplication ─────────────────────────────────────────────────────
      if (itinerarySlug) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM "Trip" WHERE "userId" = $1 AND "itinerarySlug" = $2 LIMIT 1`,
          [userId, itinerarySlug]
        );
        if (existing.length) {
          return res.status(200).json({ id: existing[0].id, deduplicated: true });
        }
      } else {
        const { rows: existing } = await pool.query(
          `SELECT id FROM "Trip"
           WHERE "userId" = $1 AND destination = $2 AND source = $3
             AND "createdAt" > NOW() - INTERVAL '1 hour'
           ORDER BY "createdAt" DESC LIMIT 1`,
          [userId, trip.destination, tripSource]
        );
        if (existing.length) {
          return res.status(200).json({ id: existing[0].id, deduplicated: true });
        }
      }

      // ── Resolve itineraryId + copy itinerary metadata ─────────────────────
      let itineraryId = null;
      let itinCoverImage = null;
      let itinSubtitle = null;
      let itinDurationDays = null;
      if (itinerarySlug) {
        const { rows: itin } = await pool.query(
          `SELECT id, "coverImage", subtitle, "durationDays" FROM "Itinerary" WHERE slug = $1 LIMIT 1`,
          [itinerarySlug]
        );
        if (itin[0]) {
          itineraryId    = itin[0].id;
          itinCoverImage = itin[0].coverImage || null;
          itinSubtitle   = itin[0].subtitle   || null;
          itinDurationDays = itin[0].durationDays || null;
        }
      }

      // Prefer request-provided image; fall back to itinerary cover
      const resolvedCoverImage = coverImage || itinCoverImage || null;

      // ── Insert ────────────────────────────────────────────────────────────
      const { rows: trips } = await pool.query(
        `INSERT INTO "Trip" (id, "userId", "itinerarySlug", "itineraryId", title, destination, country, duration, overview, highlights, hotels, experiences, source, "coverImage", "heroImage", subtitle, "durationDays", "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, NOW())
         ON CONFLICT ("userId", "itinerarySlug") WHERE "itinerarySlug" IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [
          userId, itinerarySlug, itineraryId,
          trip.destination, trip.destination,
          trip.country    || '',
          trip.duration   || '',
          trip.overview   || '',
          JSON.stringify(trip.highlights  || []),
          JSON.stringify(trip.hotels      || []),
          JSON.stringify(trip.experiences || []),
          tripSource,
          resolvedCoverImage,
          resolvedCoverImage,                        // heroImage mirrors coverImage on save
          trip.subtitle || itinSubtitle || null,
          trip.durationDays || itinDurationDays || null,
        ]
      );

      // DO NOTHING race condition fallback
      if (!trips.length) {
        if (itinerarySlug) {
          const { rows: existing } = await pool.query(
            `SELECT id FROM "Trip" WHERE "userId" = $1 AND "itinerarySlug" = $2 LIMIT 1`,
            [userId, itinerarySlug]
          );
          return res.status(200).json({ id: existing[0]?.id, deduplicated: true });
        }
        return res.status(200).json({ id: null, deduplicated: true });
      }

      const tripId = trips[0].id;

      const days = Array.isArray(trip.days) ? trip.days : [];
      for (const day of days) {
        await pool.query(
          `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
          [tripId, day.day || 0, day.title || '', day.description || '']
        );
      }

      await createTripEvent(pool, {
        userId, tripId,
        eventType: 'SAVED',
        metadata: {
          destination: trip.destination,
          title:       trip.destination,
          duration:    trip.duration || '',
          dayCount:    days.length,
          source:      tripSource,
        },
      });

      return res.status(200).json({ id: tripId });
    }

    // ── DELETE /api/trips?id= — delete trip ────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });

      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, duration FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!trips.length) return res.status(404).json({ error: 'Trip not found' });
      const trip = trips[0];

      // Write DELETED event before deletion so audit survives any subsequent error
      await createTripEvent(pool, {
        userId, tripId: id, eventType: 'DELETED',
        metadata: { title: trip.title, destination: trip.destination, duration: trip.duration },
      });

      // TripDay rows cascade; TripEvent rows are unaffected (no FK on tripId)
      await pool.query(`DELETE FROM "Trip" WHERE id = $1`, [id]);

      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    console.error('[api/trips] error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
