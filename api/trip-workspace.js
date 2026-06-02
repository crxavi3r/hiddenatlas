import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET  /api/trip-workspace?id=<tripId>                        — full workspace data
// POST /api/trip-workspace?id=<tripId>&action=details         — update trip personal fields
// POST /api/trip-workspace?id=<tripId>&action=item            — create TripItem
// POST /api/trip-workspace?action=item&itemId=<id>            — update TripItem
// POST /api/trip-workspace?action=delete-item&itemId=<id>     — delete TripItem
// POST /api/trip-workspace?id=<tripId>&action=note            — create TripNote
// POST /api/trip-workspace?action=note&noteId=<id>            — update TripNote
// POST /api/trip-workspace?action=delete-note&noteId=<id>     — delete TripNote
// POST /api/trip-workspace?id=<tripId>&action=booking         — create TripBooking
// POST /api/trip-workspace?action=booking&bookingId=<id>      — update TripBooking
// POST /api/trip-workspace?action=delete-booking&bookingId=<id> — delete TripBooking
// POST /api/trip-workspace?action=day&dayId=<id>              — update TripDay overrides
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
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

    // ── GET — full workspace data ──────────────────────────────────────────
    if (req.method === 'GET') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });

      // Fetch trip with all fields
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

      // Resolve itinerary via itineraryId or itinerarySlug
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

      // Fetch TripDays ordered by sortOrder then dayNumber
      const { rows: tripDays } = await pool.query(
        `SELECT id, "tripId", "dayNumber", title, description,
                "sourceDayNumber", "titleOverride", "descriptionOverride",
                notes, "sortOrder", "isHidden", "updatedAt"
         FROM "TripDay"
         WHERE "tripId" = $1
         ORDER BY "sortOrder" ASC, "dayNumber" ASC`,
        [id]
      );

      // Fetch TripItems
      const { rows: tripItems } = await pool.query(
        `SELECT id, "tripId", "tripDayId", type, title, description,
                time, duration, location, notes, "bookingRef",
                status, "isHidden", "sortOrder", "sourceItemId", metadata,
                "createdAt", "updatedAt"
         FROM "TripItem"
         WHERE "tripId" = $1 AND "isHidden" = false
         ORDER BY "tripDayId" NULLS LAST, "sortOrder" ASC, "createdAt" ASC`,
        [id]
      );

      // Fetch TripNotes
      const { rows: tripNotes } = await pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", type, title, content,
                "createdAt", "updatedAt"
         FROM "TripNote"
         WHERE "tripId" = $1
         ORDER BY "createdAt" ASC`,
        [id]
      );

      // Fetch TripBookings
      const { rows: tripBookings } = await pool.query(
        `SELECT id, "tripId", "tripDayId", "tripItemId", category, title,
                date, time, location, provider, reference, notes, url,
                "attachmentUrl", "createdAt", "updatedAt"
         FROM "TripBooking"
         WHERE "tripId" = $1
         ORDER BY date ASC NULLS LAST, "createdAt" ASC`,
        [id]
      );

      // Fetch ItineraryAssets
      let assets = [];
      const itineraryId = itinerary?.id;
      if (itineraryId) {
        const { rows } = await pool.query(
          `SELECT id, "itineraryId", "assetType", url, alt, caption, "sortOrder", source, active, "createdAt"
           FROM "ItineraryAsset"
           WHERE "itineraryId" = $1 AND active = true
           ORDER BY "sortOrder" ASC, "createdAt" ASC`,
          [itineraryId]
        );
        assets = rows;
      }

      return res.status(200).json({
        trip,
        itinerary,
        tripDays,
        tripItems,
        tripNotes,
        tripBookings,
        assets,
      });
    }

    // ── POST — mutations ───────────────────────────────────────────────────

    // Update trip personal details
    if (action === 'details') {
      if (!id) return res.status(400).json({ error: 'Missing trip id' });
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const {
        startDate, endDate, travellers, accommodationSummary,
        arrivalInfo, departureInfo, generalNotes, subtitle, heroImage,
      } = req.body || {};

      await pool.query(
        `UPDATE "Trip"
         SET
           "startDate" = $1,
           "endDate" = $2,
           travellers = $3,
           "accommodationSummary" = $4,
           "arrivalInfo" = $5,
           "departureInfo" = $6,
           "generalNotes" = $7,
           subtitle = $8,
           "heroImage" = $9,
           "updatedAt" = NOW()
         WHERE id = $10`,
        [
          startDate || null,
          endDate || null,
          travellers != null ? Number(travellers) : null,
          accommodationSummary || null,
          arrivalInfo || null,
          departureInfo || null,
          generalNotes || null,
          subtitle || null,
          heroImage || null,
          id,
        ]
      );
      return res.status(200).json({ ok: true });
    }

    // Create TripItem
    if (action === 'item' && id && !itemId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripDayId, type, title, description, time, duration, location, notes, sortOrder } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title is required' });

      const { rows } = await pool.query(
        `INSERT INTO "TripItem" (id, "tripId", "tripDayId", type, title, description, time, duration, location, notes, "sortOrder", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING id`,
        [
          id,
          tripDayId || null,
          type || 'place',
          title,
          description || null,
          time || null,
          duration || null,
          location || null,
          notes || null,
          sortOrder != null ? Number(sortOrder) : 0,
        ]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    // Update TripItem
    if (action === 'item' && itemId && !id) {
      // Find item and validate ownership via its trip
      const { rows: itemRows } = await pool.query(
        `SELECT ti.id, ti."tripId" FROM "TripItem" ti
         JOIN "Trip" t ON t.id = ti."tripId"
         WHERE ti.id = $1 AND t."userId" = $2`,
        [itemId, userId]
      );
      if (!itemRows.length) return res.status(404).json({ error: 'Item not found' });

      const { type, title, description, time, duration, location, notes, bookingRef, status, sortOrder } = req.body || {};

      await pool.query(
        `UPDATE "TripItem"
         SET type = COALESCE($1, type),
             title = COALESCE($2, title),
             description = $3,
             time = $4,
             duration = $5,
             location = $6,
             notes = $7,
             "bookingRef" = $8,
             status = COALESCE($9, status),
             "sortOrder" = COALESCE($10, "sortOrder"),
             "updatedAt" = NOW()
         WHERE id = $11`,
        [type || null, title || null, description || null, time || null,
         duration || null, location || null, notes || null,
         bookingRef || null, status || null,
         sortOrder != null ? Number(sortOrder) : null,
         itemId]
      );
      return res.status(200).json({ ok: true });
    }

    // Delete TripItem
    if (action === 'delete-item' && itemId) {
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
    if (action === 'note' && id && !noteId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripDayId, tripItemId, type, title, content } = req.body || {};
      if (!content) return res.status(400).json({ error: 'content is required' });

      const { rows } = await pool.query(
        `INSERT INTO "TripNote" (id, "tripId", "tripDayId", "tripItemId", type, title, content, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING id`,
        [id, tripDayId || null, tripItemId || null, type || 'general', title || null, content]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    // Update TripNote
    if (action === 'note' && noteId && !id) {
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
    if (action === 'delete-note' && noteId) {
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
    if (action === 'booking' && id && !bookingId) {
      const owned = await getOwnedTrip(id);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { tripDayId, tripItemId, category, title, date, time, location, provider, reference, notes, url } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title is required' });

      const { rows } = await pool.query(
        `INSERT INTO "TripBooking" (id, "tripId", "tripDayId", "tripItemId", category, title, date, time, location, provider, reference, notes, url, "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING id`,
        [
          id,
          tripDayId || null,
          tripItemId || null,
          category || 'other',
          title,
          date || null,
          time || null,
          location || null,
          provider || null,
          reference || null,
          notes || null,
          url || null,
        ]
      );
      return res.status(200).json({ id: rows[0].id });
    }

    // Update TripBooking
    if (action === 'booking' && bookingId && !id) {
      const { rows: bookingRows } = await pool.query(
        `SELECT tb.id FROM "TripBooking" tb
         JOIN "Trip" t ON t.id = tb."tripId"
         WHERE tb.id = $1 AND t."userId" = $2`,
        [bookingId, userId]
      );
      if (!bookingRows.length) return res.status(404).json({ error: 'Booking not found' });

      const { category, title, date, time, location, provider, reference, notes, url } = req.body || {};
      await pool.query(
        `UPDATE "TripBooking"
         SET category = COALESCE($1, category),
             title = COALESCE($2, title),
             date = $3,
             time = $4,
             location = $5,
             provider = $6,
             reference = $7,
             notes = $8,
             url = $9,
             "updatedAt" = NOW()
         WHERE id = $10`,
        [category || null, title || null, date || null, time || null,
         location || null, provider || null, reference || null,
         notes || null, url || null, bookingId]
      );
      return res.status(200).json({ ok: true });
    }

    // Delete TripBooking
    if (action === 'delete-booking' && bookingId) {
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

    // Update TripDay overrides
    if (action === 'day' && dayId) {
      // Validate ownership via trip
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
         SET "titleOverride" = $1,
             "descriptionOverride" = $2,
             notes = $3,
             "isHidden" = COALESCE($4, "isHidden"),
             "updatedAt" = NOW()
         WHERE id = $5`,
        [titleOverride || null, descriptionOverride || null, notes || null,
         isHidden != null ? Boolean(isHidden) : null, dayId]
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('[api/trip-workspace] error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
