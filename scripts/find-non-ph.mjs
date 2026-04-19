import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Philippines bounding box: lat 4.5–21.5, lng 116–127
const { rows } = await client.query(`
  SELECT id, name, type, lat, lng, details
  FROM terminals
  WHERE lat NOT BETWEEN 4.5 AND 21.5
     OR lng NOT BETWEEN 116.0 AND 127.0
  ORDER BY lat
`)
console.log(`Non-Philippines terminals: ${rows.length}`)
for (const r of rows) {
  console.log(`  [${r.type}] lat=${r.lat.toFixed(3)} lng=${r.lng.toFixed(3)} "${r.name}"`)
  if (r.details) console.log(`    ${r.details.slice(0, 80)}`)
}
await client.end()
