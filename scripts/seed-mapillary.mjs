// Full Philippines preseed — covers all regions by land bbox, skips ocean waste
// Usage: node scripts/seed-mapillary.mjs
import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envVars = {}
try {
  readFileSync(resolve(__dir, '../.env.local'), 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.trim().split('=')
    if (k && !k.startsWith('#')) envVars[k] = v.join('=')
  })
} catch {}

const TOKEN = envVars.MAPILLARY_TOKEN || envVars.NEXT_PUBLIC_MAPILLARY_TOKEN || process.env.MAPILLARY_TOKEN
const DB_URL = (envVars.DATABASE_URL || process.env.DATABASE_URL || '').replace(':5432/', ':6543/')

if (!TOKEN) { console.error('No MAPILLARY_TOKEN'); process.exit(1) }
if (!DB_URL) { console.error('No DATABASE_URL'); process.exit(1) }

const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 5 })

// All Philippine regions — every island group covered
const REGIONS = [
  // Luzon
  { name: 'Metro Manila / NCR',        s:14.20, n:14.90, w:120.80, e:121.35 },
  { name: 'CALABARZON',                s:13.40, n:14.30, w:120.60, e:122.10 },
  { name: 'Central Luzon (Region III)',s:14.70, n:16.00, w:119.70, e:121.50 },
  { name: 'Ilocos Region (I)',         s:15.50, n:18.50, w:119.70, e:120.80 },
  { name: 'Cagayan Valley (II)',       s:15.50, n:18.60, w:120.80, e:122.60 },
  { name: 'CAR (Cordillera)',          s:16.00, n:18.00, w:120.40, e:121.60 },
  { name: 'Bicol (V)',                 s:11.60, n:14.10, w:122.50, e:124.60 },
  { name: 'MIMAROPA (IV-B)',           s: 8.00, n:12.60, w:117.50, e:121.60 },
  // Visayas
  { name: 'Western Visayas (VI)',      s: 9.80, n:11.80, w:121.60, e:123.10 },
  { name: 'Central Visayas (VII)',     s: 9.00, n:11.50, w:122.60, e:124.60 },
  { name: 'Eastern Visayas (VIII)',    s: 9.80, n:12.60, w:123.80, e:125.50 },
  // Mindanao
  { name: 'Zamboanga Peninsula (IX)',  s: 6.50, n: 8.60, w:121.50, e:123.60 },
  { name: 'Northern Mindanao (X)',     s: 7.50, n: 9.10, w:123.50, e:125.50 },
  { name: 'Davao Region (XI)',         s: 5.50, n: 8.10, w:125.00, e:126.70 },
  { name: 'SOCCSKSARGEN (XII)',        s: 5.50, n: 7.60, w:123.50, e:125.50 },
  { name: 'Caraga (XIII)',             s: 7.50, n:10.10, w:125.00, e:126.70 },
  { name: 'BARMM (Bangsamoro)',        s: 5.00, n: 7.60, w:119.90, e:124.10 },
  // Other islands
  { name: 'Palawan',                   s: 7.80, n:12.10, w:117.00, e:119.90 },
  { name: 'Sulu / Tawi-Tawi',         s: 4.50, n: 6.20, w:119.20, e:122.00 },
]

const TILE_DEG = 0.09
let allTiles = []
for (const reg of REGIONS) {
  const tiles = []
  for (let c = Math.floor(reg.w / TILE_DEG); c <= Math.floor(reg.e / TILE_DEG); c++)
    for (let r = Math.floor(reg.s / TILE_DEG); r <= Math.floor(reg.n / TILE_DEG); r++)
      tiles.push([c, r, reg.name])
  allTiles.push(...tiles)
}

// Deduplicate tiles (regions can overlap)
const seen = new Set()
allTiles = allTiles.filter(([c, r]) => {
  const k = `${c}:${r}`
  if (seen.has(k)) return false
  seen.add(k)
  return true
})

const total = allTiles.length
console.log(`Full Philippines seed: ${total} tiles across ${REGIONS.length} regions`)

let done = 0, inserted = 0, errors = 0
let currentRegion = ''

async function fetchTile(col, row) {
  const w = +(col * TILE_DEG).toFixed(6), s = +(row * TILE_DEG).toFixed(6)
  const e = +(w + TILE_DEG).toFixed(6), n = +(s + TILE_DEG).toFixed(6)
  try {
    const res = await fetch(`https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${w},${s},${e},${n}&limit=500&fields=id,geometry`)
    if (!res.ok) { errors++; return }
    const json = await res.json()
    const imgs = json.data || []
    if (!imgs.length) return
    const vals = imgs.map(i => [i.id, i.geometry.coordinates[1], i.geometry.coordinates[0]])
    const text = vals.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',')
    const result = await pool.query(
      `INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`,
      vals.flat()
    )
    inserted += result.rowCount || 0
  } catch { errors++ }
}

const BATCH = 30
for (let i = 0; i < allTiles.length; i += BATCH) {
  const batch = allTiles.slice(i, i + BATCH)
  if (batch[0][2] !== currentRegion) {
    currentRegion = batch[0][2]
    process.stdout.write(`\n  → ${currentRegion}`)
  }
  await Promise.all(batch.map(([c, r]) => fetchTile(c, r)))
  done += batch.length
  process.stdout.write(`\r  ${done}/${total} | ${inserted} new images | ${errors} errs  `)
}

console.log(`\n\nDone! ${inserted} total new images inserted, ${errors} errors`)
const count = await pool.query('SELECT COUNT(*) FROM mapillary_images')
console.log(`DB total: ${count.rows[0].count} images`)
await pool.end()
