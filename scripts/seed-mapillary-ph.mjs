/**
 * Seed script: fetches ALL Mapillary image positions for the Philippines
 * and inserts them into the mapillary_images DB table.
 *
 * Run migration first:  node scripts/migrate-mapillary-compact.mjs
 * Then seed:            node scripts/seed-mapillary-ph.mjs
 *
 * To also seed Neon:    NEON_DATABASE_URL="postgres://..." node scripts/seed-mapillary-ph.mjs
 *
 * Philippines bbox: west=116, south=4.5, east=127, north=21.5
 * Grid: 0.09° x 0.09° cells — fits under Mapillary 0.010 sq deg area limit
 */

import pg from 'pg'
import https from 'https'

const TOKEN        = 'MLY|26628587603401919|723a9a1c8c0f99c6f22fbc36ff88af65'
const NEON_URL     = process.env.NEON_DATABASE_URL || null
// When NEON_URL is set, mapillary lives on Neon — skip Supabase to save its 500 MB limit
const SUPABASE_URL = NEON_URL ? null : (process.env.DATABASE_URL
  || 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres')

const PH_WEST  = 116.0
const PH_EAST  = 127.0
const PH_SOUTH = 4.5
const PH_NORTH = 21.5
const STEP        = 0.09   // degrees per cell — area = 0.0081 sq deg < 0.010 limit
const LIMIT       = 2000   // Mapillary Graph API max per request
const CONCURRENCY = 8      // parallel requests
const DELAY_MS    = 150    // ms between batches

// Generate all grid cells
const cells = []
for (let lat = PH_SOUTH; lat < PH_NORTH; lat = +(lat + STEP).toFixed(6)) {
  for (let lng = PH_WEST; lng < PH_EAST; lng = +(lng + STEP).toFixed(6)) {
    cells.push({ w: lng, s: lat, e: +(lng + STEP).toFixed(6), n: +(lat + STEP).toFixed(6) })
  }
}
console.log(`Total cells: ${cells.length}`)

// DB clients
const clients = []
if (SUPABASE_URL) {
  const supabase = new pg.Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } })
  await supabase.connect()
  clients.push({ label: 'Supabase', client: supabase })
  console.log('Supabase connected')
}

if (NEON_URL) {
  const neon = new pg.Client({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } })
  await neon.connect()
  clients.push({ label: 'Neon', client: neon })
  console.log('Neon connected')
}

// Fetch one cell from Mapillary Graph API
function fetchCell(cell) {
  return new Promise((resolve) => {
    const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${cell.w},${cell.s},${cell.e},${cell.n}&limit=${LIMIT}&fields=id,geometry`
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data).data || []) } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(15000, () => { req.destroy(); resolve([]) })
  })
}

// Insert batch into one DB client — id cast to BIGINT
async function insertBatch(client, images) {
  if (!images.length) return 0
  // id stored as BIGINT: pass raw numeric string, pg will cast it
  const vals = images.map(img => [
    img.id,                          // BIGINT (Mapillary IDs are pure integers)
    img.geometry.coordinates[1],     // lat FLOAT4
    img.geometry.coordinates[0],     // lng FLOAT4
  ])
  const text = vals.map((_, i) => `($${i*3+1}::bigint,$${i*3+2},$${i*3+3})`).join(',')
  try {
    const res = await client.query(
      `INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`,
      vals.flat()
    )
    return res.rowCount || 0
  } catch (e) {
    console.error('  DB error:', e.message)
    return 0
  }
}

// Process cells in batches of CONCURRENCY
let totalInserted = 0
let totalImages   = 0
let cellsDone     = 0
let cellsWithData = 0
const startTime   = Date.now()

for (let i = 0; i < cells.length; i += CONCURRENCY) {
  const batch   = cells.slice(i, i + CONCURRENCY)
  const results = await Promise.all(batch.map(fetchCell))

  for (let j = 0; j < batch.length; j++) {
    const images = results[j]
    cellsDone++
    if (images.length > 0) {
      cellsWithData++
      totalImages += images.length
      // Insert into all connected DBs
      let inserted = 0
      for (const { client } of clients) {
        inserted = await insertBatch(client, images)
      }
      totalInserted += inserted
      if (images.length === LIMIT) {
        console.log(`  ⚠ Cell ${batch[j].w.toFixed(1)},${batch[j].s.toFixed(1)} hit limit (${LIMIT}) — may be incomplete`)
      }
    }
  }

  if (cellsDone % 20 === 0 || cellsDone === cells.length) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const pct     = ((cellsDone / cells.length) * 100).toFixed(1)
    const eta     = cellsDone > 0
      ? ((Date.now() - startTime) / cellsDone * (cells.length - cellsDone) / 1000).toFixed(0)
      : '?'
    console.log(`[${pct}%] ${cellsDone}/${cells.length} cells | ${totalImages.toLocaleString()} images | ${totalInserted.toLocaleString()} new | ${elapsed}s elapsed | ~${eta}s left`)
  }

  if (i + CONCURRENCY < cells.length) {
    await new Promise(r => setTimeout(r, DELAY_MS))
  }
}

console.log('\n✅ Done!')
console.log(`   Cells processed : ${cellsDone}`)
console.log(`   Cells with data : ${cellsWithData}`)
console.log(`   Total images    : ${totalImages.toLocaleString()}`)
console.log(`   New DB inserts  : ${totalInserted.toLocaleString()}`)
console.log(`   Time            : ${((Date.now() - startTime) / 1000).toFixed(0)}s`)

for (const { client } of clients) await client.end()
