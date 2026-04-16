/**
 * Import routes from puv-routes-ph Firebase RTDB into Sakayan DB
 * Usage: node scripts/import_puv_routes.js [--dry-run]
 *
 * Source: https://puv-routes-ph-931645605152.asia-southeast3.run.app/
 * Firebase RTDB: https://puv-routes-default-rtdb.asia-southeast1.firebasedatabase.app/routes.json
 *
 * Data structure:
 *   route.name, route.puvType, route.start{lat,lng,name}, route.end{lat,lng,name}
 *   route.path [{lat,lng}], route.stops [{id,location:{lat,lng},name,note,type}]
 *   route.fare, route.schedule, route.distance, route.duration, route.routeStructure
 */

require('dotenv').config({ path: '.env.local' })
const https = require('https')
const { Pool } = require('pg')

const DRY_RUN = process.argv.includes('--dry-run')
const FIREBASE_URL = 'https://puv-routes-default-rtdb.asia-southeast1.firebasedatabase.app/routes.json'
const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/')
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
const CREATED_BY = 'b45b7940-2b26-498b-914c-2452ba60d98d'

// ── Type helpers ─────────────────────────────────────────────────────────────

function terminalType(puvType) {
  const t = (puvType || '').toLowerCase()
  if (t.includes('bus') || t.includes('mini')) return 'Bus'
  if (t.includes('uv express') || t.includes('uv')) return 'UV Express'
  if (t.includes('train') || t.includes('lrt') || t.includes('mrt')) return 'Train'
  if (t.includes('tricycle') || t.includes('e-trike') || t.includes('etrike')) return 'Tricycle'
  if (t.includes('cab') || t.includes('taxi')) return 'Cab'
  if (t.includes('jeep') || t.includes('modern jeep')) return 'Jeep'
  return 'Jeep'
}

function routeColor(puvType) {
  const t = (puvType || '').toLowerCase()
  if (t.includes('bus')) return '#4A90D9'
  if (t.includes('uv')) return '#27AE60'
  if (t.includes('train') || t.includes('lrt') || t.includes('mrt')) return '#8E44AD'
  if (t.includes('tricycle') || t.includes('e-trike')) return '#F39C12'
  if (t.includes('cab')) return '#EAB308'
  return '#FF6B35'  // jeepney
}

// Parse "₱20" or "20" or "₱20-50" → numeric (take lower bound)
function parseFare(fareStr) {
  if (!fareStr || !fareStr.trim()) return null
  const nums = fareStr.replace(/[₱,]/g, '').match(/[\d.]+/)
  return nums ? parseFloat(nums[0]) : null
}

