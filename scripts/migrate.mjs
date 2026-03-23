/**
 * migrate.mjs
 *
 * Applies all pending SQL migrations in server/prisma/migrations/ to the
 * production (or local) PostgreSQL database.
 *
 * Tracks applied migrations in a `_migrations` table so each file runs only
 * once. All migration SQL files already use IF NOT EXISTS / ADD COLUMN IF NOT
 * EXISTS, so they are also safe to re-run if the tracking table is missing.
 *
 * Usage:
 *   npm run migrate                    # reads DATABASE_URL from .env / .env.local
 *   DATABASE_URL=postgres://... npm run migrate
 */

import pg          from 'pg';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path        from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');

// ── Simple .env loader (no external deps) ─────────────────────────────────────
for (const envFile of ['.env', '.env.local']) {
  const p = path.join(root, envFile);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val; // don't override shell env
  }
}

if (!process.env.DATABASE_URL) {
  console.warn('migrate: DATABASE_URL not set — skipping (no-op in local builds without DB).');
  process.exit(0);
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── Ensure tracking table ─────────────────────────────────────────────────────
await pool.query(`
  CREATE TABLE IF NOT EXISTS "_migrations" (
    "name"       TEXT        NOT NULL PRIMARY KEY,
    "appliedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`);

// ── Collect migration folders (sorted = chronological) ────────────────────────
const migrationsDir = path.join(root, 'server', 'prisma', 'migrations');
const folders = readdirSync(migrationsDir)
  .filter(f => !f.endsWith('.toml') && !f.startsWith('.'))
  .sort();

// ── Apply each pending migration ──────────────────────────────────────────────
let applied = 0;
let skipped = 0;

for (const folder of folders) {
  const sqlFile = path.join(migrationsDir, folder, 'migration.sql');
  if (!existsSync(sqlFile)) continue;

  const { rows } = await pool.query(
    `SELECT 1 FROM "_migrations" WHERE "name" = $1`, [folder]
  );
  if (rows.length > 0) {
    console.log(`  skip  ${folder}`);
    skipped++;
    continue;
  }

  const sql = readFileSync(sqlFile, 'utf8');
  console.log(`  apply ${folder} …`);
  try {
    await pool.query(sql);
    await pool.query(`INSERT INTO "_migrations" ("name") VALUES ($1)`, [folder]);
    console.log(`        ✓`);
    applied++;
  } catch (err) {
    // "already exists" errors mean the schema was created before the tracking table
    // existed (e.g. first run on a pre-existing DB). Mark as applied and continue.
    const alreadyExists = err.message?.includes('already exists');
    if (alreadyExists) {
      await pool.query(`INSERT INTO "_migrations" ("name") VALUES ($1) ON CONFLICT DO NOTHING`, [folder]);
      console.log(`        ✓ (pre-existing — marked as applied)`);
      skipped++;
    } else {
      console.error(`        ✗ ${err.message}`);
      await pool.end();
      process.exit(1);
    }
  }
}

await pool.end();
console.log(`\n✓ Migrations complete — ${applied} applied, ${skipped} already up to date.`);
