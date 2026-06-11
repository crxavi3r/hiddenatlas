import pg from 'pg';
import { randomBytes } from 'crypto';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

function generateToken() {
  return randomBytes(32).toString('base64url');
}

function shareLink(token) {
  const base = process.env.CLIENT_ORIGIN || 'https://www.hiddenatlas.travel';
  return `${base}/share/trip/${token}`;
}

async function sendInviteEmail({ to, inviterName, tripTitle, role, acceptLink }) {
  if (!process.env.RESEND_API_KEY) return;
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.EMAIL_FROM || 'HiddenAtlas <noreply@hiddenatlas.travel>';
  const roleLabel = role === 'edit' ? 'Can edit' : 'View only';

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${inviterName} shared a HiddenAtlas trip with you`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Inter',system-ui,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(28,26,22,0.08);">
    <div style="background:linear-gradient(135deg,#0D3834,#1B6B65);padding:32px 40px;">
      <p style="font-family:'Georgia',serif;font-size:24px;font-weight:600;color:white;margin:0;">HiddenAtlas</p>
      <p style="font-size:13px;color:rgba(255,255,255,0.65);margin:6px 0 0;letter-spacing:2px;text-transform:uppercase;">Trip invitation</p>
    </div>
    <div style="padding:36px 40px;">
      <p style="font-size:16px;color:#1C1A16;line-height:1.6;margin:0 0 20px;">
        <strong>${inviterName}</strong> shared a trip with you on HiddenAtlas.
      </p>
      <div style="background:#FAFAF8;border-radius:8px;border:1px solid #E8E3DA;padding:20px 24px;margin-bottom:28px;">
        <p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#1B6B65;margin:0 0 6px;">${roleLabel}</p>
        <p style="font-family:'Georgia',serif;font-size:20px;font-weight:600;color:#1C1A16;margin:0;">${tripTitle}</p>
      </div>
      <a href="${acceptLink}" style="display:inline-block;padding:14px 28px;background:#1B6B65;color:white;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
        Open trip
      </a>
      <p style="font-size:12px;color:#B5A09A;margin:24px 0 0;line-height:1.6;">
        Or copy this link: <a href="${acceptLink}" style="color:#1B6B65;">${acceptLink}</a>
      </p>
    </div>
    <div style="padding:20px 40px;border-top:1px solid #E8E3DA;">
      <p style="font-size:11px;color:#B5A09A;margin:0;">
        You received this because ${inviterName} invited you. If you didn't expect this, you can ignore it.
      </p>
    </div>
  </div>
</body>
</html>`,
  });
}

