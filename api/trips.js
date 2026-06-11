import pg from 'pg';
import { randomBytes } from 'crypto';
import { createTripEvent } from './_lib/audit.js';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// ─────────────────────────────────────────────
// Trip-sharing helpers
// ─────────────────────────────────────────────
function generateShareToken() {
  return randomBytes(32).toString('base64url');
}

function shareLink(token) {
  const base = process.env.CLIENT_ORIGIN || 'https://www.hiddenatlas.travel';
  return `${base}/share/trip/${token}`;
}

async function sendInviteEmail({ to, inviterName, tripTitle, role, acceptLink }) {
  if (!process.env.RESEND_API_KEY) return;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
  const roleLabel = role === 'edit' ? 'Can edit' : 'View only';
  await resend.emails.send({
    from: FROM,
    to,
    subject: `${inviterName} shared a HiddenAtlas trip with you`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(28,26,22,0.08);">
    <div style="background:linear-gradient(135deg,#0D3834,#1B6B65);padding:32px 40px;">
      <p style="font-family:'Georgia',serif;font-size:24px;font-weight:600;color:white;margin:0;">HiddenAtlas</p>
      <p style="font-size:13px;color:rgba(255,255,255,0.65);margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">Trip invitation</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:16px;color:#1C1A16;line-height:1.6;margin:0 0 20px;"><strong>${inviterName}</strong> shared a trip with you on HiddenAtlas.</p>
      <div style="background:#FAFAF8;border-radius:8px;border:1px solid #E8E3DA;padding:20px 24px;margin-bottom:28px;">
        <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1B6B65;margin:0 0 6px;">${roleLabel}</p>
        <p style="font-family:'Georgia',serif;font-size:20px;font-weight:600;color:#1C1A16;margin:0;">${tripTitle}</p>
      </div>
      <a href="${acceptLink}" style="display:inline-block;padding:14px 28px;background:#1B6B65;color:white;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">Open trip</a>
      <p style="font-size:12px;color:#B5A09A;margin:24px 0 0;line-height:1.6;">Or copy this link: <a href="${acceptLink}" style="color:#1B6B65;">${acceptLink}</a></p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #E8E3DA;">
      <p style="font-size:11px;color:#B5A09A;margin:0;">You received this because ${inviterName} invited you. If you didn't expect this, you can ignore it.</p>
    </div>
  </div>
</body></html>`,
  });
}

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
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
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
         WHERE b.id = $1 AND (
           t."userId" = $2 OR
           EXISTS (
             SELECT 1 FROM "TripShare" ts
             WHERE ts."tripId" = t.id AND ts."userId" = $2 AND ts.status = 'accepted'
           )
         )`,
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

  // ── GET /api/trips?action=shares-preview&token=<t> — no auth required ──────
  if (req.method === 'GET' && req.query.action === 'shares-preview' && req.query.token) {
    const previewPool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await previewPool.query(
        `SELECT ts.id, ts.role, ts.status,
                t.title, t.destination, t.country, t.duration,
                COALESCE(t."heroImage", t."coverImage") AS cover,
                u.name AS "inviterName"
         FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         JOIN "User" u ON u.id = ts."invitedByUserId"
         WHERE ts."inviteToken" = $1`,
        [req.query.token]
      );
      if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
      const share = rows[0];
      if (share.status === 'revoked') return res.status(410).json({ error: 'This invite has been revoked.' });
      return res.status(200).json({
        role: share.role,
        status: share.status,
        inviterName: share.inviterName,
        tripTitle: share.title,
        destination: share.destination,
        country: share.country,
        duration: share.duration,
        cover: share.cover,
      });
    } catch (err) {
      console.error('[trips/shares-preview]', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await previewPool.end();
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

    // ── Helper: resolve trip access for current user ────────────────────────
    // Returns { canView, canEdit, canManageSharing, role: 'owner'|'edit'|'view'|null }
    async function getTripAccess(tripId) {
      const { rows: owned } = await pool.query(
        `SELECT id FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [tripId, userId]
      );
      if (owned.length) {
        return { canView: true, canEdit: true, canManageSharing: true, role: 'owner' };
      }
      const { rows: shares } = await pool.query(
        `SELECT role FROM "TripShare" WHERE "tripId" = $1 AND "userId" = $2 AND status = 'accepted'`,
        [tripId, userId]
      );
      if (shares.length) {
        const shareRole = shares[0].role;
        return { canView: true, canEdit: shareRole === 'edit', canManageSharing: false, role: shareRole };
      }
      return { canView: false, canEdit: false, canManageSharing: false, role: null };
    }

    // ── GET /api/trips — list owned + accepted shared trips ────────────────
    if (req.method === 'GET' && !id) {
      const { rows } = await pool.query(
        `SELECT
           t.id, t.title, t.destination, t.country, t.duration, t.overview,
           t.source, t."coverImage", t."heroImage", t."itinerarySlug", t."itineraryId",
           t."createdAt",
           COUNT(d.id)::int AS "dayCount",
           COALESCE(
             t."heroImage",
             t."coverImage",
             (SELECT i."coverImage" FROM "Itinerary" i
              WHERE (t."itineraryId" IS NOT NULL AND i.id = t."itineraryId")
                 OR (t."itineraryId" IS NULL AND t."itinerarySlug" IS NOT NULL AND i.slug = t."itinerarySlug")
              LIMIT 1)
           ) AS "resolvedCoverImage",
           false AS "isShared",
           'owner'::text AS "shareRole"
         FROM "Trip" t
         LEFT JOIN "TripDay" d ON d."tripId" = t.id
         WHERE t."userId" = $1
         GROUP BY t.id

         UNION ALL

         SELECT
           t.id, t.title, t.destination, t.country, t.duration, t.overview,
           t.source, t."coverImage", t."heroImage", t."itinerarySlug", t."itineraryId",
           t."createdAt",
           COUNT(d.id)::int AS "dayCount",
           COALESCE(
             t."heroImage",
             t."coverImage",
             (SELECT i."coverImage" FROM "Itinerary" i
              WHERE (t."itineraryId" IS NOT NULL AND i.id = t."itineraryId")
                 OR (t."itineraryId" IS NULL AND t."itinerarySlug" IS NOT NULL AND i.slug = t."itinerarySlug")
              LIMIT 1)
           ) AS "resolvedCoverImage",
           true AS "isShared",
           ts.role AS "shareRole"
         FROM "Trip" t
         JOIN "TripShare" ts ON ts."tripId" = t.id AND ts."userId" = $1 AND ts.status = 'accepted'
         LEFT JOIN "TripDay" d ON d."tripId" = t.id
         GROUP BY t.id, ts.role

         ORDER BY "createdAt" DESC`,
        [userId]
      );
      return res.status(200).json(rows);
    }

    // ── GET /api/trips?id=&action=workspace — full workspace data ─────────
    if (req.method === 'GET' && id && action === 'workspace') {
      const tripAccess = await getTripAccess(id);
      if (!tripAccess.canView) return res.status(404).json({ error: 'Trip not found' });

      const { rows: tripRows } = await pool.query(
        `SELECT
           id, "userId", "itinerarySlug", "itineraryId", title, destination, country,
           duration, "durationDays", overview, highlights, hotels, experiences,
           source, "coverImage", subtitle, "heroImage",
           "startDate", "endDate", travellers,
           "accommodationSummary", "arrivalInfo", "departureInfo", "generalNotes",
           "createdAt", "updatedAt"
         FROM "Trip"
         WHERE id = $1`,
        [id]
      );
      if (!tripRows.length) return res.status(404).json({ error: 'Trip not found' });

      // Update lastAccessedAt for shared users (fire and forget)
      if (tripAccess.role !== 'owner') {
        pool.query(
          `UPDATE "TripShare" SET "lastAccessedAt" = NOW(), "updatedAt" = NOW()
           WHERE "tripId" = $1 AND "userId" = $2 AND status = 'accepted'`,
          [id, userId]
        ).catch(() => {});
      }
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

      return res.status(200).json({ trip, itinerary, tripDays, tripItems, tripNotes, tripBookings, assets, itineraryDayStops, hiddenStopIds, access: tripAccess });
    }

    // ── GET /api/trips?id= — single trip (basic) ───────────────────────────
    if (req.method === 'GET' && id && !action) {
      const singleAccess = await getTripAccess(id);
      if (!singleAccess.canView) return res.status(404).json({ error: 'Trip not found' });

      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, country, duration, overview,
                highlights, hotels, experiences, source, "coverImage",
                "itinerarySlug", "itineraryId", "createdAt"
         FROM "Trip" WHERE id = $1`,
        [id]
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
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });

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
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });

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
        `SELECT "tripId" FROM "TripItem" WHERE id = $1`, [itemId]
      );
      if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });
      const itemAccess = await getTripAccess(itemRows[0].tripId);
      if (!itemAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });

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
      const { rows: itemForDel } = await pool.query(
        `SELECT "tripId" FROM "TripItem" WHERE id = $1`, [itemId]
      );
      if (!itemForDel.length) return res.status(404).json({ error: 'Item not found' });
      const delItemAccess = await getTripAccess(itemForDel[0].tripId);
      if (!delItemAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });
      await pool.query(`DELETE FROM "TripItem" WHERE id = $1`, [itemId]);
      return res.status(200).json({ ok: true });
    }

    // Create TripNote
    if (req.method === 'POST' && action === 'note' && id && !noteId) {
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });

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
        `SELECT "tripId" FROM "TripNote" WHERE id = $1`, [noteId]
      );
      if (!noteRows.length) return res.status(404).json({ error: 'Note not found' });
      const noteAccess = await getTripAccess(noteRows[0].tripId);
      if (!noteAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });

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
      const { rows: noteForDel } = await pool.query(
        `SELECT "tripId" FROM "TripNote" WHERE id = $1`, [noteId]
      );
      if (!noteForDel.length) return res.status(404).json({ error: 'Note not found' });
      const delNoteAccess = await getTripAccess(noteForDel[0].tripId);
      if (!delNoteAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });
      await pool.query(`DELETE FROM "TripNote" WHERE id = $1`, [noteId]);
      return res.status(200).json({ ok: true });
    }

    // Create TripBooking
    if (req.method === 'POST' && action === 'booking' && id && !bookingId) {
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });

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
        `SELECT id, type AS "currentType", "tripId" FROM "TripBooking" WHERE id = $1`,
        [bookingId]
      );
      if (!bookingRows.length) return res.status(404).json({ error: 'Booking not found' });
      const bookAccess = await getTripAccess(bookingRows[0].tripId);
      if (!bookAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });

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
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });

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
      const { rows: bookForDel } = await pool.query(
        `SELECT "tripId" FROM "TripBooking" WHERE id = $1`, [bookingId]
      );
      if (!bookForDel.length) return res.status(404).json({ error: 'Booking not found' });
      const delBookAccess = await getTripAccess(bookForDel[0].tripId);
      if (!delBookAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });
      await pool.query(`DELETE FROM "TripBooking" WHERE id = $1`, [bookingId]);
      return res.status(200).json({ ok: true });
    }

    // Hide an original ItineraryDayStop from this trip (creates a hidden override TripItem)
    if (req.method === 'POST' && action === 'hide-itinerary-stop' && id) {
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });
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
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });
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
      const access = await getTripAccess(id);
      if (!access.canEdit) return res.status(access.canView ? 403 : 404).json({ error: access.canView ? 'Permission denied' : 'Trip not found' });
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
        `SELECT "tripId" FROM "TripDay" WHERE id = $1`, [dayId]
      );
      if (!dayRows.length) return res.status(404).json({ error: 'Day not found' });
      const dayAccess = await getTripAccess(dayRows[0].tripId);
      if (!dayAccess.canEdit) return res.status(403).json({ error: 'Permission denied' });

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
    if (req.method === 'POST' && id && !action) {
      const { eventType, metadata = {} } = req.body || {};

      if (eventType !== 'DOWNLOADED') {
        return res.status(400).json({ error: 'Invalid eventType. Allowed via POST: DOWNLOADED' });
      }

      const auditAccess = await getTripAccess(id);
      if (!auditAccess.canView) return res.status(404).json({ error: 'Trip not found' });
      const { rows: trips } = await pool.query(
        `SELECT id, destination FROM "Trip" WHERE id = $1`, [id]
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
    if (req.method === 'POST' && !id && !action) {
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

    // ── GET /api/trips?action=shares-list&id=<tripId> — list shares (owner) ──
    if (req.method === 'GET' && action === 'shares-list') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });
      const access = await getTripAccess(id);
      if (!access.canManageSharing) return res.status(access.canView ? 403 : 404).json({ error: 'Not found' });
      const { rows: shares } = await pool.query(
        `SELECT ts.id, ts.email, ts.role, ts.status, ts."inviteToken",
                ts."invitedAt", ts."acceptedAt", ts."revokedAt",
                u.name AS "userName", u.email AS "userEmail"
         FROM "TripShare" ts
         LEFT JOIN "User" u ON u.id = ts."userId"
         WHERE ts."tripId" = $1
         ORDER BY ts."createdAt" ASC`,
        [id]
      );
      return res.status(200).json(shares.map(s => ({
        id: s.id,
        email: s.userEmail || s.email,
        displayName: s.userName || s.userEmail || s.email || 'Link invite',
        role: s.role,
        status: s.status,
        inviteToken: s.inviteToken,
        shareLink: shareLink(s.inviteToken),
        invitedAt: s.invitedAt,
        acceptedAt: s.acceptedAt,
        revokedAt: s.revokedAt,
      })));
    }

    // ── POST /api/trips?action=shares-create&id=<tripId> — create share ──────
    if (req.method === 'POST' && action === 'shares-create') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });
      const access = await getTripAccess(id);
      if (!access.canManageSharing) return res.status(access.canView ? 403 : 404).json({ error: 'Not found' });

      const { rows: tripRows } = await pool.query(
        `SELECT title, destination FROM "Trip" WHERE id = $1`, [id]
      );
      if (!tripRows.length) return res.status(404).json({ error: 'Trip not found' });
      const tripRow = tripRows[0];

      const { rows: inviterRows } = await pool.query(
        `SELECT email, name FROM "User" WHERE id = $1`, [userId]
      );
      const inviter = inviterRows[0] || {};

      const { email: rawEmail, role = 'view', sendEmail: doSend = false } = req.body || {};
      if (!['view', 'edit'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      const email = rawEmail ? rawEmail.toLowerCase().trim() : null;

      if (email) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM "TripShare" WHERE "tripId" = $1 AND lower(email) = $2 AND status <> 'revoked'`,
          [id, email]
        );
        if (existing.length) return res.status(409).json({ error: 'An active invite already exists for this email.' });
      }

      const inviteToken = generateShareToken();
      const { rows: inserted } = await pool.query(
        `INSERT INTO "TripShare"
           (id, "tripId", email, role, status, "inviteToken", "invitedByUserId", "invitedAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5, NOW(), NOW(), NOW())
         RETURNING id, "inviteToken"`,
        [id, email, role, inviteToken, userId]
      );
      const created = inserted[0];
      const link = shareLink(created.inviteToken);

      if (email && doSend) {
        try {
          await sendInviteEmail({
            to: email,
            inviterName: inviter.name || inviter.email,
            tripTitle: tripRow.title || tripRow.destination,
            role,
            acceptLink: link,
          });
        } catch (emailErr) {
          console.error('[trips/shares-create] email failed:', emailErr.message);
        }
      }
      return res.status(201).json({ id: created.id, shareLink: link, inviteToken: created.inviteToken });
    }

    // ── POST /api/trips?action=shares-accept&token=<t> — accept invite ────────
    if (req.method === 'POST' && action === 'shares-accept') {
      const token = req.query.token || req.body?.token;
      if (!token) return res.status(400).json({ error: 'Missing token' });

      const { rows: shareRows } = await pool.query(
        `SELECT ts.id, ts."tripId", ts.email, ts."userId", ts.status, ts.role,
                t.title, t.destination
         FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts."inviteToken" = $1`,
        [token]
      );
      if (!shareRows.length) return res.status(404).json({ error: 'Invite not found.' });
      const share = shareRows[0];

      if (share.status === 'revoked') return res.status(410).json({ error: 'This invite has been revoked.' });

      // Owner accepting their own trip
      const { rows: ownCheck } = await pool.query(
        `SELECT id FROM "Trip" WHERE id = $1 AND "userId" = $2`, [share.tripId, userId]
      );
      if (ownCheck.length) return res.status(200).json({ tripId: share.tripId, alreadyHasAccess: true });

      // Email mismatch
      const { rows: userRows } = await pool.query(`SELECT email FROM "User" WHERE id = $1`, [userId]);
      const userEmail = userRows[0]?.email || '';
      if (share.email && share.email.toLowerCase() !== userEmail.toLowerCase()) {
        return res.status(403).json({
          error: `This invite was sent to ${share.email}. Please sign in with that email or ask the owner for a new invite.`,
          emailMismatch: true,
        });
      }

      // Already accepted by this user
      if (share.userId === userId && share.status === 'accepted') {
        return res.status(200).json({ tripId: share.tripId, alreadyAccepted: true });
      }

      // Already accepted by someone else
      if (share.userId && share.userId !== userId && share.status === 'accepted') {
        return res.status(409).json({ error: 'This invitation has already been accepted by another account.' });
      }

      await pool.query(
        `UPDATE "TripShare" SET "userId" = $1, status = 'accepted', "acceptedAt" = NOW(), "updatedAt" = NOW() WHERE id = $2`,
        [userId, share.id]
      );
      return res.status(200).json({ tripId: share.tripId, accepted: true });
    }

    // ── PATCH /api/trips?action=shares-update-role&shareId=<id> — update role ─
    if (req.method === 'PATCH' && action === 'shares-update-role') {
      const shareId = req.query.shareId || req.body?.shareId;
      if (!shareId) return res.status(400).json({ error: 'Missing shareId' });
      const { rows: shareRows } = await pool.query(
        `SELECT ts.id, ts."tripId" FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts.id = $1 AND t."userId" = $2`,
        [shareId, userId]
      );
      if (!shareRows.length) return res.status(404).json({ error: 'Share not found' });
      const { role } = req.body || {};
      if (!['view', 'edit'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      await pool.query(`UPDATE "TripShare" SET role = $1, "updatedAt" = NOW() WHERE id = $2`, [role, shareId]);
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/trips?action=shares-revoke&shareId=<id> — revoke ──────────
    if (req.method === 'POST' && action === 'shares-revoke') {
      const shareId = req.query.shareId || req.body?.shareId;
      if (!shareId) return res.status(400).json({ error: 'Missing shareId' });
      const { rows: shareRows } = await pool.query(
        `SELECT ts.id FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts.id = $1 AND t."userId" = $2`,
        [shareId, userId]
      );
      if (!shareRows.length) return res.status(404).json({ error: 'Share not found' });
      await pool.query(
        `UPDATE "TripShare" SET status = 'revoked', "revokedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
        [shareId]
      );
      return res.status(200).json({ ok: true });
    }

    // ── DELETE /api/trips?id= — delete trip (owner only) ───────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });

      const deleteAccess = await getTripAccess(id);
      if (!deleteAccess.canManageSharing) {
        return res.status(deleteAccess.canView ? 403 : 404).json({ error: deleteAccess.canView ? 'Only the trip owner can delete this trip' : 'Trip not found' });
      }

      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, duration FROM "Trip" WHERE id = $1`, [id]
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
