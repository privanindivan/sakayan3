import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: davao } = await client.query(`
  SELECT t.id, t.name, t.type,
    (SELECT COUNT(*) FROM connections WHERE from_id=t.id OR to_id=t.id) conns
  FROM terminals t
  WHERE t.name ILIKE '%davao%' OR t.name ILIKE '%, davao%'
  ORDER BY conns DESC, t.name
`)
console.log(`Davao terminals: ${davao.length}`)
for (const r of davao) console.log(`  [${r.type}] ${r.conns}c "${r.name}"`)

// Also check for any remaining circular (from_id==to_id) connections
const { rows: [circ] } = await client.query(`SELECT COUNT(*) n FROM connections WHERE from_id=to_id`)
console.log(`\nCircular (from_id==to_id) connections remaining: ${circ.n}`)

await client.end()
