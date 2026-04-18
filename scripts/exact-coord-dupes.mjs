import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Find terminals at identical coordinates, same type — all orphans (no conns)
const { rows: pairs } = await client.query(`
  SELECT a.id aid, a.name aname, b.id bid, b.name bname, a.type, a.lat, a.lng,
    (SELECT COUNT(*) FROM connections WHERE from_id=a.id OR to_id=a.id) ac,
    (SELECT COUNT(*) FROM connections WHERE from_id=b.id OR to_id=b.id) bc
  FROM terminals a
  JOIN terminals b ON a.id < b.id
    AND a.lat = b.lat AND a.lng = b.lng AND a.type = b.type
  ORDER BY a.name
`)

console.log(`Exact-coord same-type pairs: ${pairs.length}`)
let deleted = 0
for (const p of pairs) {
  const keep = p.ac >= p.bc ? { id: p.aid, name: p.aname } : { id: p.bid, name: p.bname }
  const del_  = p.ac >= p.bc ? { id: p.bid, name: p.bname } : { id: p.aid, name: p.aname }
  const delConns = p.ac >= p.bc ? p.bc : p.ac
  console.log(`  [${p.type}] KEEP "${keep.name}" | DELETE "${del_.name}" (${delConns}c)`)
  if (!DRY_RUN && delConns === 0) {
    await client.query(`DELETE FROM terminals WHERE id=$1`, [del_.id])
    deleted++
  }
}

await client.end()
console.log(`\n${DRY_RUN ? 'DRY RUN' : `Deleted: ${deleted}`}`)
