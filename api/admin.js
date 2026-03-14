import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

function periodToInterval(period) {
  if (period === '7d')  return '7 days';
  if (period === '30d') return '30 days';
  return '1 day'; // 'today'
}

// ── Auth guard ────────────────────────────────────────────────────────────────
async function verifyAdmin(authHeader, pool) {
  let clerkId;
  try { clerkId = await verifyAuth(authHeader); }
  catch { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }

  const { rows } = await pool.query(
    `SELECT email FROM "User" WHERE "clerkId" = $1 LIMIT 1`, [clerkId]
  );
  const email = rows[0]?.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  return email;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DATABASE_URL || !process.env.CLERK_SECRET_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await verifyAdmin(req.headers.authorization, pool);
  } catch (err) {
    await pool.end();
    return res.status(err.status ?? 401).json({ error: err.message });
  }

  const { action, period = '7d', page = '1', q = '', id, status } = req.query;
  const interval = periodToInterval(period);
  const offset   = (Math.max(1, parseInt(page, 10)) - 1) * 50;

  try {
    // ── PATCH: status updates ─────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (action === 'custom-request-status') {
        const { id: bodyId, status: bodyStatus } = req.body ?? {};
        const requestId  = bodyId     || id;
        const newStatus  = bodyStatus || status;
        const VALID = ['open', 'in_progress', 'closed'];
        if (!requestId) return res.status(400).json({ error: 'id is required' });
        if (!VALID.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });
        const { rowCount } = await pool.query(
          `UPDATE "CustomRequest" SET status = $1 WHERE id = $2`,
          [newStatus, requestId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Request not found' });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── GET actions ───────────────────────────────────────────────────────
    if (action === 'dashboard') {
      const [kpis, chart, funnel, topItineraries, sources, activity] = await Promise.all([
        getDashboardKPIs(pool, interval),
        getChartData(pool, interval),
        getFunnelData(pool, interval),
        getTopItineraries(pool, interval),
        getTrafficSources(pool, interval),
        getRecentActivity(pool),
      ]);
      return res.status(200).json({ kpis, chart, funnel, topItineraries, sources, activity });
    }

    if (action === 'users')    return res.status(200).json(await getUsersList(pool, q, offset));
    if (action === 'user')     {
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = await getUserDetail(pool, id);
      if (!data) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(data);
    }
    if (action === 'sales')     return res.status(200).json(await getSales(pool, interval, offset));
    if (action === 'downloads') return res.status(200).json(await getDownloads(pool, interval, offset));
    if (action === 'custom-requests') return res.status(200).json(await getCustomRequests(pool, status, offset));

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[api/admin] error:', err.message);
    return res.status(500).json({ error: 'Database error' });
  } finally {
    await pool.end();
  }
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
async function getDashboardKPIs(pool, interval) {
  const [visitors, newUsers, itinViews, downloads, sales] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "User" WHERE "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS revenue FROM "Purchase" WHERE "purchasedAt" >= NOW()-$1::interval`, [interval]),
  ]);
  const v = parseInt(visitors.rows[0].n, 10) || 0;
  const s = parseInt(sales.rows[0].n, 10) || 0;
  return {
    visitors:       v,
    newUsers:       parseInt(newUsers.rows[0].n, 10) || 0,
    itineraryViews: parseInt(itinViews.rows[0].n, 10) || 0,
    downloads:      parseInt(downloads.rows[0].n, 10) || 0,
    sales:          s,
    revenue:        parseFloat(sales.rows[0].revenue) || 0,
    conversionRate: v > 0 ? +((s / v) * 100).toFixed(1) : 0,
  };
}

// ── Daily chart data ──────────────────────────────────────────────────────────
async function getChartData(pool, interval) {
  const { rows } = await pool.query(`
    WITH d AS (
      SELECT generate_series(
        DATE_TRUNC('day', NOW()-$1::interval),
        DATE_TRUNC('day', NOW()),
        '1 day'
      )::date AS day
    ),
    ev AS (
      SELECT DATE("createdAt") AS day,
        COUNT(*) FILTER (WHERE "eventType"='PAGE_VIEW')       AS visitors,
        COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW')  AS itinerary_views
      FROM "Event" WHERE "createdAt" >= NOW()-$1::interval
      GROUP BY DATE("createdAt")
    ),
    sl AS (
      SELECT DATE("purchasedAt") AS day,
        COUNT(*)                       AS sales,
        COALESCE(SUM(amount),0)        AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= NOW()-$1::interval
      GROUP BY DATE("purchasedAt")
    ),
    dl AS (
      SELECT DATE("createdAt") AS day, COUNT(*) AS downloads
      FROM "TripEvent"
      WHERE "eventType"='DOWNLOADED' AND "createdAt" >= NOW()-$1::interval
      GROUP BY DATE("createdAt")
    )
    SELECT
      d.day::text,
      COALESCE(ev.visitors,0)::int        AS visitors,
      COALESCE(ev.itinerary_views,0)::int AS itinerary_views,
      COALESCE(sl.sales,0)::int           AS sales,
      COALESCE(sl.revenue,0)::float       AS revenue,
      COALESCE(dl.downloads,0)::int       AS downloads
    FROM d
    LEFT JOIN ev ON ev.day = d.day
    LEFT JOIN sl ON sl.day = d.day
    LEFT JOIN dl ON dl.day = d.day
    ORDER BY d.day
  `, [interval]);
  return rows;
}

