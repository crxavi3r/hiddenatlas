// api/agency-trips.js
// Vercel serverless function: Agency Trip management.
//
// SECURITY: All queries are scoped to the agencyId resolved from the
// authenticated member (agCtx.agencyId). agencyId from req.query is used
// only to look up and verify membership, never trusted for data access.
//
// GET  ?agencyId=&action=list                             : list agency trips
// GET  ?agencyId=&id=&action=detail                       : full trip detail
// GET  ?agencyId=&action=list-for-client&clientId=        : trips for a client
// GET  ?agencyId=&id=&action=travellers                   : list travellers
// GET  ?agencyId=&id=&action=preview-data                 : authenticated client portal preview
// GET  ?action=resolve-share&token=                       : PUBLIC, validate share token
// POST ?agencyId=&action=create                           : create agency trip (3 modes)
// POST ?agencyId=&id=&action=update-status                : update trip status
// POST ?agencyId=&id=&action=update-meta                  : update trip metadata
// POST ?agencyId=&id=&action=save-as-template             : save as reusable template
// POST ?agencyId=&id=&action=generate-share               : generate client share link
// POST ?agencyId=&id=&action=regenerate-share             : force new share token
// POST ?agencyId=&id=&action=toggle-share                 : enable/disable sharing
// POST ?agencyId=&id=&action=add-traveller                : add traveller to trip
// POST ?agencyId=&id=&action=update-traveller             : update traveller record
// POST ?agencyId=&id=&action=remove-traveller             : remove traveller
// POST ?agencyId=&id=&action=reorder-travellers           : batch reorder travellers

import { Pool } from 'pg';
import {
  resolveAgencyCtx,
  canManageTrips,
  canEditTrips,
  canManageTemplates,
  canShareTrips,
} from './_lib/agencyAuth.js';
import { duplicateTrip } from './_lib/duplicateTrip.js';
import { generateShareToken, hashShareToken } from './_lib/shareToken.js';

// ── Duration helpers ──────────────────────────────────────────────────────────

function computeDuration(startDate, endDate) {
  if (!startDate || !endDate) return { durationDays: null, duration: '' };
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (diff > 0 && diff <= 365) {
    return { durationDays: diff, duration: diff === 1 ? '1 day' : `${diff} days` };
  }
  return { durationDays: null, duration: '' };
}

// ── Trip workspace loader (shared by resolve-share and preview-data) ──────────
// Loads Trip with nested days (items inside each day), notes, bookings.

