/**
 * Migration: compact mapillary_images schema
 *
 * Changes:
 *   id  TEXT        → BIGINT   (saves ~12 bytes/row — Mapillary IDs are pure integers)
 *   lat FLOAT8      → FLOAT4   (saves  4 bytes/row — ±1m accuracy, fine for dots)
 *   lng FLOAT8      → FLOAT4   (saves  4 bytes/row)
 *
 * Result: ~120 bytes/row → ~36 bytes/row  (3-4× smaller)
 * 5M rows: ~600 MB → ~180 MB  (safely under Supabase 500 MB free limit)
 *
 * Run BEFORE re-seeding:
 *   node scripts/migrate-mapillary-compact.mjs
 *
 * Then re-seed:
 *   node scripts/seed-mapillary-ph.mjs
 */

import pg from 'pg'

const SUPABASE_URL = process.env.DATABASE_URL
  || 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const NEON_URL = process.env.NEON_DATABASE_URL || null

async function migrate(label, connStr) {
  const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log(`\n[${label}] Connected`)

  // Check existing row count before wiping
  try {
    const { rows } = await client.query('SELECT COUNT(*) FROM mapillary_images')
    console.log(`[${label}] Existing rows: ${Number(rows[0].count).toLocaleString()}`)
  } catch {
    console.log(`[${label}] Table does not exist yet — will create fresh`)
  }

  // Drop and recreate with compact types
  await client.query(`DROP TABLE IF EXISTS mapillary_images`)
  await client.query(`
    CREATE TABLE mapillary_images (
      id  BIGINT  PRIMARY KEY,
      lat FLOAT4  NOT NULL,
      lng FLOAT4  NOT NULL
    )
  `)

  // Spatial index: speed up bbox queries (lng/lat range scans)
  await client.query(`CREATE INDEX idx_mapillary_lng_lat ON mapillary_images (lng, lat)`)

  console.log(`[${label}] ✅ Table recreated: BIGINT id, FLOAT4 lat/lng, spatial index`)
  await client.end()
}

// Always migrate Supabase
await migrate('Supabase', SUPABASE_URL)

// Migrate Neon if URL is provided
if (NEON_URL) {
  await migrate('Neon', NEON_URL)
} else {
  console.log('\n[Neon] Skipped — set NEON_DATABASE_URL env var to also create on Neon')
  console.log('       Example: NEON_DATABASE_URL="postgres://..." node scripts/migrate-mapillary-compact.mjs')
}

console.log('\n✅ Migration complete. Now run: node scripts/seed-mapillary-ph.mjs')