// ── Funnel ────────────────────────────────────────────────────────────────────
async function getFunnelData(pool, interval) {
  const [v, iv, dl, p] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= NOW()-$1::interval`, [interval]),
    pool.query(`SELECT COUNT(*) AS n FROM "Purchase" WHERE "purchasedAt" >= NOW()-$1::interval`, [interval]),
  ]);
  return {
    visitors:       parseInt(v.rows[0].n, 10)  || 0,
    itineraryViews: parseInt(iv.rows[0].n, 10) || 0,
    downloads:      parseInt(dl.rows[0].n, 10) || 0,
    purchases:      parseInt(p.rows[0].n, 10)  || 0,
  };
}

// ── Top itineraries ───────────────────────────────────────────────────────────
async function getTopItineraries(pool, interval) {
  const { rows } = await pool.query(`
    SELECT
      i.slug, i.title, i.price,
      COALESCE(v.views,0)     AS views,
      COALESCE(d.downloads,0) AS downloads,
      COALESCE(s.sales,0)     AS sales,
      COALESCE(s.revenue,0)   AS revenue
    FROM "Itinerary" i
    LEFT JOIN (
      SELECT "itinerarySlug", COUNT(*) AS views
      FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= NOW()-$1::interval
      GROUP BY "itinerarySlug"
    ) v ON v."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT t."itinerarySlug", COUNT(*) AS downloads
      FROM "TripEvent" te JOIN "Trip" t ON t.id = te."tripId"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= NOW()-$1::interval
        AND t."itinerarySlug" IS NOT NULL
      GROUP BY t."itinerarySlug"
    ) d ON d."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT "itineraryId", COUNT(*) AS sales, SUM(amount) AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= NOW()-$1::interval
      GROUP BY "itineraryId"
    ) s ON s."itineraryId" = i.id
    ORDER BY COALESCE(s.sales,0) DESC, COALESCE(d.downloads,0) DESC, COALESCE(v.views,0) DESC
    LIMIT 20
  `, [interval]);
  return rows.map(r => ({
    ...r,
    conversionRate: r.views > 0 ? +((r.sales / r.views) * 100).toFixed(1) : 0,
  }));
}

// ── Traffic sources ───────────────────────────────────────────────────────────
async function getTrafficSources(pool, interval) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(source), ''), 'direct') AS source,
      COUNT(*) FILTER (WHERE "eventType"='PAGE_VIEW')      AS visitors,
      COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW') AS itinerary_views,
      COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL) AS users
    FROM "Event"
    WHERE "createdAt" >= NOW()-$1::interval
    GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'direct')
    ORDER BY visitors DESC
    LIMIT 10
  `, [interval]);
  return rows;
}

// ── Recent activity ───────────────────────────────────────────────────────────
async function getRecentActivity(pool) {
  const { rows } = await pool.query(`
    (
      SELECT 'signup' AS type, u.email, NULL AS detail, u."createdAt" AS ts
      FROM "User" u ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'download' AS type, u.email,
        COALESCE(te.metadata->>'title', te.metadata->>'destination', 'trip') AS detail,
        te."createdAt" AS ts
      FROM "TripEvent" te JOIN "User" u ON u.id=te."userId"
      WHERE te."eventType"='DOWNLOADED' ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'purchase' AS type, u.email, i.title AS detail, p."purchasedAt" AS ts
      FROM "Purchase" p
      JOIN "User" u ON u.id=p."userId"
      JOIN "Itinerary" i ON i.id=p."itineraryId"
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'itinerary_view' AS type, NULL AS email, e."itinerarySlug" AS detail, e."createdAt" AS ts
      FROM "Event" e WHERE e."eventType"='ITINERARY_VIEW'
      ORDER BY ts DESC LIMIT 15
    )
    ORDER BY ts DESC LIMIT 50
  `);
  return rows;
}

