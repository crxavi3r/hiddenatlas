// ── duplicateTrip.js ──────────────────────────────────────────────────────────
// Creates a fully independent deep copy of a Trip and all its child records.
//
// Copies:   Trip, TripDay, TripItem, TripNote, TripBooking
// Skips:    TripShare (sharing state), TripEvent (audit log), PDF state
//
// ID remapping:
//   Creates mapping of oldId → newId for TripDay and TripItem so that
//   TripNote.tripDayId, TripNote.tripItemId, TripBooking.tripDayId,
//   TripBooking.tripItemId all point to the DUPLICATE records, not the source.
//
// The caller is responsible for wrapping this in a transaction if needed.

/**
 * @param {import('pg').Pool} pool
 * @param {string} sourceTripId   — ID of the Trip to duplicate
 * @param {object} overrides      — fields to override on the new Trip row
 * @param {string} overrides.userId       — required: owner of the new Trip
 * @param {string} [overrides.title]
 * @param {string} [overrides.tripType]   — defaults to 'personal' (must be a valid Trip.tripType)
 * @param {string} [overrides.createdFrom] — defaults to 'duplicate'
 * @returns {Promise<string>}  ID of the newly created Trip
 */
export async function duplicateTrip(pool, sourceTripId, overrides = {}) {
  // tripType must be a valid existing Trip.tripType value — 'personal' is correct for agency trips
  const { userId, title, tripType = 'personal', createdFrom = 'duplicate' } = overrides;
  if (!userId) throw new Error('duplicateTrip: userId is required');

  // ── 1. Load source trip ────────────────────────────────────────────────────
  const { rows: srcRows } = await pool.query(
    `SELECT * FROM "Trip" WHERE id = $1 LIMIT 1`,
    [sourceTripId]
  );
  if (!srcRows.length) throw new Error(`duplicateTrip: Trip ${sourceTripId} not found`);
  const src = srcRows[0];

  // ── 2. Create new Trip ─────────────────────────────────────────────────────
  const newTitle = title || src.title;
  const { rows: tripRows } = await pool.query(
    `INSERT INTO "Trip" (
       id, "userId", "itinerarySlug", "itineraryId",
       title, destination, country, duration, overview,
       highlights, hotels, experiences, source,
       "coverImage", subtitle, "durationDays", "heroImage",
       "startDate", "endDate", travellers,
       "accommodationSummary", "arrivalInfo", "departureInfo", "generalNotes",
       "personalPdfConfig", "itinerarySnapshot",
       "tripType", "createdFrom", "isEditable",
       "pdfStatus", "createdAt", "updatedAt"
     ) VALUES (
       gen_random_uuid(), $1, $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18, $19,
       $20, $21, $22, $23,
       $24, $25,
       $26, $27, true,
       'idle', NOW(), NOW()
     ) RETURNING id`,
    [
      userId,
      src.itinerarySlug,
      src.itineraryId,
      newTitle,
      src.destination,
      src.country || '',
      src.duration || '',
      src.overview || '',
      src.highlights || '[]',
      src.hotels     || '[]',
      src.experiences || '[]',
      src.source || 'MANUAL',
      src.coverImage,
      src.subtitle,
      src.durationDays,
      src.heroImage,
      src.startDate,
      src.endDate,
      src.travellers,
      src.accommodationSummary,
      src.arrivalInfo,
      src.departureInfo,
      src.generalNotes,
      src.personalPdfConfig || '{}',
      src.itinerarySnapshot || '{}',
      tripType,
      createdFrom,
    ]
  );
  const newTripId = tripRows[0].id;

  // ── 3. Duplicate TripDays — build oldDayId → newDayId map ─────────────────
  const { rows: srcDays } = await pool.query(
    `SELECT * FROM "TripDay" WHERE "tripId" = $1 ORDER BY "sortOrder", "dayNumber"`,
    [sourceTripId]
  );

  const dayIdMap = new Map(); // oldId → newId

  for (const day of srcDays) {
    const { rows: newDayRows } = await pool.query(
      `INSERT INTO "TripDay" (
         id, "tripId", "dayNumber", title, description,
         "sourceDayNumber", "titleOverride", "descriptionOverride",
         notes, "sortOrder", "isHidden", "resetToOriginal", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9, $10, $11, NOW()
       ) RETURNING id`,
      [
        newTripId,
        day.dayNumber,
        day.title || '',
        day.description || '',
        day.sourceDayNumber,
        day.titleOverride,
        day.descriptionOverride,
        day.notes,
        day.sortOrder ?? 0,
        day.isHidden ?? false,
        day.resetToOriginal ?? false,
      ]
    );
    dayIdMap.set(day.id, newDayRows[0].id);
  }

  // ── 4. Duplicate TripItems — build oldItemId → newItemId map ──────────────
  const { rows: srcItems } = await pool.query(
    `SELECT * FROM "TripItem" WHERE "tripId" = $1 ORDER BY "sortOrder"`,
    [sourceTripId]
  );

  const itemIdMap = new Map(); // oldId → newId

  for (const item of srcItems) {
    const newDayId = item.tripDayId ? (dayIdMap.get(item.tripDayId) ?? null) : null;
    const { rows: newItemRows } = await pool.query(
      `INSERT INTO "TripItem" (
         id, "tripId", "tripDayId", "dayNumber",
         "sourceType", "sourceKey", "sourceTitle",
         title, description, type,
         "locationName", address, latitude, longitude,
         "startTime", "endTime", "durationMinutes",
         status, notes, "bookingReference", provider, url,
         "isHidden", "isLocked", "sortOrder", metadata,
         "imageUrl", "imageAlt", time,
         "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16,
         $17, $18, $19, $20, $21,
         $22, $23, $24, $25,
         $26, $27, $28,
         NOW(), NOW()
       ) RETURNING id`,
      [
        newTripId,
        newDayId,
        item.dayNumber,
        item.sourceType,
        item.sourceKey,
        item.sourceTitle,
        item.title,
        item.description,
        item.type || 'place',
        item.locationName,
        item.address,
        item.latitude,
        item.longitude,
        item.startTime,
        item.endTime,
        item.durationMinutes,
        item.status || 'planned',
        item.notes,
        item.bookingReference,
        item.provider,
        item.url,
        item.isHidden ?? false,
        item.isLocked ?? false,
        item.sortOrder ?? 0,
        item.metadata || '{}',
        item.imageUrl,
        item.imageAlt,
        item.time,
      ]
    );
    itemIdMap.set(item.id, newItemRows[0].id);
  }

  // ── 5. Duplicate TripNotes — remap dayId and itemId ───────────────────────
  const { rows: srcNotes } = await pool.query(
    `SELECT * FROM "TripNote" WHERE "tripId" = $1`,
    [sourceTripId]
  );

  for (const note of srcNotes) {
    const newDayId  = note.tripDayId  ? (dayIdMap.get(note.tripDayId)   ?? null) : null;
    const newItemId = note.tripItemId ? (itemIdMap.get(note.tripItemId)  ?? null) : null;
    await pool.query(
      `INSERT INTO "TripNote" (
         id, "tripId", "tripDayId", "tripItemId", "dayNumber",
         title, content, "noteType", "isPinned", metadata,
         "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         NOW(), NOW()
       )`,
      [
        newTripId,
        newDayId,
        newItemId,
        note.dayNumber,
        note.title,
        note.content,
        note.noteType || 'general',
        note.isPinned ?? false,
        note.metadata || '{}',
      ]
    );
  }

  // ── 6. Duplicate TripBookings — remap dayId and itemId ───────────────────
  const { rows: srcBookings } = await pool.query(
    `SELECT * FROM "TripBooking" WHERE "tripId" = $1`,
    [sourceTripId]
  );

  for (const booking of srcBookings) {
    const newDayId  = booking.tripDayId  ? (dayIdMap.get(booking.tripDayId)   ?? null) : null;
    const newItemId = booking.tripItemId ? (itemIdMap.get(booking.tripItemId)  ?? null) : null;
    await pool.query(
      `INSERT INTO "TripBooking" (
         id, "tripId", "tripDayId", "tripItemId", "dayNumber",
         type, title, provider, date, time,
         "locationName", address, latitude, longitude,
         "confirmationReference", notes, url, "attachmentUrl",
         status, metadata,
         "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4,
         $5, $6, $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19,
         NOW(), NOW()
       )`,
      [
        newTripId,
        newDayId,
        newItemId,
        booking.dayNumber,
        booking.type || 'other',
        booking.title,
        booking.provider,
        booking.date,
        booking.time,
        booking.locationName,
        booking.address,
        booking.latitude,
        booking.longitude,
        booking.confirmationReference,
        booking.notes,
        booking.url,
        booking.attachmentUrl,
        booking.status,
        booking.metadata || '{}',
      ]
    );
  }

  return newTripId;
}
