/**
 * One-time seed script: fetches ALL Mapillary image positions for the Philippines
 * and inserts them into the mapillary_images DB table.
 *
 * Run: node scripts/seed-mapillary-ph.mjs
 *
 * Philippines bbox: west=116, south=4.5, east=127, north=21.5
 * Grid: 0.2° x 0.2° cells = 55 x 85 = 4,675 cells max
 * (land-only cells much fewer — ~1,200 actually have images)
 */

import pg from 'pg'
import https from 'https'

const TOKEN = 'MLY|26628587603401919|723a9a1c8c0f99c6f22fbc36ff88af65'
const DATABASE_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

const PH_WEST  = 116.0
const PH_EAST  = 127.0
const PH_SOUTH = 4.5
const PH_NORTH = 21.5
const STEP        = 0.09  // degrees per cell — must be ≤ 0.1° so area < 0.010 sq deg limit
const LIMIT       = 2000  // Mapillary Graph API max per request
const CONCURRENCY = 8     // parallel requests
const DELAY_MS    = 150   // ms between batches

// Generate all grid cells
const cells = []
for (let lat = PH_SOUTH; lat < PH_NORTH; lat = +(lat + STEP).toFixed(6)) {
  for (let lng = PH_WEST; lng < PH_EAST; lng = +(lng + STEP).toFixed(6)) {
    cells.push({
      w: lng,
      s: lat,
      e: +(lng + STEP).toFixed(6),
      n: +(lat + STEP).toFixed(6),
    })
  }
}

console.log(`Total cells: ${cells.length}`)

// DB client
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log('DB connected')

// Fetch one cell from Mapillary Graph API
function fetchCell(cell) {
  return new Promise((resolve) => {
    const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&bbox=${cell.w},${cell.s},${cell.e},${cell.n}&limit=${LIMIT}&fields=id,geometry`
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.data || [])
        } catch {
          resolve([])
        }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(15000, () => { req.destroy(); resolve([]) })
  })
}

// Insert batch into DB
async function insertBatch(images) {
  if (!images.length) return 0
  const vals = images.map(img => [
    img.id,
    img.geometry.coordinates[1], // lat
    img.geometry.coordinates[0], // lng
  ])
  const text = vals.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',')
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
let totalImages = 0
let cellsDone = 0
let cellsWithData = 0

const startTime = Date.now()

for (let i = 0; i < cells.length; i += CONCURRENCY) {
  const batch = cells.slice(i, i + CONCURRENCY)
  const results = await Promise.all(batch.map(fetchCell))

  for (let j = 0; j < batch.length; j++) {
    const images = results[j]
    cellsDone++
    if (images.length > 0) {
      cellsWithData++
      totalImages += images.length
      const inserted = await insertBatch(images)
      totalInserted += inserted
      if (images.length === LIMIT) {
        // Hit the limit — this cell is dense, log it for awareness
        console.log(`  ⚠ Cell ${batch[j].w.toFixed(1)},${batch[j].s.toFixed(1)} hit limit (${LIMIT}) — may be incomplete`)
      }
    }
  }

  // Progress every 20 cells
  if (cellsDone % 20 === 0 || cellsDone === cells.length) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    const pct = ((cellsDone / cells.length) * 100).toFixed(1)
    const eta = cellsDone > 0
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

await client.end()