// ── Users list ────────────────────────────────────────────────────────────────
async function getUsersList(pool, q, offset) {
  const like = `%${q}%`;
  const { rows: users } = await pool.query(`
    SELECT
      u.id, u.email, u.name, u."createdAt",
      COUNT(DISTINCT te.id) FILTER (WHERE te."eventType"='DOWNLOADED') AS downloads,
      COUNT(DISTINCT p.id)                                              AS purchases,
      COALESCE(SUM(p.amount), 0)                                        AS revenue,
      GREATEST(u."createdAt", MAX(te."createdAt"), MAX(p."purchasedAt")) AS last_activity
    FROM "User" u
    LEFT JOIN "TripEvent" te ON te."userId" = u.id
    LEFT JOIN "Purchase"  p  ON p."userId"  = u.id
    WHERE u.email ILIKE $1 OR u.name ILIKE $1
    GROUP BY u.id, u.email, u.name, u."createdAt"
    ORDER BY u."createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [like, offset]);

  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(*) AS total FROM "User" WHERE email ILIKE $1 OR name ILIKE $1`, [like]
  );
  return { users, total: parseInt(total, 10) };
}

// ── User detail ───────────────────────────────────────────────────────────────
async function getUserDetail(pool, id) {
  const [userRes, purchasesRes, eventsRes, tripEventsRes] = await Promise.all([
    pool.query(`
      SELECT u.id, u.email, u.name, u."createdAt", u."clerkId",
        COUNT(DISTINCT p.id)  AS purchases,
        COUNT(DISTINCT te.id) FILTER (WHERE te."eventType"='DOWNLOADED') AS downloads,
        COALESCE(SUM(p.amount), 0) AS revenue
      FROM "User" u
      LEFT JOIN "Purchase"  p  ON p."userId"  = u.id
      LEFT JOIN "TripEvent" te ON te."userId" = u.id
      WHERE u.id = $1
      GROUP BY u.id, u.email, u.name, u."createdAt", u."clerkId"
    `, [id]),
    pool.query(`
      SELECT p."purchasedAt", p.amount, p.status, i.title, i.slug
      FROM "Purchase" p JOIN "Itinerary" i ON i.id=p."itineraryId"
      WHERE p."userId"=$1 ORDER BY p."purchasedAt" DESC
    `, [id]),
    pool.query(`
      SELECT id, "eventType", "pagePath", "itinerarySlug", source, "deviceType", "createdAt"
      FROM "Event" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 100
    `, [id]),
    pool.query(`
      SELECT te.id, te."eventType", te.metadata, te."createdAt",
        t.title, t.destination, t.source AS trip_source, t."itinerarySlug"
      FROM "TripEvent" te LEFT JOIN "Trip" t ON t.id=te."tripId"
      WHERE te."userId"=$1 ORDER BY te."createdAt" DESC
    `, [id]),
  ]);

  const user = userRes.rows[0];
  if (!user) return null;

  // Build chronological journey
  const journey = [
    { type: 'signup',   ts: user.createdAt, detail: 'Account created' },
    ...purchasesRes.rows.map(p => ({
      type: 'purchase', ts: p.purchasedAt, detail: p.title, amount: p.amount, slug: p.slug,
    })),
    ...tripEventsRes.rows.map(te => ({
      type:    te.eventType === 'DOWNLOADED' ? 'download' : te.eventType === 'SAVED' ? 'saved' : 'deleted',
      ts:      te.createdAt,
      detail:  te.title || te.metadata?.title || te.destination || 'trip',
      slug:    te.itinerarySlug,
      source:  te.trip_source,
    })),
    ...eventsRes.rows.map(e => ({
      type:   e.eventType === 'ITINERARY_VIEW' ? 'itinerary_view' : 'page_view',
      ts:     e.createdAt,
      detail: e.itinerarySlug || e.pagePath || '',
      source: e.source,
      device: e.deviceType,
    })),
  ].sort((a, b) => new Date(b.ts) - new Date(a.ts));

  return { user, purchases: purchasesRes.rows, journey };
}

