/**
 * Broad duplicate finder: same type, within 100m, name similarity >= 60%
 * Uses simple token overlap instead of substring containment.
 */
import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Check if pg_trgm is available
try {
  await client.query(`SELECT similarity('a','b')`)
  console.log('pg_trgm available\n')
} catch {
  console.log('pg_trgm NOT available — using token overlap instead\n')
}

// Pull all terminals to do comparison in JS (avoids needing pg_trgm)
const { rows: all } = await client.query(`
  SELECT id, name, type, lat, lng,
    (SELECT COUNT(*) FROM connections WHERE from_id=t.id OR to_id=t.id) conns
  FROM terminals t
  ORDER BY type, name
`)

console.log(`Total terminals: ${all.length}\n`)

function tokenize(name) {
  return new Set(name.toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2))
}

function tokenSimilarity(a, b) {
  const ta = tokenize(a), tb = tokenize(b)
  if (!ta.size || !tb.size) return 0
  let overlap = 0
  for (const t of ta) if (tb.has(t)) overlap++
  return overlap / Math.max(ta.size, tb.size)
}

function haversineM(a, b) {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
}

const pairs = []
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j]
    if (a.type !== b.type) continue
    const dist = haversineM(a, b)
    if (dist > 100) continue
    const sim = tokenSimilarity(a.name, b.name)
    if (sim < 0.5) continue
    pairs.push({ a, b, dist: Math.round(dist), sim: Math.round(sim * 100) })
  }
}

pairs.sort((x, y) => y.sim - x.sim || x.dist - y.dist)

console.log(`Potential duplicates (same type, ≤100m, ≥50% name token overlap): ${pairs.length}\n`)

// Group by similarity band
const high = pairs.filter(p => p.sim >= 80)
const med  = pairs.filter(p => p.sim >= 60 && p.sim < 80)
const low  = pairs.filter(p => p.sim < 60)
console.log(`  High confidence (≥80% similar): ${high.length}`)
console.log(`  Medium (60-79%): ${med.length}`)
console.log(`  Low (50-59%): ${low.length}\n`)

console.log('=== HIGH CONFIDENCE (≥80%) ===')
for (const p of high.slice(0, 60)) {
  const flag = p.a.conns > 0 && p.b.conns > 0 ? '⚠ both have conns' : p.a.conns + p.b.conns === 0 ? '' : ''
  console.log(`  [${p.a.type}] ${p.dist}m ${p.sim}% "${p.a.name}" (${p.a.conns}c) | "${p.b.name}" (${p.b.conns}c) ${flag}`)
}

await client.end()
