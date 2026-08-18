import { Pool } from 'pg';
import {
  resolveAgencyCtx,
  canManageClients,
} from './_lib/agencyAuth.js';

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

    // ── GET /api/agency-clients?agencyId=&action=list ──────────────────────
    if (req.method === 'GET' && action === 'list') {
      const search = req.query.search?.trim() || '';
      const params = [agencyId];
      let where = `WHERE ac."agencyId" = $1`;
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (ac.name ILIKE $${params.length} OR ac.email ILIKE $${params.length})`;
      }
      const { rows } = await pool.query(
        `SELECT ac.id, ac."agencyId", ac.name, ac.email, ac.phone, ac.notes, ac."createdAt",
                COUNT(at2.id)::int AS "tripCount"
         FROM "AgencyClient" ac
         LEFT JOIN "AgencyTrip" at2 ON at2."clientId" = ac.id
         ${where}
         GROUP BY ac.id
         ORDER BY ac.name ASC`,
        params
      );
      return res.status(200).json({ clients: rows });
    }

    // ── GET /api/agency-clients?agencyId=&id=&action=detail ───────────────
    if (req.method === 'GET' && action === 'detail') {
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { rows: clientRows } = await pool.query(
        `SELECT * FROM "AgencyClient" WHERE id = $1 AND "agencyId" = $2 LIMIT 1`,
        [id, agencyId]
      );
      if (!clientRows.length) return res.status(404).json({ error: 'Client not found' });

      const { rows: trips } = await pool.query(
        `SELECT id, name, destination, "startDate", "endDate", status, "createdAt"
         FROM "AgencyTrip"
         WHERE "clientId" = $1 AND "agencyId" = $2
         ORDER BY "createdAt" DESC`,
        [id, agencyId]
      );
      return res.status(200).json({ client: clientRows[0], trips });
    }

    // ── POST /api/agency-clients?agencyId=&action=create ──────────────────
    if (req.method === 'POST' && action === 'create') {
      if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      const { name, email, phone, notes } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
      const { rows } = await pool.query(
        `INSERT INTO "AgencyClient" (id, "agencyId", name, email, phone, notes, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *`,
        [agencyId, name.trim(), email?.trim() || null, phone?.trim() || null, notes?.trim() || null]
      );
      return res.status(200).json(rows[0]);
    }

    // ── POST /api/agency-clients?agencyId=&id=&action=update ─────────────
    if (req.method === 'POST' && action === 'update') {
      if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { name, email, phone, notes } = req.body || {};
      if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
      const { rowCount } = await pool.query(
        `UPDATE "AgencyClient" SET name=$1, email=$2, phone=$3, notes=$4, "updatedAt"=NOW()
         WHERE id=$5 AND "agencyId"=$6`,
        [name.trim(), email?.trim()||null, phone?.trim()||null, notes?.trim()||null, id, agencyId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Client not found' });
      return res.status(200).json({ ok: true });
    }

    // ── POST /api/agency-clients?agencyId=&id=&action=delete ─────────────
    if (req.method === 'POST' && action === 'delete') {
      if (!canManageClients(agCtx.role)) return res.status(403).json({ error: 'Forbidden' });
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { rows: activeTrips } = await pool.query(
        `SELECT id FROM "AgencyTrip" WHERE "clientId" = $1 AND "agencyId" = $2
         AND status NOT IN ('archived','completed') LIMIT 1`,
        [id, agencyId]
      );
      if (activeTrips.length) {
        return res.status(409).json({ error: 'Cannot delete client with active trips. Archive or complete them first.' });
      }
      const { rowCount } = await pool.query(
        `DELETE FROM "AgencyClient" WHERE id = $1 AND "agencyId" = $2`, [id, agencyId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Client not found' });
      return res.status(200).json({ ok: true });
    }

    return res.status(404).json({ error: 'Unknown action' });
  } catch (err) {
    if (err.isDbError) return res.status(503).json({ error: 'Database unavailable' });
    console.error('[api/agency-clients]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    await pool.end();
  }
}
