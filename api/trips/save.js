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
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    clerkId = payload.sub;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── Validate body ────────────────────────────────────────────
  const { trip } = req.body || {};
  if (!trip?.destination) {
    return res.status(400).json({ error: 'Missing trip data' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve DB user from clerkId — never trust userId from the client
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) {
      return res.status(404).json({ error: 'User not found. Please sign out and sign in again.' });
    }
    const userId = users[0].id;

    // Insert Trip row
    const { rows: trips } = await pool.query(
      `INSERT INTO "Trip" (id, "userId", title, destination, country, duration, overview, highlights, hotels, experiences, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, NOW())
       RETURNING id`,
      [
        userId,
        trip.destination,
        trip.destination,
        trip.country   || '',
        trip.duration  || '',
        trip.overview  || '',
        JSON.stringify(trip.highlights   || []),
        JSON.stringify(trip.hotels       || []),
        JSON.stringify(trip.experiences  || []),
      ]
    );
    const tripId = trips[0].id;

    // Insert TripDay rows (one per day from the AI response)
    if (Array.isArray(trip.days) && trip.days.length > 0) {
      for (const day of trip.days) {
        await pool.query(
          `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
          [
            tripId,
            day.day         || 0,
            day.title       || '',
            day.description || '',
          ]
        );
      }
    }

    return res.status(200).json({ id: tripId });
  } catch (err) {
    console.error('[api/trips/save] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
