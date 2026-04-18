/**
 * Finds and merges bus stops where names are the same streets in reversed order.
 * e.g. "Del Monte Avenue & FPJ Avenue" == "FPJ Avenue & Del Monte Avenue"
 * Keeps the one with more connections; if tied, keeps the one with the longer name.
 */
import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: all } = await client.query(`
  SELECT id, name, type, lat, lng,
    (SELECT COUNT(*) FROM connections WHERE from_id=t.id OR to_id=t.id) conns
  FROM terminals t
`)

function canonicalKey(name) {
  // Split on common separators, sort tokens alphabetically to make a canonical key
  const parts = name.toLowerCase()
    .replace(/\bat\b/g, '&')
    .replace(/[-–]/g, '&')
    .split(/[&\/,]/)
    .map(s => s.trim())
    .filter(Boolean)
    .sort()
  return parts.join('|')
}

function haversineM(a, b) {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
}

// Build canonical-key index
const byKey = new Map()
for (const t of all) {
  const key = `${t.type}::${canonicalKey(t.name)}`
  if (!byKey.has(key)) byKey.set(key, [])
  byKey.get(key).push(t)
}

const pairs = []
for (const [key, group] of byKey) {
  if (group.length < 2) continue
  // Check pairwise within group — only flag if names differ (not exact duplicates — those are handled by exact dedup)
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j]
      if (a.name === b.name) continue // exact match handled elsewhere
      const dist = haversineM(a, b)
      if (dist > 150) continue // too far apart to be same stop
      pairs.push({ a, b, dist: Math.round(dist), key })
    }
  }
}

pairs.sort((x, y) => x.dist - y.dist)
console.log(`Reversed-name duplicate pairs: ${pairs.length}\n`)

let merged = 0
for (const p of pairs) {
  // Decide keep/delete
  let keep, del_
  if (p.a.conns > p.b.conns) {
    keep = p.a; del_ = p.b
  } else if (p.b.conns > p.a.conns) {
    keep = p.b; del_ = p.a
  } else {
    // Prefer the one with more "normal" order (first street name alphabetically first)
    keep = p.a.name.length >= p.b.name.length ? p.a : p.b
    del_ = keep === p.a ? p.b : p.a
  }

  console.log(`[${p.a.type}] ${p.dist}m  KEEP "${keep.name}" (${keep.conns}c)  DELETE "${del_.name}" (${del_.conns}c)`)

  if (!DRY_RUN) {
    await client.query(`UPDATE connections SET from_id=$1 WHERE from_id=$2 AND to_id != $1`, [keep.id, del_.id])
    await client.query(`UPDATE connections SET to_id=$1 WHERE to_id=$2 AND from_id != $1`, [keep.id, del_.id])
    await client.query(`DELETE FROM connections WHERE from_id=to_id`)
    await client.query(`DELETE FROM terminals WHERE id=$1`, [del_.id])
    merged++
  }
}

await client.end()
console.log(`\n${DRY_RUN ? 'DRY RUN' : `Merged: ${merged}`}`)
