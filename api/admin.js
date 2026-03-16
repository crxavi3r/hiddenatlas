import pg from 'pg';
import { verifyAuth } from './_lib/verifyAuth.js';

const { Pool } = pg;

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

// Returns a Date object representing the start of the requested period.
// Prefers the `from` timestamp sent by the browser (which uses the local
// calendar timezone for 'today'). Falls back to UTC-based intervals if
// `from` is absent or unparseable (e.g. direct API calls).
function parseCutoff(from, period) {
  if (from) {
    const d = new Date(from);
    if (!isNaN(d)) return d;
  }
  const now = new Date();
  if (period === '7d')  return new Date(now - 7  * 24 * 60 * 60 * 1000);
  if (period === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  // 'today' fallback (UTC midnight — only used if browser did not send `from`)
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
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

  const { action, period = '7d', page = '1', q = '', id, status, from } = req.query;
  const cutoff = parseCutoff(from, period);
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * 50;

  try {
    // ── PATCH: status updates ─────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (action === 'custom-request-status') {
        const { id: bodyId, status: bodyStatus } = req.body ?? {};
        const requestId = bodyId     || id;
        const newStatus = bodyStatus || status;
        const VALID_STATUS = ['open', 'in_progress', 'closed'];
        if (!requestId) return res.status(400).json({ error: 'id is required' });
        if (!VALID_STATUS.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });
        const { rowCount } = await pool.query(
          `UPDATE "CustomRequest" SET status = $1 WHERE id = $2`,
          [newStatus, requestId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Request not found' });
        return res.status(200).json({ ok: true });
      }

      if (action === 'custom-request-payment') {
        const { id: bodyId, paymentStatus: bodyPaymentStatus } = req.body ?? {};
        const requestId       = bodyId             || id;
        const newPaymentStatus = bodyPaymentStatus;
        const VALID_PAYMENT = ['unpaid', 'paid'];
        if (!requestId)                        return res.status(400).json({ error: 'id is required' });
        if (!VALID_PAYMENT.includes(newPaymentStatus)) return res.status(400).json({ error: 'Invalid payment status' });
        const { rowCount } = await pool.query(
          `UPDATE "CustomRequest" SET "paymentStatus" = $1 WHERE id = $2`,
          [newPaymentStatus, requestId]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Request not found' });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── GET actions ───────────────────────────────────────────────────────
    if (action === 'dashboard') {
      // Each sub-query runs independently — one failure returns a safe default
      // instead of killing the entire dashboard payload.
      async function safe(name, fn, fallback) {
        try { return await fn(); }
        catch (e) {
          console.error(`[api/admin] dashboard sub-query "${name}" failed: ${e.message}`);
          return fallback;
        }
      }

      const KPI_ZERO = { visitors: 0, newUsers: 0, itineraryViews: 0, downloads: 0, sales: 0, revenue: 0, conversionRate: 0 };
      const FUNNEL_ZERO = { visitors: 0, itineraryViews: 0, downloads: 0, purchases: 0 };

      const [kpis, chart, funnel, topItineraries, sources, activity] = await Promise.all([
        safe('kpis',           () => getDashboardKPIs(pool, cutoff),    KPI_ZERO),
        safe('chart',          () => getChartData(pool, cutoff),         []),
        safe('funnel',         () => getFunnelData(pool, cutoff),        FUNNEL_ZERO),
        safe('topItineraries', () => getTopItineraries(pool, cutoff),    []),
        safe('sources',        () => getTrafficSources(pool, cutoff),    []),
        safe('activity',       () => getRecentActivity(pool, cutoff),    []),
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
    if (action === 'sales')     return res.status(200).json(await getSales(pool, cutoff, offset));
    if (action === 'downloads') return res.status(200).json(await getDownloads(pool, cutoff, offset));
    if (action === 'custom-requests') return res.status(200).json(await getCustomRequests(pool, status, offset, req.query.all === 'true'));

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(`[api/admin] action=${action} error: ${err.message}`, err.stack);
    return res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    await pool.end();
  }
}

// ── Dashboard KPIs ────────────────────────────────────────────────────────────
async function getDashboardKPIs(pool, cutoff) {
  const [visitors, pageViews, newUsers, itinViews, downloads, sales] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "User" WHERE "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS revenue FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
  ]);
  const v = parseInt(visitors.rows[0].n, 10) || 0;
  const s = parseInt(sales.rows[0].n, 10) || 0;
  return {
    visitors:       v,
    pageViews:      parseInt(pageViews.rows[0].n, 10) || 0,
    newUsers:       parseInt(newUsers.rows[0].n, 10) || 0,
    itineraryViews: parseInt(itinViews.rows[0].n, 10) || 0,
    downloads:      parseInt(downloads.rows[0].n, 10) || 0,
    sales:          s,
    revenue:        parseFloat(sales.rows[0].revenue) || 0,
    conversionRate: v > 0 ? +((s / v) * 100).toFixed(1) : 0,
  };
}

// ── Daily chart data ──────────────────────────────────────────────────────────
async function getChartData(pool, cutoff) {
  const { rows } = await pool.query(`
    WITH d AS (
      SELECT generate_series(
        DATE_TRUNC('day', $1::timestamptz),
        DATE_TRUNC('day', NOW()),
        '1 day'
      )::date AS day
    ),
    ev AS (
      SELECT DATE("createdAt") AS day,
        COUNT(DISTINCT COALESCE("userId", "sessionId")) FILTER (WHERE "eventType"='PAGE_VIEW') AS visitors,
        COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW')  AS itinerary_views
      FROM "Event" WHERE "createdAt" >= $1
      GROUP BY DATE("createdAt")
    ),
    sl AS (
      SELECT DATE("purchasedAt") AS day,
        COUNT(*)                       AS sales,
        COALESCE(SUM(amount),0)        AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= $1
      GROUP BY DATE("purchasedAt")
    ),
    dl AS (
      SELECT DATE("createdAt") AS day, COUNT(*) AS downloads
      FROM "TripEvent"
      WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
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
  `, [cutoff]);
  return rows;
}

// ── Funnel ────────────────────────────────────────────────────────────────────
async function getFunnelData(pool, cutoff) {
  const [v, iv, dl, p] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT COALESCE("userId", "sessionId")) AS n FROM "Event" WHERE "eventType"='PAGE_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "TripEvent" WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1`, [cutoff]),
    pool.query(`SELECT COUNT(*) AS n FROM "Purchase" WHERE "purchasedAt" >= $1`, [cutoff]),
  ]);
  return {
    visitors:       parseInt(v.rows[0].n, 10)  || 0,
    itineraryViews: parseInt(iv.rows[0].n, 10) || 0,
    downloads:      parseInt(dl.rows[0].n, 10) || 0,
    purchases:      parseInt(p.rows[0].n, 10)  || 0,
  };
}

// ── Top itineraries ───────────────────────────────────────────────────────────
async function getTopItineraries(pool, cutoff) {
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
      FROM "Event" WHERE "eventType"='ITINERARY_VIEW' AND "createdAt" >= $1
      GROUP BY "itinerarySlug"
    ) v ON v."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT t."itinerarySlug", COUNT(*) AS downloads
      FROM "TripEvent" te JOIN "Trip" t ON t.id = te."tripId"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
        AND t."itinerarySlug" IS NOT NULL
      GROUP BY t."itinerarySlug"
    ) d ON d."itinerarySlug" = i.slug
    LEFT JOIN (
      SELECT "itineraryId", COUNT(*) AS sales, SUM(amount) AS revenue
      FROM "Purchase" WHERE "purchasedAt" >= $1
      GROUP BY "itineraryId"
    ) s ON s."itineraryId" = i.id
    ORDER BY COALESCE(s.sales,0) DESC, COALESCE(d.downloads,0) DESC, COALESCE(v.views,0) DESC
    LIMIT 20
  `, [cutoff]);
  return rows.map(r => ({
    ...r,
    conversionRate: r.views > 0 ? +((r.sales / r.views) * 100).toFixed(1) : 0,
  }));
}

// ── Traffic sources ───────────────────────────────────────────────────────────
async function getTrafficSources(pool, cutoff) {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(NULLIF(TRIM(source), ''), 'direct') AS source,
      COUNT(*) FILTER (WHERE "eventType"='PAGE_VIEW')      AS visitors,
      COUNT(*) FILTER (WHERE "eventType"='ITINERARY_VIEW') AS itinerary_views,
      COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL) AS users
    FROM "Event"
    WHERE "createdAt" >= $1
    GROUP BY COALESCE(NULLIF(TRIM(source), ''), 'direct')
    ORDER BY visitors DESC
    LIMIT 10
  `, [cutoff]);
  return rows;
}

