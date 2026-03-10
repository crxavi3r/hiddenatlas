import { verifyToken } from '@clerk/backend';
import pg from 'pg';

const { Pool } = pg;

// GET /api/trips/:id
// Returns a single saved trip with its days. Only the owning user can access it.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing trip id' });

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

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Resolve DB user
    const { rows: users } = await pool.query(
      `SELECT id FROM "User" WHERE "clerkId" = $1`,
      [clerkId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const userId = users[0].id;

    // Fetch trip — userId check enforces ownership
    const { rows: trips } = await pool.query(
      `SELECT id, title, destination, country, duration, overview,
              highlights, hotels, experiences, "createdAt"
       FROM "Trip"
       WHERE id = $1 AND "userId" = $2`,
      [id, userId]
    );
    if (!trips.length) return res.status(404).json({ error: 'Trip not found' });
    const trip = trips[0];

    // Fetch days in order
    const { rows: days } = await pool.query(
      `SELECT id, "dayNumber", title, description
       FROM "TripDay"
       WHERE "tripId" = $1
       ORDER BY "dayNumber" ASC`,
      [id]
    );

    return res.status(200).json({ ...trip, days });
  } catch (err) {
    console.error('[api/trips/[id]] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
