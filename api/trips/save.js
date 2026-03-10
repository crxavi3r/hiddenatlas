import { verifyToken } from '@clerk/backend';
import pg from 'pg';
import { createTripEvent } from '../_lib/audit.js';

const { Pool } = pg;

// POST /api/trips/save
// Saves an AI-generated trip and writes a SAVED audit event.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.log('[save] clerkId:', clerkId);
  } catch (err) {
    console.error('[save] token verify failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { trip, source = 'AI_GENERATED' } = req.body || {};
  console.log('[save] trip.destination:', trip?.destination, '| source:', source);
  if (!trip?.destination) {
    return res.status(400).json({ error: 'Missing trip data — expected { trip: { destination, ... } }' });
  }
  const coverImage = (typeof trip.coverImage === 'string' && trip.coverImage.startsWith('http'))
    ? trip.coverImage
    : null;
  const validSources = ['AI_GENERATED', 'FREE_JOURNEY', 'PREMIUM_JOURNEY'];
  const tripSource = validSources.includes(source) ? source : 'AI_GENERATED';

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    console.log('[save] user lookup rows:', users.length);
    if (!users.length) {
      return res.status(404).json({ error: 'User not found. Please sign out and sign in again.' });
    }
    const userId = users[0].id;

    // Deduplication: same user + same destination + same source within 1 hour.
    // Source is included so AI_GENERATED and FREE_JOURNEY are treated as distinct
    // even when the destination string happens to be the same.
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
      const existingId = existing[0].id;
      console.log('[save] dedup: returning existing trip:', existingId);
      return res.status(200).json({ id: existingId, deduplicated: true });
    }

    // Ensure coverImage column exists (idempotent — no-op after first run)
    await pool.query(
      `ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "coverImage" TEXT DEFAULT NULL`
    ).catch(err => console.warn('[save] coverImage column migration warning:', err.message));

    // Insert Trip
    const { rows: trips } = await pool.query(
      `INSERT INTO "Trip" (id, "userId", title, destination, country, duration, overview, highlights, hotels, experiences, source, "coverImage", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, NOW())
       RETURNING id`,
      [
        userId,
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
    const tripId = trips[0].id;
    console.log('[save] Trip created:', tripId);

    // Insert TripDay rows
    const days = Array.isArray(trip.days) ? trip.days : [];
    for (const day of days) {
      await pool.query(
        `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [tripId, day.day || 0, day.title || '', day.description || '']
      );
    }

    // Audit: SAVED
    await createTripEvent(pool, {
      userId,
      tripId,
      eventType: 'SAVED',
      metadata: {
        destination: trip.destination,
        title:       trip.destination,
        duration:    trip.duration || '',
        dayCount:    days.length,
        source:      'ai_planner',
      },
    });
    console.log('[save] SAVED event written for tripId:', tripId);

    return res.status(200).json({ id: tripId });
  } catch (err) {
    console.error('[save] DB error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
