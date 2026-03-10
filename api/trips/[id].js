import pg from 'pg';
import { createTripEvent } from '../_lib/audit.js';
import { verifyAuth } from '../_lib/verifyAuth.js';

const { Pool } = pg;

// GET    /api/trips/:id — return full trip with days
// POST   /api/trips/:id — log a DOWNLOADED event
// DELETE /api/trips/:id — delete trip + log DELETED event
export default async function handler(req, res) {
  // req.query.id is set by Vercel's dynamic route matching.
  // When the route is reached via the /api/(.*) passthrough rewrite, Vercel may
  // not populate req.query with path params — fall back to parsing from req.url.
  const id = req.query.id
    || (/\/api\/trips\/([^/?]+)/.exec(req.url || '') || [])[1];
  console.log('[trips/id] method:', req.method, '| id:', id, '| req.query:', JSON.stringify(req.query), '| url:', req.url);
  if (!id) return res.status(400).json({ error: 'Missing trip id' });

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ─────────────────────────────────────────────────────
  if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  let clerkId;
  try {
    clerkId = await verifyAuth(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve DB user
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const userId = users[0].id;

    // ── GET ───────────────────────────────────────────────────
    if (req.method === 'GET') {
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

    // ── POST — log DOWNLOADED event ───────────────────────────
    if (req.method === 'POST') {
      const { eventType, metadata = {} } = req.body || {};

      if (eventType !== 'DOWNLOADED') {
        return res.status(400).json({ error: 'Invalid eventType. Allowed via POST: DOWNLOADED' });
      }

      // Verify ownership — trip must exist and belong to this user
      const { rows: trips } = await pool.query(
        `SELECT id, destination FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!trips.length) return res.status(404).json({ error: 'Trip not found' });

      await createTripEvent(pool, {
        userId,
        tripId: id,
        eventType: 'DOWNLOADED',
        metadata: {
          destination: trips[0].destination,
          source:      metadata.source || 'unknown',
          ...metadata,
        },
      });

      return res.status(200).json({ ok: true });
    }

    // ── DELETE — delete trip + log DELETED event ──────────────
    if (req.method === 'DELETE') {
      // Fetch trip for snapshot + ownership check
      const { rows: trips } = await pool.query(
        `SELECT id, title, destination, duration FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [id, userId]
      );
      if (!trips.length) return res.status(404).json({ error: 'Trip not found' });
      const trip = trips[0];

      // Write DELETED event BEFORE deletion so audit survives any subsequent error
      await createTripEvent(pool, {
        userId,
        tripId: id,      // stored as plain string — survives deletion
        eventType: 'DELETED',
        metadata: {
          title:       trip.title,
          destination: trip.destination,
          duration:    trip.duration,
        },
      });

      // Delete trip — TripDay rows cascade via onDelete: Cascade
      // TripEvent rows are unaffected (no FK on tripId)
      await pool.query(`DELETE FROM "Trip" WHERE id = $1`, [id]);

      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    console.error('[api/trips/[id]] error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
