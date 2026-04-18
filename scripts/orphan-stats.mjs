import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: [total] } = await client.query(`SELECT COUNT(*) n FROM terminals`)
const { rows: [orphans] } = await client.query(`SELECT COUNT(*) n FROM terminals WHERE NOT EXISTS (SELECT 1 FROM connections WHERE from_id=terminals.id OR to_id=terminals.id)`)
const { rows: byType } = await client.query(`
  SELECT type, COUNT(*) total,
    SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM connections WHERE from_id=t.id OR to_id=t.id) THEN 1 ELSE 0 END) orphans
  FROM terminals t GROUP BY type ORDER BY orphans DESC
`)

console.log(`Total: ${total.n} | Orphans (0 connections): ${orphans.n}`)
console.log('\nBy type:')
for (const r of byType) {
  console.log(`  [${r.type}] total=${r.total} orphans=${r.orphans}`)
}
await client.end()
