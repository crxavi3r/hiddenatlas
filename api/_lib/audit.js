// Shared audit helper — writes a single TripEvent row.
// Accepts an already-open pg Pool so the caller controls connection lifecycle.
// tripId is optional: pass null when the trip no longer exists or is unavailable.
export async function createTripEvent(pool, { userId, tripId = null, eventType, metadata = {} }) {
  await pool.query(
    `INSERT INTO "TripEvent" (id, "userId", "tripId", "eventType", metadata, "createdAt")
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, NOW())`,
    [userId, tripId, eventType, JSON.stringify(metadata)]
  );
}
