import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

// POST /api/events
// Logs a client-side analytics event (fire-and-forget from the browser).
// userId is resolved from the Bearer token if present — anonymous events are fine.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'Server misconfigured' });

  // Resolve userId from token — anonymous events are allowed
  let clerkId = null;
  try { clerkId = await verifyAuth(req.headers.authorization); } catch { /* anonymous */ }

  const { eventType, itinerarySlug, pagePath, source, sessionId, deviceType, metadata } = req.body ?? {};
  if (!eventType) return res.status(400).json({ error: 'eventType is required' });

  const ua = req.headers['user-agent'] ?? '';
  const resolvedDevice = deviceType ?? (/mobile|android|iphone|ipad/i.test(ua) ? 'mobile' : 'desktop');
  const country = req.headers['x-vercel-ip-country'] ?? null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let userId = null;
    if (clerkId) {
      const { rows } = await pool.query(`SELECT id FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]);
      userId = rows[0]?.id ?? null;
    }

    await pool.query(
      `INSERT INTO "Event" (id, "userId", "sessionId", "eventType", "itinerarySlug", "pagePath", source, country, "deviceType", metadata, "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [userId, sessionId ?? null, eventType, itinerarySlug ?? null, pagePath ?? null,
       source ?? null, country, resolvedDevice, JSON.stringify(metadata ?? {})]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/events] DB error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}
