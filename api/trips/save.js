import { verifyToken } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;

// POST /api/trips/save
// Saves an AI-generated trip for the authenticated user.
// Body: { trip: { destination, country, duration, overview, highlights, hotels, experiences, days } }
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    console.log('[save] missing auth header');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    console.error('[save] missing env vars — CLERK_SECRET_KEY:', !!process.env.CLERK_SECRET_KEY, 'DATABASE_URL:', !!process.env.DATABASE_URL);
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkId = payload.sub;
    console.log('[save] clerkId:', clerkId);
  } catch (err) {
    console.error('[save] token verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── Validate body ────────────────────────────────────────────
  const { trip } = req.body || {};
  console.log('[save] body keys:', Object.keys(req.body || {}), '| trip.destination:', trip?.destination);
  if (!trip?.destination) {
    return res.status(400).json({ error: 'Missing trip data — expected { trip: { destination, ... } }' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve DB user — userId never comes from the client
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    console.log('[save] user lookup rows:', users.length);
    if (!users.length) {
      return res.status(404).json({ error: 'User not found. Please sign out and sign in again.' });
    }
    const userId = users[0].id;

    // Insert Trip
    const { rows: trips } = await pool.query(
      `INSERT INTO "Trip" (id, "userId", title, destination, country, duration, overview, highlights, hotels, experiences, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
       RETURNING id`,
      [
        userId,
        trip.destination,
        trip.destination,
        trip.country      || '',
        trip.duration     || '',
        trip.overview     || '',
        JSON.stringify(trip.highlights   || []),
        JSON.stringify(trip.hotels       || []),
        JSON.stringify(trip.experiences  || []),
      ]
    );
    const tripId = trips[0].id;
    console.log('[save] Trip created:', tripId);

    // Insert TripDay rows
    const days = Array.isArray(trip.days) ? trip.days : [];
    console.log('[save] inserting', days.length, 'days');
    for (const day of days) {
      await pool.query(
        `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [tripId, day.day || 0, day.title || '', day.description || '']
      );
    }

    console.log('[save] done — tripId:', tripId);
    return res.status(200).json({ id: tripId });
  } catch (err) {
    console.error('[save] DB error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