// GET  /api/trip-shares?token=<t>&action=preview   — public safe preview (no auth)
// GET  /api/trip-shares?tripId=<id>                — list shares (auth, owner)
// POST /api/trip-shares?tripId=<id>                — create share (auth, owner)
//      body: { email?, role, sendEmail? }
// POST /api/trip-shares?token=<t>&action=accept    — accept invite (auth)
// PATCH /api/trip-shares?shareId=<id>              — update role (auth, owner)
//       body: { role }
// POST /api/trip-shares?shareId=<id>&action=revoke — revoke (auth, owner)
export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const { token, tripId, shareId, action } = req.query;

  // ── GET /api/trip-shares?token=<t>&action=preview — no auth required ──────
  if (req.method === 'GET' && token && action === 'preview') {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const { rows } = await pool.query(
        `SELECT ts.id, ts.role, ts.status, ts.email,
                t.title, t.destination, t.country, t.duration,
                COALESCE(t."heroImage", t."coverImage") AS cover,
                u.name AS "inviterName"
         FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         JOIN "User" u ON u.id = ts."invitedByUserId"
         WHERE ts."inviteToken" = $1`,
        [token]
      );
      if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
      const share = rows[0];
      if (share.status === 'revoked') return res.status(410).json({ error: 'This invite has been revoked.' });
      return res.status(200).json({
        role: share.role,
        status: share.status,
        inviterName: share.inviterName,
        tripTitle: share.title,
        destination: share.destination,
        country: share.country,
        duration: share.duration,
        cover: share.cover,
        // Do not expose the tripId or share email in preview
      });
    } catch (err) {
      console.error('[trip-shares/preview]', err.message);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      await pool.end();
    }
  }

  // All remaining routes require auth
  if (!process.env.CLERK_SECRET_KEY) return res.status(500).json({ error: 'Server misconfigured' });

  let clerkId;
  try { clerkId = await verifyAuth(req.headers.authorization); } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: users } = await pool.query(
      `SELECT id, email, name FROM "User" WHERE "clerkId" = $1`, [clerkId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const { id: userId, email: userEmail, name: userName } = users[0];

    // ── Helper: verify trip ownership ────────────────────────────────────────
    async function getOwnedTrip(tId) {
      const { rows } = await pool.query(
        `SELECT id, title, destination FROM "Trip" WHERE id = $1 AND "userId" = $2`,
        [tId, userId]
      );
      return rows[0] || null;
    }

    // ── GET /api/trip-shares?tripId=<id> — list shares ───────────────────────
    if (req.method === 'GET' && tripId) {
      const owned = await getOwnedTrip(tripId);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { rows: shares } = await pool.query(
        `SELECT ts.id, ts.email, ts.role, ts.status, ts."inviteToken",
                ts."invitedAt", ts."acceptedAt", ts."revokedAt",
                u.name AS "userName", u.email AS "userEmail"
         FROM "TripShare" ts
         LEFT JOIN "User" u ON u.id = ts."userId"
         WHERE ts."tripId" = $1
         ORDER BY ts."createdAt" ASC`,
        [tripId]
      );

      const result = shares.map(s => ({
        id: s.id,
        email: s.userEmail || s.email,
        displayName: s.userName || s.userEmail || s.email || 'Link invite',
        role: s.role,
        status: s.status,
        inviteToken: s.inviteToken,
        shareLink: shareLink(s.inviteToken),
        invitedAt: s.invitedAt,
        acceptedAt: s.acceptedAt,
        revokedAt: s.revokedAt,
      }));

      return res.status(200).json(result);
    }

    // ── POST /api/trip-shares?tripId=<id> — create share ─────────────────────
    if (req.method === 'POST' && tripId && !token && !shareId) {
      const owned = await getOwnedTrip(tripId);
      if (!owned) return res.status(404).json({ error: 'Trip not found' });

      const { email: rawEmail, role = 'view', sendEmail = false } = req.body || {};
      if (!['view', 'edit'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Use view or edit.' });
      }

      const email = rawEmail ? rawEmail.toLowerCase().trim() : null;
      const inviteToken = generateToken();

      // Check for existing non-revoked share for this email/trip
      if (email) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM "TripShare"
           WHERE "tripId" = $1 AND lower(email) = $2 AND status <> 'revoked'`,
          [tripId, email]
        );
        if (existing.length) {
          return res.status(409).json({ error: 'An active invite already exists for this email.' });
        }
      }

      const { rows: inserted } = await pool.query(
        `INSERT INTO "TripShare"
           (id, "tripId", email, role, status, "inviteToken", "invitedByUserId", "invitedAt", "createdAt", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending', $4, $5, NOW(), NOW(), NOW())
         RETURNING id, "inviteToken"`,
        [tripId, email, role, inviteToken, userId]
      );

      const created = inserted[0];
      const link = shareLink(created.inviteToken);

      // Send email invite if requested and email provided
      if (email && sendEmail) {
        try {
          await sendInviteEmail({
            to: email,
            inviterName: userName || userEmail,
            tripTitle: owned.title || owned.destination,
            role,
            acceptLink: link,
          });
        } catch (emailErr) {
          console.error('[trip-shares] email send failed:', emailErr.message);
          // Non-fatal: share is created, email just didn't send
        }
      }

      return res.status(201).json({ id: created.id, shareLink: link, inviteToken: created.inviteToken });
    }

    // ── POST /api/trip-shares?token=<t>&action=accept — accept invite ─────────
    if (req.method === 'POST' && token && action === 'accept') {
      const { rows: shareRows } = await pool.query(
        `SELECT ts.id, ts."tripId", ts.email, ts."userId", ts.status, ts.role,
                t.title, t.destination
         FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts."inviteToken" = $1`,
        [token]
      );

      if (!shareRows.length) return res.status(404).json({ error: 'Invite not found.' });
      const share = shareRows[0];

      if (share.status === 'revoked') {
        return res.status(410).json({ error: 'This invite has been revoked.' });
      }

      // Owner trying to accept their own trip share
      const { rows: ownCheck } = await pool.query(
        `SELECT id FROM "Trip" WHERE id = $1 AND "userId" = $2`, [share.tripId, userId]
      );
      if (ownCheck.length) {
        // Already the owner — just return the trip
        return res.status(200).json({ tripId: share.tripId, alreadyHasAccess: true });
      }

      // Email mismatch check (only if invite has a specific email)
      if (share.email && share.email.toLowerCase() !== userEmail.toLowerCase()) {
        return res.status(403).json({
          error: `This invite was sent to ${share.email}. Please sign in with that email or ask the owner for a new invite.`,
          emailMismatch: true,
        });
      }

      // If already accepted by this user
      if (share.userId === userId && share.status === 'accepted') {
        return res.status(200).json({ tripId: share.tripId, alreadyAccepted: true });
      }

      // If already accepted by a different user
      if (share.userId && share.userId !== userId && share.status === 'accepted') {
        return res.status(409).json({
          error: 'This invitation has already been accepted by another account.',
        });
      }

      // Accept the invite
      await pool.query(
        `UPDATE "TripShare"
         SET "userId" = $1, status = 'accepted', "acceptedAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $2`,
        [userId, share.id]
      );

      return res.status(200).json({ tripId: share.tripId, accepted: true });
    }

    // ── PATCH /api/trip-shares?shareId=<id> — update role ────────────────────
    if (req.method === 'PATCH' && shareId) {
      const { rows: shareRows } = await pool.query(
        `SELECT ts.id, ts."tripId" FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts.id = $1 AND t."userId" = $2`,
        [shareId, userId]
      );
      if (!shareRows.length) return res.status(404).json({ error: 'Share not found' });

      const { role } = req.body || {};
      if (!['view', 'edit'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Use view or edit.' });
      }

      await pool.query(
        `UPDATE "TripShare" SET role = $1, "updatedAt" = NOW() WHERE id = $2`,
        [role, shareId]
      );
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/trip-shares?shareId=<id>&action=revoke — revoke ────────────
    if (req.method === 'POST' && shareId && action === 'revoke') {
      const { rows: shareRows } = await pool.query(
        `SELECT ts.id FROM "TripShare" ts
         JOIN "Trip" t ON t.id = ts."tripId"
         WHERE ts.id = $1 AND t."userId" = $2`,
        [shareId, userId]
      );
      if (!shareRows.length) return res.status(404).json({ error: 'Share not found' });

      await pool.query(
        `UPDATE "TripShare"
         SET status = 'revoked', "revokedAt" = NOW(), "updatedAt" = NOW()
         WHERE id = $1`,
        [shareId]
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid request' });

  } catch (err) {
    console.error('[api/trip-shares] error:', err.message);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}