// ── Sales ─────────────────────────────────────────────────────────────────────
async function getSales(pool, interval, offset) {
  const { rows: sales } = await pool.query(`
    SELECT p."purchasedAt", u.email, u.name, i.title AS itinerary, i.slug, p.amount, p.status
    FROM "Purchase" p
    JOIN "User" u ON u.id=p."userId"
    JOIN "Itinerary" i ON i.id=p."itineraryId"
    WHERE p."purchasedAt" >= NOW()-$1::interval
    ORDER BY p."purchasedAt" DESC
    LIMIT 50 OFFSET $2
  `, [interval, offset]);

  const { rows: [{ total, revenue }] } = await pool.query(`
    SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS revenue
    FROM "Purchase" WHERE "purchasedAt" >= NOW()-$1::interval
  `, [interval]);

  const { rows: [allTime] } = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS revenue FROM "Purchase"`
  );

  return {
    sales,
    total:          parseInt(total, 10),
    revenue:        parseFloat(revenue),
    allTimeRevenue: parseFloat(allTime.revenue),
    avgOrderValue:  total > 0 ? +(parseFloat(revenue) / parseInt(total,10)).toFixed(2) : 0,
  };
}

// ── Custom Requests ───────────────────────────────────────────────────────────
async function getCustomRequests(pool, statusParam, offset) {
  const VALID = ['open', 'in_progress', 'closed'];

  // statusParam may be a comma-separated list: 'open,in_progress'
  const statuses = statusParam
    ? statusParam.split(',').map(s => s.trim()).filter(s => VALID.includes(s))
    : [];
  const useFilter = statuses.length > 0;

  let requests, total, counts;

  try {
    // Full query — works once migration 20260313400000 has been applied
    const { rows } = await pool.query(
      `SELECT id, "fullName", email, phone, destination, dates, duration,
              "groupSize", "groupType", budget, style, notes, status, "createdAt"
       FROM "CustomRequest"
       ${useFilter ? `WHERE status = ANY($1::text[])` : ''}
       ORDER BY "createdAt" DESC
       LIMIT 50 OFFSET ${useFilter ? '$2' : '$1'}`,
      useFilter ? [statuses, offset] : [offset]
    );
    requests = rows;

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM "CustomRequest"
       ${useFilter ? `WHERE status = ANY($1::text[])` : ''}`,
      useFilter ? [statuses] : []
    );
    total = parseInt(countRes.rows[0].total, 10);

    const countsRes = await pool.query(
      `SELECT status, COUNT(*) AS n FROM "CustomRequest" GROUP BY status`
    );
    counts = { open: 0, in_progress: 0, closed: 0, all: 0 };
    for (const row of countsRes.rows) {
      counts[row.status] = parseInt(row.n, 10);
      counts.all += parseInt(row.n, 10);
    }
  } catch (err) {
    // If the error is a missing-column error the migration hasn't been applied yet.
    // Fall back to original schema columns so the page still shows data.
    if (!err.message.toLowerCase().includes('column')) throw err;

    console.warn('[admin/custom-requests] Extended columns missing — using fallback query:', err.message);

    // Fallback: select only original-schema columns; synthesise NULL/default values
    // for the new fields so the frontend receives a consistent shape.
    // Status filter is skipped here (column doesn't exist yet); all rows shown.
    const { rows } = await pool.query(
      `SELECT id, "fullName", email, destination, dates, "groupSize", notes, "createdAt",
              'open'::text  AS status,
              NULL::text    AS phone,
              NULL::text    AS duration,
              NULL::text    AS "groupType",
              NULL::text    AS budget,
              '[]'::jsonb   AS style
       FROM "CustomRequest"
       ORDER BY "createdAt" DESC
       LIMIT 50 OFFSET $1`,
      [offset]
    );
    requests = rows;

    const countRes = await pool.query(`SELECT COUNT(*) AS total FROM "CustomRequest"`);
    total  = parseInt(countRes.rows[0].total, 10);
    counts = { open: total, in_progress: 0, closed: 0, all: total };
  }

  return { requests, total, counts };
}

// ── Downloads ─────────────────────────────────────────────────────────────────
async function getDownloads(pool, interval, offset) {
  const { rows: downloads } = await pool.query(`
    SELECT
      te."createdAt", u.email, u.name,
      COALESCE(t.title, te.metadata->>'title', te.metadata->>'destination') AS title,
      t."itinerarySlug", t.source AS trip_source, t.destination
    FROM "TripEvent" te
    JOIN "User" u ON u.id=te."userId"
    LEFT JOIN "Trip" t ON t.id=te."tripId"
    WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= NOW()-$1::interval
    ORDER BY te."createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [interval, offset]);

  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*) AS total FROM "TripEvent"
    WHERE "eventType"='DOWNLOADED' AND "createdAt" >= NOW()-$1::interval
  `, [interval]);

  return { downloads, total: parseInt(total, 10) };
}
