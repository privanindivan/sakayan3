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
const CONCURRENCY = 24     // parallel requests (was 8 — ocean cells timeout-limited)
const DELAY_MS    = 50     // ms between batches (was 150)

// Generate all grid cells
const cells = []
for (let lat = PH_SOUTH; lat < PH_NORTH; lat = +(lat + STEP).toFixed(6)) {
  for (let lng = PH_WEST; lng < PH_EAST; lng = +(lng + STEP).toFixed(6)) {
    cells.push({ w: lng, s: lat, e: +(lng + STEP).toFixed(6), n: +(lat + STEP).toFixed(6) })
  }
}
console.log(`Total cells: ${cells.length}`)

// Connect with auto-reconnect (Neon free tier suspends and drops connections)
async function makeClient(label, url) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await client.connect()
  client.on('error', () => {}) // suppress unhandled error on drop
  console.log(`${label} connected`)
  return client
}

async function reconnect(label, url) {
  console.log(`  ↻ Reconnecting ${label}...`)
  try {
    const c = await makeClient(label, url)
    return c
  } catch { return null }
}

// DB clients
const clients = []
if (SUPABASE_URL) clients.push({ label: 'Supabase', url: SUPABASE_URL, client: await makeClient('Supabase', SUPABASE_URL) })
if (NEON_URL)     clients.push({ label: 'Neon',     url: NEON_URL,     client: await makeClient('Neon',     NEON_URL)     })

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
    req.setTimeout(5000, () => { req.destroy(); resolve([]) })
  })
}

// Insert batch — reconnects automatically if Neon drops the connection
async function insertBatch(entry, images) {
  if (!images.length) return 0
  const vals = images.map(img => [
    img.id,
    img.geometry.coordinates[1],
    img.geometry.coordinates[0],
  ])
  const text = vals.map((_, i) => `($${i*3+1}::bigint,$${i*3+2},$${i*3+3})`).join(',')
  const query = `INSERT INTO mapillary_images(id,lat,lng) VALUES ${text} ON CONFLICT(id) DO NOTHING`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await entry.client.query(query, vals.flat())
      return res.rowCount || 0
    } catch (e) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000))
        entry.client = await reconnect(entry.label, entry.url) || entry.client
      } else {
        console.error(`  ${entry.label} error:`, e.message)
      }
    }
  }
  return 0
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
      for (const entry of clients) {
        inserted = await insertBatch(entry, images)
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
