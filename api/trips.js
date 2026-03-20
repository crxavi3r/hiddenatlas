import pg from 'pg';
import { createTripEvent } from './_lib/audit.js';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET    /api/trips            — list all trips for user
// GET    /api/trips?id=<uuid>  — get single trip with days
// POST   /api/trips            — save new trip (body: { trip, source })
// POST   /api/trips?id=<uuid>  — log audit event (body: { eventType, metadata })
// DELETE /api/trips?id=<uuid>  — delete trip
export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
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

  const { id } = req.query;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const userId = users[0].id;

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
           t."itinerarySlug",
           t."createdAt",
           COUNT(d.id)::int AS "dayCount"
         FROM "Trip" t
         LEFT JOIN "TripDay" d ON d."tripId" = t.id
         WHERE t."userId" = $1
         GROUP BY t.id
         ORDER BY t."createdAt" DESC`,
        [userId]
      );
      return res.status(200).json(rows);
    }

    // ── GET /api/trips?id= — single trip ───────────────────────────────────
    if (req.method === 'GET' && id) {
      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, country, duration, overview,
                highlights, hotels, experiences, source, "coverImage", "createdAt"
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

      // ── Deduplication ────────────────────────────────────────────────────
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

      // ── Insert ───────────────────────────────────────────────────────────
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
          trip.country    || '',
          trip.duration   || '',
          trip.overview   || '',
          JSON.stringify(trip.highlights  || []),
          JSON.stringify(trip.hotels      || []),
          JSON.stringify(trip.experiences || []),
          tripSource,
          coverImage,
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

      // Insert TripDay rows
      const days = Array.isArray(trip.days) ? trip.days : [];
      for (const day of days) {
        await pool.query(
          `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description)
           VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
          [tripId, day.day || 0, day.title || '', day.description || '']
        );
      }

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
