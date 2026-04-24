// ── Vercel Blob upload handler ─────────────────────────────────────────────────
// Handles the two-phase client upload protocol from @vercel/blob/client's
// upload() function:
//
//   Phase 1 — token generation  (POST from browser)
//     Body: { type: 'blob.generate-client-token', payload: { pathname, ... } }
//     Response: { type: 'blob.generate-client-token', clientToken: '...' }
//
//   Phase 2 — upload-completed notification  (POST from Vercel Blob servers)
//     Body: { type: 'blob.upload-completed', payload: { blob, tokenPayload } }
//     Response: { type: 'blob.upload-completed' }
//
// The actual PDF bytes go directly from the browser to Vercel Blob storage
// (not through this function), so there is no 4.5 MB body-size concern.
//
// Auth: the browser passes its Clerk JWT in the Authorization header.
// We verify it in onBeforeGenerateToken (phase 1 only; phase 2 is a Vercel
// server-to-server call that does not carry the user's token).

import { handleUpload } from '@vercel/blob/client';
import { verifyAuth }   from './_lib/verifyAuth.js';

const PDF_PATH_RE = /^itineraries\/[^/]+\/pdf\/[^/]+\.pdf$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[blob] BLOB_READ_WRITE_TOKEN is not set');
    return res.status(503).json({ error: 'Blob storage is not configured' });
  }

  try {
    const jsonResponse = await handleUpload({
      body:    req.body ?? null,
      request: req,

      onBeforeGenerateToken: async (pathname) => {
        // Only allow PDFs under itineraries/{slug}/pdf/
        if (!PDF_PATH_RE.test(pathname)) {
          throw Object.assign(new Error(`Invalid upload path: ${pathname}`), { status: 400 });
        }

        // Verify Clerk JWT — the browser sends it in Authorization: Bearer <token>
        await verifyAuth(req.headers.authorization);

        console.log('PDF BLOB UPLOAD DEBUG', {
          pathname,
          hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
          environment: process.env.VERCEL_ENV,
        });

        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes:  30 * 1024 * 1024, // 30 MB
          addRandomSuffix:     false,
          allowOverwrite:      true,
        };
      },

      onUploadCompleted: async ({ blob }) => {
        // The browser will call /api/itinerary-cms?action=save-pdf-url after
        // receiving the blob URL from upload(), so we only log here.
        console.log('[blob] PDF upload completed:', blob.url);
      },
    });

    return res.json(jsonResponse);
  } catch (err) {
    const status = err.status ?? 400;
    console.error('[blob] handleUpload error:', err.message);
    return res.status(status).json({ error: err.message });
  }
}
