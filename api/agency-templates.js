import { Pool } from 'pg';
import { resolveAgencyCtx, canManageTemplates } from './_lib/agencyAuth.js';
import { duplicateTrip } from './_lib/duplicateTrip.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not set' });

  const { agencyId, id, action } = req.query;
  if (!agencyId) return res.status(400).json({ error: 'agencyId is required' });

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const agCtx = await resolveAgencyCtx(req.headers.authorization, pool, agencyId);
    if (!agCtx) return res.status(401).json({ error: 'Unauthorized' });

    // ── GET /api/agency-templates?agencyId=&action=list ───────────────────
    if (req.method === 'GET' && action === 'list') {
      const includeArchived = req.query.includeArchived === 'true';
      const { rows } = await pool.query(
        `SELECT at2.id, at2."agencyId", at2.name, at2.description, at2.destination,
                at2."sourceTripId", at2.status, at2."createdAt", at2."updatedAt",
                t.title AS "tripTitle", t."durationDays" AS "tripDurationDays"
         FROM "AgencyTemplate" at2
         LEFT JOIN "Trip" t ON t.id = at2."sourceTripId"
         WHERE at2."agencyId" = $1 ${includeArchived ? '' : "AND at2.status = 'active'"}
         ORDER BY at2."updatedAt" DESC`,
        [agencyId]
      );
      return res.status(200).json({ templates: rows });
    }

    // ── POST /api/agency-templates?agencyId=&action=create ───────────────
    if (req.method === 'POST' && action === 'create') {
      if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      const { name, description, destination, sourceTripId } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Template name is required' });
      const { rows } = await pool.query(
        `INSERT INTO "AgencyTemplate" (id, "agencyId", name, description, destination, "sourceTripId", status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'active', NOW(), NOW()) RETURNING *`,
        [agencyId, name.trim(), description?.trim()||null, destination?.trim()||null, sourceTripId||null]
      );
      return res.status(200).json(rows[0]);
    }

    // ── POST /api/agency-templates?agencyId=&id=&action=update ───────────
    if (req.method === 'POST' && action === 'update') {
      if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { name, description, destination } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
      const { rowCount } = await pool.query(
        `UPDATE "AgencyTemplate" SET name=$1, description=$2, destination=$3, "updatedAt"=NOW()
         WHERE id=$4 AND "agencyId"=$5`,
        [name.trim(), description?.trim()||null, destination?.trim()||null, id, agencyId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Template not found' });
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/agency-templates?agencyId=&id=&action=archive ──────────
    if (req.method === 'POST' && action === 'archive') {
      if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { rowCount } = await pool.query(
        `UPDATE "AgencyTemplate" SET status='archived', "updatedAt"=NOW()
         WHERE id=$1 AND "agencyId"=$2`,
        [id, agencyId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Template not found' });
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/agency-templates?agencyId=&id=&action=duplicate ─────────
    if (req.method === 'POST' && action === 'duplicate') {
      if (!canManageTemplates(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { rows: tplRows } = await pool.query(
        `SELECT * FROM "AgencyTemplate" WHERE id = $1 AND "agencyId" = $2 LIMIT 1`, [id, agencyId]
      );
      if (!tplRows.length) return res.status(404).json({ error: 'Template not found' });
      const tpl = tplRows[0];

      let newTripId = null;
      if (tpl.sourceTripId) {
        newTripId = await duplicateTrip(pool, tpl.sourceTripId, {
          userId: agCtx.userId,
          title: `${tpl.name} (copy)`,
          tripType: 'personal',
          createdFrom: 'duplicate',
        });
      }

      const { rows: newTpl } = await pool.query(
        `INSERT INTO "AgencyTemplate" (id, "agencyId", name, description, destination, "sourceTripId", status, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'active', NOW(), NOW()) RETURNING id`,
        [agencyId, `${tpl.name} (copy)`, tpl.description, tpl.destination, newTripId]
      );
      return res.status(200).json({ templateId: newTpl[0].id });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (err) {
    if (err.isDbError) return res.status(503).json({ error: 'Database unavailable' });
    console.error('[api/agency-templates]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await pool.end();
  }
}