// ── Recent activity ───────────────────────────────────────────────────────────
async function getRecentActivity(pool, cutoff) {
  const { rows } = await pool.query(`
    (
      SELECT 'signup' AS type, u.email, u.name, NULL::text AS country, NULL::text AS detail, u."createdAt" AS ts
      FROM "User" u
      WHERE u."createdAt" >= $1
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'download' AS type, u.email, u.name, NULL::text AS country,
        COALESCE(te.metadata->>'title', te.metadata->>'destination', 'trip') AS detail,
        te."createdAt" AS ts
      FROM "TripEvent" te JOIN "User" u ON u.id=te."userId"
      WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'purchase' AS type, u.email, u.name, NULL::text AS country, i.title AS detail, p."purchasedAt" AS ts
      FROM "Purchase" p
      JOIN "User" u ON u.id=p."userId"
      JOIN "Itinerary" i ON i.id=p."itineraryId"
      WHERE p."purchasedAt" >= $1
      ORDER BY ts DESC LIMIT 15
    ) UNION ALL (
      SELECT 'itinerary_view' AS type, u.email, u.name, e.country, e."itinerarySlug" AS detail, e."createdAt" AS ts
      FROM "Event" e
      LEFT JOIN "User" u ON u.id = e."userId"
      WHERE e."eventType"='ITINERARY_VIEW' AND e."createdAt" >= $1
      ORDER BY ts DESC LIMIT 15
    )
    ORDER BY ts DESC LIMIT 50
  `, [cutoff]);
  return rows;
}

