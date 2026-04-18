/**
 * Smart dedup: same type, within 30m, name containment.
 * Only deletes the one with 0 connections.
 * Skips risky edge cases (bay numbers, directional prefixes, city-only names, route numbers).
 */
import pg from 'pg'

const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

const { rows: pairs } = await client.query(`
  SELECT
    a.id aid, a.name aname, a.type atype,
    b.id bid, b.name bname,
    ROUND((point(a.lng,a.lat) <-> point(b.lng,b.lat)) * 111320) AS dist_m,
    (SELECT COUNT(*) FROM connections WHERE from_id=a.id OR to_id=a.id) AS ac,
    (SELECT COUNT(*) FROM connections WHERE from_id=b.id OR to_id=b.id) AS bc
  FROM terminals a
  JOIN terminals b ON a.id < b.id
    AND ABS(a.lat - b.lat) < 0.00027
    AND ABS(a.lng - b.lng) < 0.00027
    AND a.type = b.type
  ORDER BY dist_m
`)

// Names that are just a city/area (too generic to be a valid merge target)
const GENERIC_CITY_NAMES = new Set([
  'cebu', 'iloilo', 'bacolod', 'davao', 'manila', 'valenzuela', 'marikina',
  'caloocan', 'pasay', 'quezon', 'taguig', 'pasig', 'makati', 'paranaque',
  'pup', 'edsa', 'avenida', 'roxas', 'batangas', 'balintawak',
])

const candidates = []
for (const p of pairs) {
  const an = p.aname.toLowerCase().trim()
  const bn = p.bname.toLowerCase().trim()

  // One must be a substring of the other
  if (!bn.includes(an) && !an.includes(bn)) continue

  // Never delete a pure city/area name if it matches — too generic
  if (GENERIC_CITY_NAMES.has(an) || GENERIC_CITY_NAMES.has(bn)) continue

  // Skip directional/positional variants
  if (/kaatbang|kahuman|unahan|tapat|kanto|farside|nearside|north.?bound|south.?bound|east.?bound|west.?bound/i.test(p.aname) ||
      /kaatbang|kahuman|unahan|tapat|kanto|farside|nearside|north.?bound|south.?bound|east.?bound|west.?bound/i.test(p.bname)) continue

  // Skip arrival/departure bays
  if (/bay \d|arrivals|departures/i.test(p.aname) || /bay \d|arrivals|departures/i.test(p.bname)) continue

  // Skip route numbers
  if (/route\s+\d/i.test(p.aname) || /route\s+\d/i.test(p.bname)) continue

  // Skip "X - Dest" pairs where destinations differ
  const dashA = p.aname.match(/\s[-–]\s(.+)$/)
  const dashB = p.bname.match(/\s[-–]\s(.+)$/)
  if (dashA && dashB && dashA[1].toLowerCase() !== dashB[1].toLowerCase()) continue

  // Skip "Street/CrossStreet" with different cross-streets
  const slashA = p.aname.match(/^(.+?)\/(.+)$/)
  const slashB = p.bname.match(/^(.+?)\/(.+)$/)
  if (slashA && slashB) {
    const [, a1, a2] = slashA; const [, b1, b2] = slashB
    if (a1.toLowerCase() === b1.toLowerCase() && a2.toLowerCase() !== b2.toLowerCase()) continue
  }

  // Skip "(Closed)" — would keep the closed version if it's longer
  if (/\(closed\)/i.test(p.aname) || /\(closed\)/i.test(p.bname)) continue

  // Skip PITX sub-terminal merges with generic "Pitx"
  if (/pitx/i.test(p.aname) && /pitx/i.test(p.bname)) continue

  candidates.push(p)
}

console.log(`Candidates after filtering: ${candidates.length}\n`)
let merged = 0, skipped = 0

for (const p of candidates) {
  let keep, del_
  if (p.ac > p.bc) {
    keep = { id: p.aid, name: p.aname, conns: p.ac }
    del_  = { id: p.bid, name: p.bname, conns: p.bc }
  } else if (p.bc > p.ac) {
    keep = { id: p.bid, name: p.bname, conns: p.bc }
    del_  = { id: p.aid, name: p.aname, conns: p.ac }
  } else {
    // Tied — keep longer name
    if (p.aname.length >= p.bname.length) {
      keep = { id: p.aid, name: p.aname, conns: p.ac }
      del_  = { id: p.bid, name: p.bname, conns: p.bc }
    } else {
      keep = { id: p.bid, name: p.bname, conns: p.bc }
      del_  = { id: p.aid, name: p.aname, conns: p.ac }
    }
  }

  if (del_.conns > 0) {
    console.log(`SKIP (del has conns ${del_.conns}c): keep "${keep.name}" | del "${del_.name}"`)
    skipped++
    continue
  }

  console.log(`[${p.atype}] ${Math.round(p.dist_m)}m | KEEP "${keep.name}" (${keep.conns}c) | DELETE "${del_.name}"`)
  if (!DRY_RUN) {
    await client.query(`DELETE FROM terminals WHERE id=$1`, [del_.id])
    merged++
  } else {
    skipped++
  }
}

await client.end()
console.log(`\nMerged: ${merged}  Skipped: ${skipped}  ${DRY_RUN ? '(dry run)' : ''}`)
