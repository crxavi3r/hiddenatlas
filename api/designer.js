import pg from 'pg';
import { randomUUID } from 'crypto';
import { resolveUserCtx } from './_lib/resolveUserCtx.js';

const { Pool } = pg;

export default async function handler(req, res) {
  try {
    return await _handler(req, res);
  } catch (err) {
    console.error('[api/designer] unhandled error:', err.message, err.stack);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

async function _handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 5000,
    max: 3,
  });
  pool.on('error', (err) => {
    console.error('[api/designer] pool error (non-fatal):', err.message);
  });

  try {
    const { action } = req.query;

    // GET /api/designer?action=application-status
    if (req.method === 'GET' && action === 'application-status') {
      const ctx = await resolveUserCtx(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

      const { rows } = await pool.query(
        `SELECT id, status, "createdAt"
         FROM "DesignerApplication"
         WHERE "userId" = $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [ctx.userId]
      );

      const latest = rows[0] ?? null;
      const isDesignerOrAdmin = ctx.role === 'designer' || ctx.role === 'admin';
      const hasPendingApplication = latest?.status === 'pending';
      const canApply = !isDesignerOrAdmin && !hasPendingApplication;

      return res.status(200).json({
        role: ctx.role,
        hasPendingApplication,
        latestApplicationStatus: latest?.status ?? null,
        latestApplicationCreatedAt: latest?.createdAt ?? null,
        canApply,
      });
    }

    // POST /api/designer?action=apply
    if (req.method === 'POST' && action === 'apply') {
      const ctx = await resolveUserCtx(req.headers.authorization, pool);
      if (!ctx) return res.status(401).json({ error: 'Unauthorized' });

      if (ctx.role === 'designer' || ctx.role === 'admin') {
        return res.status(409).json({
          error: 'already_designer',
          message: 'Your designer profile is active.',
        });
      }

      const { rows: pending } = await pool.query(
        `SELECT id FROM "DesignerApplication"
         WHERE "userId" = $1 AND status = 'pending' LIMIT 1`,
        [ctx.userId]
      );
      if (pending.length > 0) {
        return res.status(409).json({
          error: 'already_pending',
          message: 'Your application has already been received and is waiting for review.',
        });
      }

      const { fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message } = req.body ?? {};

      if (!fullName?.trim())  return res.status(400).json({ error: 'Full name is required.' });
      if (!email?.trim())     return res.status(400).json({ error: 'Email is required.' });
      if (!bio?.trim())       return res.status(400).json({ error: 'Bio is required.' });
      if (!message?.trim())   return res.status(400).json({ error: 'Message is required.' });

      const id  = randomUUID();
      const now = new Date();

      await pool.query(
        `INSERT INTO "DesignerApplication"
           (id, "userId", "fullName", email, bio, "websiteUrl", "instagramUrl", "expertiseRegions", message, status, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $10)`,
        [
          id,
          ctx.userId,
          fullName.trim(),
          email.trim(),
          bio.trim(),
          websiteUrl?.trim()       || null,
          instagramUrl?.trim()     || null,
          expertiseRegions?.trim() || null,
          message.trim(),
          now,
        ]
      );

      try {
        await sendAdminNotification({ fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message });
      } catch (emailErr) {
        console.error('[api/designer/apply] admin notification email failed:', emailErr.message);
      }

      return res.status(201).json({ ok: true, applicationId: id });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } finally {
    await pool.end().catch(() => {});
  }
}

async function sendAdminNotification({ fullName, email, bio, websiteUrl, instagramUrl, expertiseRegions, message }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[api/designer] RESEND_API_KEY not set — skipping admin notification');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL ?? 'cristiano.xavier@hiddenatlas.travel';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1C1A16;">
      <h2 style="color:#1B6B65;margin-bottom:24px;">New Designer Application</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;width:150px;vertical-align:top;">Name</td><td style="padding:8px 0;">${esc(fullName)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Email</td><td style="padding:8px 0;">${esc(email)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Website</td><td style="padding:8px 0;">${websiteUrl ? esc(websiteUrl) : '—'}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Instagram</td><td style="padding:8px 0;">${instagramUrl ? esc(instagramUrl) : '—'}</td></tr>
        <tr><td style="padding:8px 0;font-weight:600;color:#6B6156;vertical-align:top;">Expertise</td><td style="padding:8px 0;">${expertiseRegions ? esc(expertiseRegions) : '—'}</td></tr>
      </table>
      <h3 style="color:#1B6B65;margin-bottom:8px;">Bio</h3>
      <p style="line-height:1.7;background:#F4F1EC;padding:16px;border-radius:4px;margin-bottom:20px;">${esc(bio)}</p>
      <h3 style="color:#1B6B65;margin-bottom:8px;">Message</h3>
      <p style="line-height:1.7;background:#F4F1EC;padding:16px;border-radius:4px;margin-bottom:28px;">${esc(message)}</p>
      <a href="https://hiddenatlas.travel/admin/designer-applications" style="display:inline-block;background:#1B6B65;color:white;padding:12px 24px;border-radius:5px;text-decoration:none;font-weight:600;font-size:14px;">Review Application</a>
    </div>
  `;

  await resend.emails.send({
    from:    'HiddenAtlas <noreply@hiddenatlas.travel>',
    to:      [adminTo],
    subject: 'New HiddenAtlas designer application',
    html,
  });
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
