/**
 * Finds near-duplicate terminals (same name, within 0.0015 deg ~150m)
 * and merges the pair: keeps the one with more connections (or older if tied),
 * repoints all connections from the removed one, then deletes it.
 *
 * Run: node scripts/dedup-terminals.mjs [--dry-run]
 */

import pg from 'pg'

const DATABASE_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  if (DRY_RUN) console.log('🔍 DRY RUN — no DB writes\n')

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()

  // Find all pairs with same name within ~150m
  const { rows: pairs } = await client.query(`
    SELECT
      a.id AS aid, a.name, a.lat AS alat, a.lng AS alng, a.created_at AS acreated,
      b.id AS bid, b.lat AS blat, b.lng AS blng, b.created_at AS bcreated
    FROM terminals a
    JOIN terminals b ON a.id < b.id
      AND ABS(a.lat - b.lat) < 0.0015
      AND ABS(a.lng - b.lng) < 0.0015
      AND LOWER(TRIM(a.name)) = LOWER(TRIM(b.name))
    ORDER BY a.name
  `)

  console.log(`Found ${pairs.length} near-duplicate pairs\n`)

  let merged = 0, skipped = 0

  for (const p of pairs) {
    // Count connections for each
    const [ca, cb] = await Promise.all([
      client.query('SELECT COUNT(*) FROM connections WHERE from_id=$1 OR to_id=$1', [p.aid]),
      client.query('SELECT COUNT(*) FROM connections WHERE from_id=$1 OR to_id=$1', [p.bid]),
    ])
    const countA = parseInt(ca.rows[0].count)
    const countB = parseInt(cb.rows[0].count)

    // Keep the one with more connections; if tied, keep the older one
    let keep, remove, keepConns, removeConns
    if (countA >= countB) {
      keep = p.aid; remove = p.bid; keepConns = countA; removeConns = countB
    } else {
      keep = p.bid; remove = p.aid; keepConns = countB; removeConns = countA
    }

    console.log(`MERGE: "${p.name}"`)
    console.log(`  KEEP   [${keep}] — ${keepConns} connections`)
    console.log(`  REMOVE [${remove}] — ${removeConns} connections`)

    if (!DRY_RUN) {
      // Repoint connections — but first check for self-loops that would be created
      // (if keep already has a connection to itself via the merge)
      await client.query(`
        UPDATE connections SET from_id=$1
        WHERE from_id=$2 AND to_id != $1
      `, [keep, remove])
      await client.query(`
        UPDATE connections SET to_id=$1
        WHERE to_id=$2 AND from_id != $1
      `, [keep, remove])
      // Delete any self-referencing connections left over
      await client.query(`DELETE FROM connections WHERE from_id=to_id`)
      // Delete any duplicate connection pairs after remapping
      await client.query(`
        DELETE FROM connections WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY LEAST(from_id,to_id), GREATEST(from_id,to_id) ORDER BY created_at) AS rn
            FROM connections
          ) t WHERE rn > 1
        )
      `)
      await client.query(`DELETE FROM terminals WHERE id=$1`, [remove])
      merged++
      console.log(`  ✓ Merged`)
    } else {
      skipped++
    }
  }

  await client.end()
  console.log(`\n=== DONE === merged:${merged} skipped(dry):${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
