/**
 * Cleanup script:
 * 1. Delete all "RL Test *" dummy terminals (158 entries, fake coords 14.5, 120.9)
 * 2. Remove duplicate "Palumpong/Pandacan Oil Depot" (keep the one with more connections)
 *
 * Run: node scripts/cleanup-test-terminals.mjs
 */

import pg from 'pg'

const DATABASE_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  if (DRY_RUN) console.log('🔍 DRY RUN — no DB writes\n')

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to DB\n')

  // ── 1. RL Test terminals ───────────────────────────────────────────────────
  const rlRes = await client.query(`SELECT id, name, lat, lng FROM terminals WHERE name ILIKE 'rl test%' OR name ILIKE 'RL Test%'`)
  console.log(`Found ${rlRes.rows.length} RL Test terminals`)

  for (const t of rlRes.rows) {
    console.log(`  DEL: ${t.name} (${t.lat}, ${t.lng}) [${t.id}]`)
    if (!DRY_RUN) {
      // Remove connections referencing this terminal first
      await client.query(`DELETE FROM connections WHERE from_id=$1 OR to_id=$1`, [t.id])
      await client.query(`DELETE FROM terminals WHERE id=$1`, [t.id])
    }
  }

  // ── 2. Palumpong/Pandacan Oil Depot duplicate ──────────────────────────────
  const palRes = await client.query(`SELECT id, name, lat, lng FROM terminals WHERE name ILIKE '%Palumpong%Pandacan%'`)
  console.log(`\nFound ${palRes.rows.length} Palumpong/Pandacan duplicates`)

  if (palRes.rows.length === 2) {
    // Check which has more connections — keep that one
    const counts = await Promise.all(palRes.rows.map(async t => {
      const r = await client.query(`SELECT COUNT(*) FROM connections WHERE from_id=$1 OR to_id=$1`, [t.id])
      return { ...t, connCount: parseInt(r.rows[0].count) }
    }))
    counts.sort((a, b) => b.connCount - a.connCount)
    const keep = counts[0], remove = counts[1]
    console.log(`  KEEP: ${keep.name} [${keep.id}] — ${keep.connCount} connections`)
    console.log(`  DEL:  ${remove.name} [${remove.id}] — ${remove.connCount} connections`)

    if (!DRY_RUN) {
      // Repoint any connections from the removed one to the kept one
      await client.query(`UPDATE connections SET from_id=$1 WHERE from_id=$2`, [keep.id, remove.id])
      await client.query(`UPDATE connections SET to_id=$1 WHERE to_id=$2`, [keep.id, remove.id])
      await client.query(`DELETE FROM terminals WHERE id=$1`, [remove.id])
      console.log('  Merged connections and deleted duplicate.')
    }
  }

  await client.end()
  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