async function loadTripWorkspace(pool, tripId) {
  const { rows: tripRows } = await pool.query(
    `SELECT
       id, "userId", "itinerarySlug", "itineraryId", title, destination, country,
       duration, "durationDays", overview, highlights, hotels, experiences,
       source, "coverImage", subtitle, "heroImage",
       "startDate", "endDate", travellers,
       "accommodationSummary", "arrivalInfo", "departureInfo", "generalNotes",
       COALESCE("tripType", 'personal') AS "tripType",
       "createdFrom", "isEditable",
       "pdfUrl", COALESCE("pdfStatus", 'idle') AS "pdfStatus",
       "pdfGeneratedAt", "createdAt", "updatedAt"
     FROM "Trip"
     WHERE id = $1`,
    [tripId]
  );
  if (!tripRows.length) return null;
  const trip = tripRows[0];

  const { rows: tripDays } = await pool.query(
    `SELECT id, "tripId", "dayNumber", title, description,
            "sourceDayNumber", "titleOverride", "descriptionOverride",
            notes, "sortOrder", "isHidden", "updatedAt"
     FROM "TripDay"
     WHERE "tripId" = $1
     ORDER BY "sortOrder" ASC, "dayNumber" ASC`,
    [tripId]
  );

  const { rows: tripItems } = await pool.query(
    `SELECT id, "tripId", "tripDayId", "dayNumber", type, title, description,
            time, "startTime", "endTime", "durationMinutes", "locationName", address,
            latitude, longitude, notes, "bookingReference", provider, url,
            status, "isHidden", "isLocked", "sortOrder", metadata,
            "imageUrl", "imageAlt", "createdAt", "updatedAt"
     FROM "TripItem"
     WHERE "tripId" = $1 AND "isHidden" = false
     ORDER BY "tripDayId" NULLS LAST, "sortOrder" ASC, "createdAt" ASC`,
    [tripId]
  );

  const { rows: tripNotes } = await pool.query(
    `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", title, content,
            "noteType", "isPinned", "createdAt", "updatedAt"
     FROM "TripNote"
     WHERE "tripId" = $1
     ORDER BY "createdAt" ASC`,
    [tripId]
  );

  const { rows: tripBookings } = await pool.query(
    `SELECT id, "tripId", "tripDayId", "tripItemId", "dayNumber", type, title,
            date, time, "locationName", address, latitude, longitude,
            provider, "confirmationReference", notes, url,
            "attachmentUrl", status, metadata, "createdAt", "updatedAt"
     FROM "TripBooking"
     WHERE "tripId" = $1
     ORDER BY date ASC NULLS LAST, "createdAt" ASC`,
    [tripId]
  );

  // Nest items inside their respective days.
  const itemsByDayId = {};
  for (const item of tripItems) {
    const key = item.tripDayId || '__unassigned__';
    if (!itemsByDayId[key]) itemsByDayId[key] = [];
    itemsByDayId[key].push(item);
  }

  const daysWithItems = tripDays.map(day => ({
    ...day,
    items: itemsByDayId[day.id] || [],
  }));

  return {
    ...trip,
    days: daysWithItems,
    notes: tripNotes,
    bookings: tripBookings,
  };
}

// ── Shared portal data builder (resolve-share and preview-data) ───────────────
// Given a resolved AgencyTrip row (with agencyId, tripId, clientId), loads
// branding, client, travellers, and full trip workspace.