// Parse "1 hr", "30 mins", "1 hr 30 mins" → seconds
function parseDuration(durStr) {
  if (!durStr) return null
  let secs = 0
  const hours = durStr.match(/(\d+)\s*hr/i)
  const mins = durStr.match(/(\d+)\s*min/i)
  if (hours) secs += parseInt(hours[1]) * 3600
  if (mins) secs += parseInt(mins[1]) * 60
  return secs > 0 ? secs : null
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function findNearbyTerminal(lat, lng, radiusDeg = 0.0008) {
  const rows = await pool.query(
    'SELECT id, name FROM terminals WHERE ABS(lat-$1)<$3 AND ABS(lng-$2)<$3 LIMIT 1',
    [lat, lng, radiusDeg]
  )
  return rows.rows[0] || null
}

async function createTerminal(name, lat, lng, type, details, schedule) {
  if (DRY_RUN) return { id: 'dry-' + Date.now(), name }
  const rows = await pool.query(
    `INSERT INTO terminals (name, lat, lng, type, details, schedule, images, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, '{}', $7)
     ON CONFLICT DO NOTHING RETURNING id, name`,
    [name.substring(0, 200), lat, lng, type, details || null, schedule ? JSON.stringify(schedule) : null, CREATED_BY]
  )
  if (!rows.rows[0]) {
    // ON CONFLICT — find by coords
    const found = await findNearbyTerminal(lat, lng, 0.0001)
    return found
  }
  return rows.rows[0]
}

async function updateSchedule(id, schedule) {
  if (!schedule || DRY_RUN) return
  await pool.query(
    'UPDATE terminals SET schedule=$1 WHERE id=$2 AND schedule IS NULL',
    [JSON.stringify(schedule), id]
  )
}

async function connectionExists(fromId, toId) {
  const rows = await pool.query(
    'SELECT id FROM connections WHERE (from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1) LIMIT 1',
    [fromId, toId]
  )
  return rows.rows.length > 0
}

async function createConnection(fromId, toId, path, stops, fare, durationSecs, color) {
  // Geometry: array of [lat,lng] pairs (Sakayan native format)
  const geometry = path.length > 1 ? path.map(p => [p.lat, p.lng]) : null

  // Waypoints: intermediate stops (skip first and last)
  const waypoints = stops.slice(1, -1).map(s => ({
    id: String(s.id || Date.now()),
    name: s.name,
    lat: s.location.lat,
    lng: s.location.lng,
  }))

  const fareVal = fare ? parseFloat(fare) : null
  const budget = fareVal ? (fareVal < 30 ? 'low' : fareVal <= 100 ? 'medium' : 'high') : 'medium'

  if (DRY_RUN) return { id: 'dry-conn-' + Date.now() }

  const rows = await pool.query(
    'INSERT INTO connections (from_id,to_id,geometry,color,fare,duration_secs,waypoints,budget_level,created_by) VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id',
    [fromId, toId, JSON.stringify(geometry), color, fareVal, durationSecs, JSON.stringify(waypoints), budget, CREATED_BY]
  )
  return rows.rows[0]
}

// ── Fetch from Firebase ───────────────────────────────────────────────────────

function fetchRoutes() {
  return new Promise((resolve, reject) => {
    https.get(FIREBASE_URL, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Fetching PUV routes from Firebase...`)
  const rawData = await fetchRoutes()
  const routes = Object.entries(rawData)
    .map(([key, r]) => r ? { ...r, _key: key } : null)
    .filter(r => r && r.status === 'approved')

  console.log(`Found ${routes.length} approved routes\n`)

  let created = 0, skipped = 0, errors = 0

  for (const route of routes) {
    const { name, puvType, start, end, path = [], stops = [], fare, schedule, duration, routeStructure } = route

    const tType = terminalType(puvType)
    const color = routeColor(puvType)
    const fareVal = parseFare(fare)
    const durSecs = parseDuration(duration)

    // Build normalized stops list
    // Prefer explicit start/end over first/last stop
    const allStops = stops.length > 0 ? stops : []

    // Determine from/to coordinates
    const fromCoords = start || (allStops[0] ? allStops[0].location : path[0])
    const toCoords   = end   || (allStops[allStops.length - 1] ? allStops[allStops.length - 1].location : path[path.length - 1])
    const fromName   = (start && start.name) || (allStops[0] && allStops[0].name) || `${name} (Start)`
    const toName     = (end   && end.name)   || (allStops[allStops.length - 1] && allStops[allStops.length - 1].name) || `${name} (End)`

    if (!fromCoords || !toCoords) {
      console.log(`⏭  SKIP (no coords): ${name}`)
      skipped++
      continue
    }

    try {
      // FROM terminal
      let fromTerminal = await findNearbyTerminal(fromCoords.lat, fromCoords.lng)
      if (!fromTerminal) {
        const details = allStops[0]?.note || null
        fromTerminal = await createTerminal(fromName, fromCoords.lat, fromCoords.lng, tType, details, schedule)
        console.log(`  ✚ FROM terminal: ${fromName}`)
      } else {
        console.log(`  ✓ FROM exists: ${fromTerminal.name}`)
        await updateSchedule(fromTerminal.id, schedule)
      }

      // TO terminal
      let toTerminal = await findNearbyTerminal(toCoords.lat, toCoords.lng)
      if (!toTerminal) {
        const details = allStops[allStops.length - 1]?.note || null
        toTerminal = await createTerminal(toName, toCoords.lat, toCoords.lng, tType, details, schedule)
        console.log(`  ✚ TO terminal: ${toName}`)
      } else {
        console.log(`  ✓ TO exists: ${toTerminal.name}`)
        await updateSchedule(toTerminal.id, schedule)
      }

      if (!fromTerminal || !toTerminal) {
        console.log(`⚠  Could not resolve terminals for: ${name}`)
        errors++
        continue
      }

      // Skip if connection already exists
      if (!DRY_RUN && await connectionExists(fromTerminal.id, toTerminal.id)) {
        console.log(`⏭  connection exists: ${name}`)
        skipped++
        continue
      }

      // Build connection path — prefer explicit path, fallback to stop locations
      const connPath = path.length > 1 ? path
        : allStops.length > 1 ? allStops.map(s => s.location)
        : [fromCoords, toCoords]

      const conn = await createConnection(fromTerminal.id, toTerminal.id, connPath, allStops, fareVal, durSecs, color)
      console.log(`✅ ${name} [${puvType}] fare=₱${fareVal || '?'} sched="${schedule || '?'}" path=${connPath.length}pts wpts=${Math.max(0, allStops.length - 2)} → conn ${conn.id}`)
      created++

    } catch (err) {
      console.error(`❌ ERROR on ${name}: ${err.message}`)
      errors++
    }
  }

  console.log(`\n── DONE ──`)
  console.log(`Created: ${created} | Skipped: ${skipped} | Errors: ${errors}`)
  if (DRY_RUN) console.log('(dry run — nothing written to DB)')
  await pool.end()
}

main().catch(err => { console.error(err); pool.end(); process.exit(1) })