// ── Users list ────────────────────────────────────────────────────────────────
async function getUsersList(pool, q, offset) {
  const like = `%${q}%`;
  const { rows: users } = await pool.query(`
    SELECT
      u.id, u.email, u.name, u."createdAt",
      COALESCE(dl.downloads, 0)    AS downloads,
      COALESCE(pu.purchases, 0)    AS purchases,
      COALESCE(pu.revenue, 0)      AS revenue,
      GREATEST(u."createdAt", dl.last_download, pu.last_purchase) AS last_activity
    FROM "User" u
    LEFT JOIN (
      SELECT "userId", COUNT(*) AS downloads, MAX("createdAt") AS last_download
      FROM "TripEvent" WHERE "eventType"='DOWNLOADED'
      GROUP BY "userId"
    ) dl ON dl."userId" = u.id
    LEFT JOIN (
      SELECT "userId", COUNT(*) AS purchases, SUM(amount) AS revenue, MAX("purchasedAt") AS last_purchase
      FROM "Purchase"
      GROUP BY "userId"
    ) pu ON pu."userId" = u.id
    WHERE u.email ILIKE $1 OR u.name ILIKE $1
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
        COALESCE(pu.purchases, 0) AS purchases,
        COALESCE(dl.downloads, 0) AS downloads,
        COALESCE(pu.revenue, 0)   AS revenue
      FROM "User" u
      LEFT JOIN (
        SELECT "userId", COUNT(*) AS purchases, SUM(amount) AS revenue
        FROM "Purchase" GROUP BY "userId"
      ) pu ON pu."userId" = u.id
      LEFT JOIN (
        SELECT "userId", COUNT(*) AS downloads
        FROM "TripEvent" WHERE "eventType"='DOWNLOADED' GROUP BY "userId"
      ) dl ON dl."userId" = u.id
      WHERE u.id = $1
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
async function getSales(pool, cutoff, offset) {
  const { rows: sales } = await pool.query(`
    SELECT p."purchasedAt", u.email, u.name, i.title AS itinerary, i.slug, p.amount, p.status
    FROM "Purchase" p
    JOIN "User" u ON u.id=p."userId"
    JOIN "Itinerary" i ON i.id=p."itineraryId"
    WHERE p."purchasedAt" >= $1
    ORDER BY p."purchasedAt" DESC
    LIMIT 50 OFFSET $2
  `, [cutoff, offset]);

  const { rows: [{ total, revenue }] } = await pool.query(`
    SELECT COUNT(*) AS total, COALESCE(SUM(amount),0) AS revenue
    FROM "Purchase" WHERE "purchasedAt" >= $1
  `, [cutoff]);

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
// noLimit=true: fetch all rows (used by admin table with client-side filtering).
// When noLimit, status filter is skipped — the client handles it.
async function getCustomRequests(pool, statusParam, offset, noLimit = false) {
  const VALID = ['open', 'in_progress', 'closed'];

  const statuses = (!noLimit && statusParam)
    ? statusParam.split(',').map(s => s.trim()).filter(s => VALID.includes(s))
    : [];
  const useFilter = statuses.length > 0;

  let requests, total, counts, paymentCounts;

  try {
    const limitClause = noLimit ? '' : `LIMIT 50 OFFSET ${useFilter ? '$2' : '$1'}`;
    const params      = noLimit ? [] : (useFilter ? [statuses, offset] : [offset]);

    const { rows } = await pool.query(
      `SELECT id, "fullName", email, phone, destination, dates, duration,
              "groupSize", "groupType", budget, style, notes, status,
              "paymentStatus", "createdAt"
       FROM "CustomRequest"
       ${useFilter ? `WHERE status = ANY($1::text[])` : ''}
       ORDER BY "createdAt" DESC
       ${limitClause}`,
      params
    );
    requests = rows;

    const countRes = await pool.query(
      `SELECT COUNT(*) AS total FROM "CustomRequest"
       ${useFilter ? `WHERE status = ANY($1::text[])` : ''}`,
      useFilter ? [statuses] : []
    );
    total = parseInt(countRes.rows[0].total, 10);

    const [countsRes, paymentCountsRes] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS n FROM "CustomRequest" GROUP BY status`),
      pool.query(`SELECT "paymentStatus", COUNT(*) AS n FROM "CustomRequest" GROUP BY "paymentStatus"`),
    ]);
    counts = { open: 0, in_progress: 0, closed: 0, all: 0 };
    for (const row of countsRes.rows) {
      if (['open', 'in_progress', 'closed'].includes(row.status)) {
        counts[row.status] = parseInt(row.n, 10);
      }
      counts.all += parseInt(row.n, 10);
    }
    paymentCounts = { paid: 0, unpaid: 0 };
    for (const row of paymentCountsRes.rows) {
      if (row.paymentStatus === 'paid' || row.paymentStatus === 'unpaid') {
        paymentCounts[row.paymentStatus] = parseInt(row.n, 10);
      }
    }
  } catch (err) {
    if (!err.message.toLowerCase().includes('column')) throw err;
    console.warn('[admin/custom-requests] Extended columns missing — using fallback query:', err.message);

    const { rows } = await pool.query(
      `SELECT id, "fullName", email, destination, dates, "groupSize", notes, "createdAt",
              'open'::text    AS status,
              'unpaid'::text  AS "paymentStatus",
              NULL::text      AS phone,
              NULL::text      AS duration,
              NULL::text      AS "groupType",
              NULL::text      AS budget,
              '[]'::jsonb     AS style
       FROM "CustomRequest"
       ORDER BY "createdAt" DESC
       ${noLimit ? '' : 'LIMIT 50 OFFSET $1'}`,
      noLimit ? [] : [offset]
    );
    requests = rows;
    const countRes = await pool.query(`SELECT COUNT(*) AS total FROM "CustomRequest"`);
    total         = parseInt(countRes.rows[0].total, 10);
    counts        = { open: total, in_progress: 0, closed: 0, all: total };
    paymentCounts = { paid: 0, unpaid: total };
  }

  return { requests, total, counts, paymentCounts };
}

// ── Downloads ─────────────────────────────────────────────────────────────────
async function getDownloads(pool, cutoff, offset) {
  const { rows: downloads } = await pool.query(`
    SELECT
      te."createdAt", u.email, u.name,
      COALESCE(t.title, te.metadata->>'title', te.metadata->>'destination') AS title,
      t."itinerarySlug", t.source AS trip_source, t.destination
    FROM "TripEvent" te
    JOIN "User" u ON u.id=te."userId"
    LEFT JOIN "Trip" t ON t.id=te."tripId"
    WHERE te."eventType"='DOWNLOADED' AND te."createdAt" >= $1
    ORDER BY te."createdAt" DESC
    LIMIT 50 OFFSET $2
  `, [cutoff, offset]);

  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(*) AS total FROM "TripEvent"
    WHERE "eventType"='DOWNLOADED' AND "createdAt" >= $1
  `, [cutoff]);

  return { downloads, total: parseInt(total, 10) };
}
