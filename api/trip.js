import pg from 'pg';
import { createTripEvent } from './_lib/audit.js';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// GET    /api/trip?id=<uuid>  — return full trip with days
// POST   /api/trip?id=<uuid>  — log a DOWNLOADED audit event
// DELETE /api/trip?id=<uuid>  — delete trip + log DELETED event
//
// NOTE: This file uses a query-string ID instead of a path segment because
// Vercel does NOT resolve dynamic [id].js filenames when routing via a
// vercel.json rewrite rule — only static filenames match. Using ?id= avoids
// that limitation entirely.
export default async function handler(req, res) {
  const id = req.query.id;
  console.log('[api/trip] method:', req.method, '| id:', id);

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
                highlights, hotels, experiences, source, "createdAt"
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

      console.log('[api/trip] GET ok — destination:', trips[0].destination, '| days:', days.length);
      return res.status(200).json({ ...trips[0], days });
    }

    // ── POST — log DOWNLOADED event ───────────────────────────
    if (req.method === 'POST') {
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
        metadata: { destination: trips[0].destination, ...metadata },
      });

      console.log('[api/trip] DOWNLOADED audit written for tripId:', id);
      return res.status(200).json({ ok: true });
    }

    // ── DELETE ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
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

      console.log('[api/trip] DELETED tripId:', id, '| destination:', trip.destination);
      return res.status(200).json({ ok: true });
    }
  } catch (err) {
    console.error('[api/trip] error:', err.message, '| code:', err.code);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
