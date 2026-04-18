import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Davao circular connections: from_id == to_id (self-loops from commutedavao import)
const { rows: circular } = await client.query(`
  SELECT c.id, c.from_id, t.name, c.color, c.created_at
  FROM connections c
  JOIN terminals t ON t.id = c.from_id
  WHERE c.from_id = c.to_id
  ORDER BY c.created_at
`)

console.log(`Circular (fromId==toId) connections: ${circular.length}`)
for (const r of circular) {
  console.log(`  [${r.id}] "${r.name}" color=${r.color}`)
}

if (!DRY_RUN && circular.length > 0) {
  const ids = circular.map(r => r.id)
  await client.query(`DELETE FROM connections WHERE id = ANY($1)`, [ids])
  console.log(`\nDeleted ${ids.length} circular connections`)
}

await client.end()
if (DRY_RUN) console.log('\n(dry run)')
