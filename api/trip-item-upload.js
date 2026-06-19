import pg from 'pg';
import { put as blobPut } from '@vercel/blob';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ALLOWED_TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', avif: 'image/avif',
};
const MAX_BYTES = 5 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let clerkId;
  try { clerkId = await verifyAuth(req.headers.authorization); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { rows: users } = await pool.query(
    `SELECT id FROM "User" WHERE "clerkId" = $1`, [clerkId]
  );
  if (!users.length) return res.status(401).json({ error: 'User not found' });
  const userId = users[0].id;

  const tripId = req.query.tripId;
  if (!tripId) return res.status(400).json({ error: 'tripId is required' });

  const { rows: trips } = await pool.query(
    `SELECT t.id FROM "Trip" t
     LEFT JOIN "TripShare" s ON s."tripId" = t.id AND s."userId" = $2 AND s.status = 'accepted'
     WHERE t.id = $1 AND (t."userId" = $2 OR s.id IS NOT NULL)`,
    [tripId, userId]
  );
  if (!trips.length) return res.status(403).json({ error: 'Access denied' });

  const { base64Data, filename } = req.body || {};
  if (!base64Data || !filename) return res.status(400).json({ error: 'base64Data and filename are required' });

  const ext = (filename.split('.').pop() || '').toLowerCase();
  const contentType = ALLOWED_TYPES[ext];
  if (!contentType) return res.status(400).json({ error: 'Unsupported file type. Use jpg, png, webp, gif, or avif.' });

  const fileBuffer = Buffer.from(base64Data, 'base64');
  if (fileBuffer.length > MAX_BYTES) return res.status(400).json({ error: 'Image must be smaller than 5 MB.' });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobPath = `trips/${tripId}/items/${Date.now()}-${safeName}`;

  const blob = await blobPut(blobPath, fileBuffer, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return res.status(200).json({ url: blob.url });
}