async function buildPortalPayload(pool, agTrip, agencyRow) {
  const { rows: brandingRows } = await pool.query(
    `SELECT "logoUrl", "logoDarkUrl", "primaryColor", "accentColor",
            website, "supportEmail", phone, whatsapp, "showPoweredByHiddenatlas"
     FROM "AgencyBranding"
     WHERE "agencyId" = $1`,
    [agTrip.agencyId]
  );

  let client = null;
  if (agTrip.clientId) {
    const { rows: clientRows } = await pool.query(
      `SELECT name FROM "AgencyClient" WHERE id = $1 AND "agencyId" = $2`,
      [agTrip.clientId, agTrip.agencyId]
    );
    client = clientRows[0] || null;
  }

  const { rows: travellers } = await pool.query(
    `SELECT id, name, email, type, "sortOrder"
     FROM "AgencyTripTraveller"
     WHERE "agencyTripId" = $1
     ORDER BY "sortOrder" ASC`,
    [agTrip.id]
  );

  let trip = null;
  if (agTrip.tripId) {
    trip = await loadTripWorkspace(pool, agTrip.tripId);
  }

  return {
    agencyTrip: {
      id:          agTrip.id,
      name:        agTrip.name,
      destination: agTrip.destination,
      startDate:   agTrip.startDate,
      endDate:     agTrip.endDate,
      status:      agTrip.status,
    },
    agency: {
      name: agencyRow.name,
      slug: agencyRow.slug,
    },
    branding:   brandingRows[0] || null,
    client,
    travellers,
    trip,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not set' });

  const { agencyId, id, action, token } = req.query;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // ── PUBLIC: resolve-share, no auth, no agencyId required ────────────────
    // Called by /travel/:token to render the client portal.
    // Returns 404 for any failure to avoid leaking trip existence.
    if (req.method === 'GET' && action === 'resolve-share') {
      if (!token) return res.status(400).json({ error: 'token is required' });

      const hash = hashShareToken(token);

      const { rows: atRows } = await pool.query(
        `SELECT id, "agencyId", "tripId", "clientId",
                name, destination, "startDate", "endDate", status,
                "shareEnabled", "shareExpiresAt"
         FROM "AgencyTrip"
         WHERE "shareTokenHash" = $1 AND "shareEnabled" = true`,
        [hash]
      );
      if (!atRows.length) return res.status(404).json({ error: 'Not found' });
      const agTrip = atRows[0];

      // Check expiry.
      if (agTrip.shareExpiresAt && new Date(agTrip.shareExpiresAt) < new Date()) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Verify the owning agency is active.
      const { rows: agencyRows } = await pool.query(
        `SELECT id, name, slug, status FROM "Agency" WHERE id = $1`,
        [agTrip.agencyId]
      );
      if (!agencyRows.length || agencyRows[0].status !== 'active') {
        return res.status(404).json({ error: 'Not found' });
      }

      const payload = await buildPortalPayload(pool, agTrip, agencyRows[0]);
      return res.status(200).json(payload);
    }

    // ── All other actions require agencyId + auth ─────────────────────────────
    if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

    const agCtx = await resolveAgencyCtx(req.headers.authorization, pool, agencyId);
    if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

    // Fetch AgencyTrip scoped to this agency, or return null.
    async function getAgencyTrip(agencyTripId) {
      const { rows } = await pool.query(
        `SELECT * FROM "AgencyTrip" WHERE id = $1 AND "agencyId" = $2`,
        [agencyTripId, agCtx.agencyId]
      );
      return rows[0] || null;
    }

    // ────────────────────────────────────────────────────────────────────────
    // GET actions
    // ────────────────────────────────────────────────────────────────────────

    if (req.method === 'GET') {
      // ── GET ?action=list ───────────────────────────────────────────────────
      if (action === 'list') {
        let query = `
          SELECT
            at.id, at.name, at.destination, at."startDate", at."endDate",
            at.status, at."tripId", at."clientId", at."assignedMemberId",
            at."templateId", at."createdAt",
            ac.name  AS "clientName",
            u.name   AS "assignedMemberName"
          FROM "AgencyTrip" at
          LEFT JOIN "AgencyClient" ac ON ac.id = at."clientId"
          LEFT JOIN "AgencyMember" am ON am.id = at."assignedMemberId"
          LEFT JOIN "User" u ON u.id = am."userId"
          WHERE at."agencyId" = $1`;
        const params = [agCtx.agencyId];

        const { status: statusFilter } = req.query;
        if (statusFilter) {
          params.push(statusFilter);
          query += ` AND at.status = $${params.length}`;
        }

        query += ` ORDER BY at."createdAt" DESC`;
        const { rows } = await pool.query(query, params);
        return res.status(200).json(rows);
      }

      // ── GET ?id=&action=detail ─────────────────────────────────────────────
      if (id && action === 'detail') {
        const { rows: atRows } = await pool.query(
          `SELECT
             at.id, at."agencyId", at."tripId", at."clientId",
             at."assignedMemberId", at."templateId",
             at.name, at.destination, at."startDate", at."endDate", at.status,
             at."createdByClerkUserId", at."shareEnabled", at."shareExpiresAt", at."sharedAt",
             at."createdAt", at."updatedAt",
             ac.name  AS "clientName",
             ac.email AS "clientEmail",
             u.name   AS "assignedMemberName",
             atempl.name AS "templateName"
           FROM "AgencyTrip" at
           LEFT JOIN "AgencyClient" ac    ON ac.id = at."clientId"
           LEFT JOIN "AgencyMember" am    ON am.id = at."assignedMemberId"
           LEFT JOIN "User" u             ON u.id  = am."userId"
           LEFT JOIN "AgencyTemplate" atempl ON atempl.id = at."templateId"
           WHERE at.id = $1 AND at."agencyId" = $2`,
          [id, agCtx.agencyId]
        );
        if (!atRows.length) return res.status(404).json({ error: 'Agency trip not found' });
        const agTrip = atRows[0];

        const { rows: travellers } = await pool.query(
          `SELECT id, name, email, type, "sortOrder", "createdAt", "updatedAt"
           FROM "AgencyTripTraveller"
           WHERE "agencyTripId" = $1
           ORDER BY "sortOrder" ASC`,
          [id]
        );

        let tripInfo = null;
        if (agTrip.tripId) {
          const { rows: tripRows } = await pool.query(
            `SELECT id, title, destination, "startDate", "endDate", "pdfStatus", "pdfUrl"
             FROM "Trip" WHERE id = $1`,
            [agTrip.tripId]
          );
          tripInfo = tripRows[0] || null;
        }

        return res.status(200).json({ ...agTrip, travellers, trip: tripInfo });
      }

      // ── GET ?action=list-for-client&clientId= ──────────────────────────────
      if (action === 'list-for-client') {
        const { clientId } = req.query;
        if (!clientId) return res.status(400).json({ error: 'clientId is required' });

        const { rows } = await pool.query(
          `SELECT
             at.id, at.name, at.destination, at."startDate", at."endDate",
             at.status, at."tripId", at."createdAt"
           FROM "AgencyTrip" at
           WHERE at."agencyId" = $1 AND at."clientId" = $2
           ORDER BY at."createdAt" DESC`,
          [agCtx.agencyId, clientId]
        );
        return res.status(200).json(rows);
      }

      // ── GET ?id=&action=travellers ─────────────────────────────────────────
      if (id && action === 'travellers') {
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { rows } = await pool.query(
          `SELECT id, name, email, type, "sortOrder", "createdAt", "updatedAt"
           FROM "AgencyTripTraveller"
           WHERE "agencyTripId" = $1
           ORDER BY "sortOrder" ASC`,
          [id]
        );
        return res.status(200).json(rows);
      }

      // ── GET ?id=&action=preview-data ───────────────────────────────────────
      // Authenticated "Preview as Client": same structure as resolve-share.
      if (id && action === 'preview-data') {
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { rows: agencyRows } = await pool.query(
          `SELECT id, name, slug FROM "Agency" WHERE id = $1`,
          [agCtx.agencyId]
        );
        const agencyRow = agencyRows[0] || { name: agCtx.agencyName, slug: null };

        const payload = await buildPortalPayload(pool, agTrip, agencyRow);
        return res.status(200).json(payload);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // POST actions
    // ────────────────────────────────────────────────────────────────────────

    if (req.method === 'POST') {
      // ── POST ?action=create ────────────────────────────────────────────────
      if (action === 'create') {
        if (!canManageTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });

        const {
          name,
          clientId,
          destination,
          startDate,
          endDate,
          assignedMemberId,
          templateId,
          sourceAgencyTripId,
        } = req.body || {};

        // Validate optional FK ownership before any DB writes.
        if (clientId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyClient" WHERE id = $1 AND "agencyId" = $2`,
            [clientId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Client not found in this agency' });
        }
        if (assignedMemberId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyMember" WHERE id = $1 AND "agencyId" = $2 AND status = 'active'`,
            [assignedMemberId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Member not found in this agency' });
        }

        let newTripId;
        let resolvedTemplateId = null;

        // MODE B: from template.
        if (templateId) {
          const { rows: tmplRows } = await pool.query(
            `SELECT id, name, "sourceTripId" FROM "AgencyTemplate"
             WHERE id = $1 AND "agencyId" = $2 AND status = 'active'`,
            [templateId, agCtx.agencyId]
          );
          if (!tmplRows.length) return res.status(400).json({ error: 'Template not found in this agency' });
          const tmpl = tmplRows[0];
          if (!tmpl.sourceTripId) return res.status(400).json({ error: 'Template has no source trip' });

          newTripId = await duplicateTrip(pool, tmpl.sourceTripId, {
            userId:      agCtx.userId,
            title:       name?.trim() || tmpl.name,
            tripType:    'personal',
            createdFrom: 'duplicate',
          });
          resolvedTemplateId = templateId;

        // MODE C: duplicate an existing agency trip.
        } else if (sourceAgencyTripId) {
          if (!name?.trim()) return res.status(400).json({ error: 'name is required when duplicating a trip' });

          const { rows: srcRows } = await pool.query(
            `SELECT id, "tripId" FROM "AgencyTrip" WHERE id = $1 AND "agencyId" = $2`,
            [sourceAgencyTripId, agCtx.agencyId]
          );
          if (!srcRows.length) return res.status(400).json({ error: 'Source agency trip not found' });
          const src = srcRows[0];
          if (!src.tripId) return res.status(400).json({ error: 'Source agency trip has no linked trip' });

          newTripId = await duplicateTrip(pool, src.tripId, {
            userId:      agCtx.userId,
            title:       name.trim(),
            tripType:    'personal',
            createdFrom: 'duplicate',
          });

        // MODE A: from scratch.
        } else {
          if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

          const { durationDays, duration } = computeDuration(startDate, endDate);

          const { rows: created } = await pool.query(
            `INSERT INTO "Trip" (
               id, "userId", title, destination, country, duration, "durationDays",
               overview, highlights, hotels, experiences, source,
               "tripType", "createdFrom", "isEditable",
               "startDate", "endDate",
               "personalPdfConfig", "itinerarySnapshot", "pdfStatus", "createdAt", "updatedAt"
             )
             VALUES (
               gen_random_uuid(), $1, $2, $3, '', $4, $5,
               '', '[]', '[]', '[]', 'MANUAL',
               'personal', 'manual', true,
               $6, $7,
               '{}', '{}', 'idle', NOW(), NOW()
             )
             RETURNING id`,
            [
              agCtx.userId,
              name.trim(),
              destination || '',
              duration,
              durationDays,
              startDate || null,
              endDate || null,
            ]
          );
          newTripId = created[0].id;

          if (durationDays && durationDays > 0) {
            for (let i = 0; i < durationDays; i++) {
              await pool.query(
                `INSERT INTO "TripDay" (id, "tripId", "dayNumber", title, description, "sortOrder", "isHidden", "resetToOriginal", "updatedAt")
                 VALUES (gen_random_uuid(), $1, $2, $3, '', $4, false, false, NOW())`,
                [newTripId, i + 1, `Day ${i + 1}`, i + 1]
              );
            }
          }
        }

        // Insert the AgencyTrip record.
        const { rows: atInserted } = await pool.query(
          `INSERT INTO "AgencyTrip" (
             id, "agencyId", "tripId", "clientId", "assignedMemberId", "templateId",
             name, destination, "startDate", "endDate",
             status, "createdByClerkUserId", "createdAt", "updatedAt"
           )
           VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5,
             $6, $7, $8, $9,
             'draft', $10, NOW(), NOW()
           )
           RETURNING id`,
          [
            agCtx.agencyId,
            newTripId,
            clientId         || null,
            assignedMemberId || null,
            resolvedTemplateId,
            name?.trim()     || '',
            destination      || null,
            startDate        || null,
            endDate          || null,
            agCtx.clerkId,
          ]
        );

        return res.status(200).json({ agencyTripId: atInserted[0].id, tripId: newTripId });
      }

      // ── POST ?id=&action=update-status ─────────────────────────────────────
      if (id && action === 'update-status') {
        if (!canManageTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { status } = req.body || {};
        const validStatuses = ['draft', 'ready', 'shared', 'travelling', 'completed', 'archived'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
        }

        await pool.query(
          `UPDATE "AgencyTrip" SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
          [status, id]
        );
        return res.status(200).json({ ok: true });
      }

      // ── POST ?id=&action=update-meta ───────────────────────────────────────
      if (id && action === 'update-meta') {
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const body = req.body || {};
        const { name, clientId, destination, startDate, endDate, assignedMemberId } = body;

        // Validate FK ownership when explicitly provided (non-null).
        if (clientId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyClient" WHERE id = $1 AND "agencyId" = $2`,
            [clientId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Client not found in this agency' });
        }
        if (assignedMemberId) {
          const { rows } = await pool.query(
            `SELECT id FROM "AgencyMember" WHERE id = $1 AND "agencyId" = $2 AND status = 'active'`,
            [assignedMemberId, agCtx.agencyId]
          );
          if (!rows.length) return res.status(400).json({ error: 'Member not found in this agency' });
        }

        // Build SET clause dynamically from provided body fields.
        const sets = [];
        const params = [];
        const addParam = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };

        if ('name' in body)             addParam('name',                 name?.trim()       || null);
        if ('clientId' in body)          addParam('"clientId"',            clientId           || null);
        if ('destination' in body)       addParam('destination',           destination        || null);
        if ('startDate' in body)         addParam('"startDate"',           startDate          || null);
        if ('endDate' in body)           addParam('"endDate"',             endDate            || null);
        if ('assignedMemberId' in body)  addParam('"assignedMemberId"',    assignedMemberId   || null);

        if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

        sets.push(`"updatedAt" = NOW()`);
        params.push(id);

        await pool.query(
          `UPDATE "AgencyTrip" SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );
        return res.status(200).json({ ok: true });
      }

      // ── POST ?id=&action=save-as-template ──────────────────────────────────
      if (id && action === 'save-as-template') {
        if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });
        if (!agTrip.tripId) return res.status(400).json({ error: 'Agency trip has no linked trip to use as template source' });

        const { templateName, description } = req.body || {};
        if (!templateName?.trim()) return res.status(400).json({ error: 'templateName is required' });

        // Duplicate the trip so the template has its own independent copy.
        const newTripId = await duplicateTrip(pool, agTrip.tripId, {
          userId:      agCtx.userId,
          title:       templateName.trim(),
          tripType:    'personal',
          createdFrom: 'manual',
        });

        const { rows: tmplRows } = await pool.query(
          `INSERT INTO "AgencyTemplate" (
             id, "agencyId", name, description, destination, "sourceTripId", status, "createdAt", "updatedAt"
           )
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'active', NOW(), NOW())
           RETURNING id`,
          [
            agCtx.agencyId,
            templateName.trim(),
            description || null,
            agTrip.destination || null,
            newTripId,
          ]
        );

        return res.status(200).json({ templateId: tmplRows[0].id });
      }

      // ── POST ?id=&action=generate-share ────────────────────────────────────
      if (id && action === 'generate-share') {
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        // Return existing info without regenerating if sharing is already active.
        if (agTrip.shareEnabled && agTrip.shareTokenHash) {
          return res.status(200).json({ shareEnabled: true, alreadyShared: true });
        }

        const { token, hash } = generateShareToken();

        await pool.query(
          `UPDATE "AgencyTrip"
           SET "shareTokenHash" = $1, "shareEnabled" = true, "sharedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $2`,
          [hash, id]
        );

        // Return the raw token only here for URL construction, never logged or stored.
        return res.status(200).json({ shareUrl: '/travel/' + token, shareEnabled: true });
      }

      // ── POST ?id=&action=regenerate-share ──────────────────────────────────
      if (id && action === 'regenerate-share') {
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        // Always generate a new token, which invalidates any previously distributed link.
        const { token, hash } = generateShareToken();

        await pool.query(
          `UPDATE "AgencyTrip"
           SET "shareTokenHash" = $1, "shareEnabled" = true, "sharedAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $2`,
          [hash, id]
        );

        return res.status(200).json({ shareUrl: '/travel/' + token });
      }

      // ── POST ?id=&action=toggle-share ──────────────────────────────────────
      if (id && action === 'toggle-share') {
        if (!canShareTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { shareEnabled } = req.body || {};
        if (typeof shareEnabled !== 'boolean') {
          return res.status(400).json({ error: 'shareEnabled must be a boolean' });
        }

        await pool.query(
          `UPDATE "AgencyTrip" SET "shareEnabled" = $1, "updatedAt" = NOW() WHERE id = $2`,
          [shareEnabled, id]
        );
        return res.status(200).json({ ok: true });
      }

      // ── POST ?id=&action=add-traveller ─────────────────────────────────────
      if (id && action === 'add-traveller') {
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { name, email, type } = req.body || {};
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const validTypes = ['adult', 'child'];
        const travellerType = validTypes.includes(type) ? type : 'adult';

        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM "AgencyTripTraveller" WHERE "agencyTripId" = $1`,
          [id]
        );
        const sortOrder = (countRows[0].cnt || 0) + 1;

        const { rows: inserted } = await pool.query(
          `INSERT INTO "AgencyTripTraveller" (
             id, "agencyTripId", name, email, type, "sortOrder", "createdAt", "updatedAt"
           )
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [id, name.trim(), email?.trim() || null, travellerType, sortOrder]
        );
        return res.status(200).json(inserted[0]);
      }

      // ── POST ?id=&action=update-traveller ──────────────────────────────────
      if (id && action === 'update-traveller') {
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { travellerId, name, email, type } = req.body || {};
        if (!travellerId) return res.status(400).json({ error: 'travellerId is required' });

        // Verify the traveller belongs to this specific AgencyTrip.
        const { rows: tvRows } = await pool.query(
          `SELECT id FROM "AgencyTripTraveller" WHERE id = $1 AND "agencyTripId" = $2`,
          [travellerId, id]
        );
        if (!tvRows.length) return res.status(404).json({ error: 'Traveller not found' });

        const validTypes = ['adult', 'child'];
        const resolvedType = validTypes.includes(type) ? type : null;

        await pool.query(
          `UPDATE "AgencyTripTraveller"
           SET
             name  = COALESCE($1, name),
             email = COALESCE($2, email),
             type  = COALESCE($3, type),
             "updatedAt" = NOW()
           WHERE id = $4`,
          [name?.trim() || null, email?.trim() || null, resolvedType, travellerId]
        );
        return res.status(200).json({ ok: true });
      }

      // ── POST ?id=&action=remove-traveller ──────────────────────────────────
      if (id && action === 'remove-traveller') {
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { travellerId } = req.body || {};
        if (!travellerId) return res.status(400).json({ error: 'travellerId is required' });

        // Verify the traveller belongs to this specific AgencyTrip.
        const { rows: tvRows } = await pool.query(
          `SELECT id FROM "AgencyTripTraveller" WHERE id = $1 AND "agencyTripId" = $2`,
          [travellerId, id]
        );
        if (!tvRows.length) return res.status(404).json({ error: 'Traveller not found' });

        await pool.query(`DELETE FROM "AgencyTripTraveller" WHERE id = $1`, [travellerId]);
        return res.status(200).json({ ok: true });
      }

      // ── POST ?id=&action=reorder-travellers ────────────────────────────────
      if (id && action === 'reorder-travellers') {
        if (!canEditTrips(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
        const agTrip = await getAgencyTrip(id);
        if (!agTrip) return res.status(404).json({ error: 'Agency trip not found' });

        const { order } = req.body || {};
        if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of {id, sortOrder}' });

        for (const item of order) {
          if (!item.id || item.sortOrder == null) continue;
          await pool.query(
            `UPDATE "AgencyTripTraveller"
             SET "sortOrder" = $1, "updatedAt" = NOW()
             WHERE id = $2 AND "agencyTripId" = $3`,
            [item.sortOrder, item.id, id]
          );
        }
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (err) {
    if (err.isDbError) return res.status(503).json({ error: 'Database unavailable' });
    console.error('[api/agency-trips]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await pool.end();
  }
}
