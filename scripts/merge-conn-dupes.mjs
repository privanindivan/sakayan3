import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')

// [keep_name, delete_name] — confirmed same place
const MERGES = [
  // Train station
  ['MRT-GUADALUPE TRAIN STATION', 'Guadalupe'],
  // Bus terminals — keep the one with more/clearer name
  ['Five Star Bus Co. Cubao', 'Five Star Cubao'],
  ['City Lipa Grand Transport Terminal', 'Lipa Grand terminal'],
]

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

for (const [keepName, delName] of MERGES) {
  const { rows: ks } = await client.query(`SELECT id, name, type FROM terminals WHERE name ILIKE $1`, [keepName])
  const { rows: ds } = await client.query(`SELECT id, name, type FROM terminals WHERE name ILIKE $1`, [delName])

  if (ks.length !== 1 || ds.length !== 1) {
    console.log(`SKIP (not unique): keep=${ks.length} "${keepName}" del=${ds.length} "${delName}"`)
    continue
  }
  const k = ks[0], d = ds[0]
  if (k.type !== d.type) {
    console.log(`SKIP type mismatch: "${k.name}"[${k.type}] vs "${d.name}"[${d.type}]`)
    continue
  }

  const { rows: [kc] } = await client.query(`SELECT COUNT(*) n FROM connections WHERE from_id=$1 OR to_id=$1`, [k.id])
  const { rows: [dc] } = await client.query(`SELECT COUNT(*) n FROM connections WHERE from_id=$1 OR to_id=$1`, [d.id])
  console.log(`MERGE: keep "${k.name}" (${kc.n}c) | delete "${d.name}" (${dc.n}c)`)

  if (!DRY_RUN) {
    await client.query(`UPDATE connections SET from_id=$1 WHERE from_id=$2 AND to_id != $1`, [k.id, d.id])
    await client.query(`UPDATE connections SET to_id=$1 WHERE to_id=$2 AND from_id != $1`, [k.id, d.id])
    await client.query(`DELETE FROM connections WHERE from_id=to_id`)
    await client.query(`DELETE FROM terminals WHERE id=$1`, [d.id])
    console.log(`  ✓ done`)
  }
}

await client.end()
console.log(DRY_RUN ? '(dry run)' : 'Done')
