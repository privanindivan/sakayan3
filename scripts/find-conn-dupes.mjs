import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Both-have-connections nearby pairs (within 100m, same type)
const { rows } = await client.query(`
  SELECT
    a.id aid, a.name aname, a.type atype,
    b.id bid, b.name bname,
    ROUND((point(a.lng,a.lat) <-> point(b.lng,b.lat)) * 111320) AS dist_m,
    (SELECT COUNT(*) FROM connections WHERE from_id=a.id OR to_id=a.id) AS aconns,
    (SELECT COUNT(*) FROM connections WHERE from_id=b.id OR to_id=b.id) AS bconns
  FROM terminals a
  JOIN terminals b ON a.id < b.id
    AND ABS(a.lat - b.lat) < 0.0009
    AND ABS(a.lng - b.lng) < 0.0009
    AND a.type = b.type
    AND (SELECT COUNT(*) FROM connections WHERE from_id=a.id OR to_id=a.id) > 0
    AND (SELECT COUNT(*) FROM connections WHERE from_id=b.id OR to_id=b.id) > 0
  ORDER BY dist_m
  LIMIT 40
`)

console.log(`Both-have-conns nearby pairs: ${rows.length}`)
for (const r of rows) {
  console.log(`  [${r.atype}] ${Math.round(r.dist_m)}m [${r.aconns}c] "${r.aname}" | [${r.bconns}c] "${r.bname}"`)
}

await client.end()
