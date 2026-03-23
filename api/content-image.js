// ── Content Image Proxy ────────────────────────────────────────────────────────
// Serves local itinerary images from content/itineraries/<slug>/<path>.
// Admin-only: requires a valid Clerk Bearer token.
//
// GET /api/content-image?slug=bali-island-journey&path=gallery/arrozais.jpg

import fs   from 'fs';
import path from 'path';
import { verifyAuth } from './_lib/verifyAuth.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png',  '.webp': 'image/webp',
  '.gif': 'image/gif',  '.avif': 'image/avif',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try { await verifyAuth(req.headers.authorization); }
  catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { slug, path: relPath } = req.query;
  if (!slug || !relPath) return res.status(400).json({ error: 'Missing slug or path' });

  // Path traversal guard
  const contentRoot = path.join(process.cwd(), 'content', 'itineraries');
  const filePath    = path.resolve(contentRoot, slug, relPath);
  if (!filePath.startsWith(contentRoot + path.sep)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return res.status(400).json({ error: 'Not an image file' });

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}
