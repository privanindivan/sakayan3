import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()

const { rows: [t] } = await c.query(`SELECT COUNT(*) n FROM terminals`)
const { rows: conn } = await c.query(`SELECT COUNT(*) n FROM connections`)
const { rows: used } = await c.query(`
  SELECT COUNT(DISTINCT id) n FROM terminals
  WHERE EXISTS (SELECT 1 FROM connections WHERE from_id=terminals.id OR to_id=terminals.id)
`)
const { rows: orphans } = await c.query(`
  SELECT COUNT(*) n FROM terminals
  WHERE NOT EXISTS (SELECT 1 FROM connections WHERE from_id=terminals.id OR to_id=terminals.id)
`)

// Who created the orphans?
const { rows: creators } = await c.query(`
  SELECT t.created_by, u.username, COUNT(*) cnt FROM terminals t
  LEFT JOIN users u ON t.created_by = u.id
  WHERE NOT EXISTS (SELECT 1 FROM connections WHERE from_id=t.id OR to_id=t.id)
  GROUP BY t.created_by, u.username ORDER BY cnt DESC LIMIT 10
`)

console.log(`Terminals total: ${t.n}`)
console.log(`  with connections: ${used[0].n}`)
console.log(`  orphans (0 connections): ${orphans[0].n}`)
console.log(`Connections total: ${conn[0].n}`)
console.log(`\nOrphans by creator:`)
for (const r of creators) console.log(`  ${r.cnt} by user=${r.created_by} (${r.username || 'no username'})`)

await c.end()
