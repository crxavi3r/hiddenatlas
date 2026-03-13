import pg from 'pg';
import { createTripEvent } from '../_lib/audit.js';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

// POST /api/trips/save
// Saves a trip and writes a SAVED audit event.
//
// Deduplication strategy:
//   - Curated itineraries (FREE_JOURNEY / PREMIUM_JOURNEY) that include an
//     itinerarySlug: permanent dedup on (userId, itinerarySlug). No time limit.
//     If the user opens the same itinerary again we return the existing row.
//   - AI_GENERATED trips (no slug): dedup within 1 hour by (userId, destination, source).
//     Users may legitimately generate multiple AI trips to the same destination.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { trip, source = 'AI_GENERATED' } = req.body || {};
  if (!trip?.destination) {
    return res.status(400).json({ error: 'Missing trip data — expected { trip: { destination, ... } }' });
  }

  const coverImage = (typeof trip.coverImage === 'string' && trip.coverImage.startsWith('http'))
    ? trip.coverImage
    : null;
  const validSources = ['AI_GENERATED', 'FREE_JOURNEY', 'PREMIUM_JOURNEY'];
  const tripSource   = validSources.includes(source) ? source : 'AI_GENERATED';
  const itinerarySlug = (typeof trip.itinerarySlug === 'string' && trip.itinerarySlug)
    ? trip.itinerarySlug
    : null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) {
      return res.status(404).json({ error: 'User not found. Please sign out and sign in again.' });
    }
    const userId = users[0].id;

    // ── Deduplication ────────────────────────────────────────────────────────

    if (itinerarySlug) {
      // Curated itinerary: one row per user per slug, permanently.
      const { rows: existing } = await pool.query(
        `SELECT id FROM "Trip" WHERE "userId" = $1 AND "itinerarySlug" = $2 LIMIT 1`,
        [userId, itinerarySlug]
      );
      if (existing.length) {
        return res.status(200).json({ id: existing[0].id, deduplicated: true });
      }
    } else {
      // AI trip: allow multiple trips to the same destination, but deduplicate
      // within a 1-hour window to absorb rapid re-saves from the same session.
      const { rows: existing } = await pool.query(
        `SELECT id FROM "Trip"
         WHERE "userId" = $1
           AND destination = $2
           AND source = $3
           AND "createdAt" > NOW() - INTERVAL '1 hour'
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        [userId, trip.destination, tripSource]
      );
      if (existing.length) {
        return res.status(200).json({ id: existing[0].id, deduplicated: true });
      }
    }

    // ── Insert ───────────────────────────────────────────────────────────────
    // ON CONFLICT DO NOTHING guards against the race condition where two
    // concurrent requests both pass the dedup check above and then both insert.
    const { rows: trips } = await pool.query(
      `INSERT INTO "Trip" (id, "userId", "itinerarySlug", title, destination, country, duration, overview, highlights, hotels, experiences, source, "coverImage", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, NOW())
       ON CONFLICT ("userId", "itinerarySlug") WHERE "itinerarySlug" IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        userId,
        itinerarySlug,
        trip.destination,
        trip.destination,
        trip.country     || '',
        trip.duration    || '',
        trip.overview    || '',
        JSON.stringify(trip.highlights   || []),
        JSON.stringify(trip.hotels       || []),
        JSON.stringify(trip.experiences  || []),
        tripSource,
        coverImage,
      ]
    );

    // If DO NOTHING fired (race condition), fetch the row that won the race.
    if (!trips.length) {
      if (itinerarySlug) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM "Trip" WHERE "userId" = $1 AND "itinerarySlug" = $2 LIMIT 1`,
          [userId, itinerarySlug]
        );
        return res.status(200).json({ id: existing[0]?.id, deduplicated: true });
      }
      // AI trip with no slug — very unlikely to hit this path, but handle safely.
      return res.status(200).json({ id: null, deduplicated: true });
    }

    const tripId = trips[0].id;

    // ── TripDay rows ─────────────────────────────────────────────────────────
    const days = Array.isArray(trip.days) ? trip.days : [];
    for (const day of days) {
      await pool.query(
        `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [tripId, day.day || 0, day.title || '', day.description || '']
      );
    }

    // ── Audit: SAVED ─────────────────────────────────────────────────────────
    await createTripEvent(pool, {
      userId,
      tripId,
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
  } catch (err) {
    console.error('[save] DB error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
