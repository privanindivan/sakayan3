/**
 * Import competitor (puv-routes-ph) data into Sakayan DB.
 * Fetches routes from Firebase RTDB, deduplicates terminals by proximity,
 * inserts terminals + connections + schedule into the Supabase DB.
 *
 * Run: node scripts/import-competitor.mjs
 */

import pg from 'pg'

const DATABASE_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const RTDB_URL = 'https://puv-routes-default-rtdb.asia-southeast1.firebasedatabase.app'

// ── Helpers ────────────────────────────────────────────────────────────────

// Map competitor puvType / route name → Sakayan type
function detectType(puvType = '', name = '') {
  const p = puvType.toLowerCase()
  const n = name.toLowerCase()
  if (/tric|e-tric|sikad/.test(p)) return 'Tricycle'
  if (/bus|mini.?bus/.test(p) || /bus|p2p|gliner|g-liner|liner|aircon/.test(n)) return 'Bus'
  if (/uv|fx|van/.test(p) || /uv|fx/.test(n)) return 'UV Express'
  if (/mrt|lrt|pnr|train|rail/.test(n)) return 'Train'
  if (/modern|jeepney|jeep/.test(p)) return 'Jeep'
  return 'Jeep'
}

// Parse "11 min" or "1 hr 30 min" → seconds
function parseDuration(str = '') {
  let secs = 0
  const hr = str.match(/(\d+)\s*hr/)
  const mn = str.match(/(\d+)\s*min/)
  if (hr) secs += parseInt(hr[1]) * 3600
  if (mn) secs += parseInt(mn[1]) * 60
  return secs || null
}

// Parse "4:00 AM – 10:00 PM" or "4:00 AM - 9:00 PM" → { days, start, end }
// Sakayan stores schedule as { days:"Daily", start:"04:00", end:"22:00" }
function parseSchedule(str = '') {
  if (!str || !str.trim()) return null
  // Match time tokens like "4:00 AM", "12:00 AM (Midnight)", "10:00 PM"
  const times = [...str.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)]
  if (times.length < 2) return null

  const to24 = (h, m, ampm) => {
    h = parseInt(h); m = parseInt(m)
    if (ampm.toUpperCase() === 'AM') return `${String(h === 12 ? 0 : h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
    return `${String(h === 12 ? 12 : h + 12).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }

  const [, h1, m1, ap1] = times[0]
  const [, h2, m2, ap2] = times[1]
  return {
    days:  'Daily',
    start: to24(h1, m1, ap1),
    end:   to24(h2, m2, ap2),
  }
}

// Pick the "better" terminal for schedule assignment:
// prefer the one whose name contains hub keywords, else pick start
function pickPrimaryTerminal(startT, endT) {
  const hubWords = /terminal|station|hub|jeepney|bus stop|parking|center|centre|palengke|market|mall|pitx|ltfrb/i
  const startScore = hubWords.test(startT.name) ? 1 : 0
  const endScore   = hubWords.test(endT.name)   ? 1 : 0
  // If tied, prefer start (it's typically the origin hub)
  return endScore > startScore ? endT : startT
}

// Distance in degrees
function degDist(a, b) { return Math.hypot(a.lat - b.lat, a.lng - b.lng) }

// Find existing terminal within ~150m (0.0015 deg)
function findNearby(candidates, point, threshold = 0.0015) {
  for (const c of candidates) {
    if (degDist(c, point) < threshold) return c
  }
  return null
}

const TYPE_COLORS = {
  Jeep: '#4A90D9', Bus: '#10B981', 'UV Express': '#F59E0B',
  Tricycle: '#EF4444', Cab: '#EAB308', Train: '#8B5CF6',
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run')
  if (DRY_RUN) console.log('🔍 DRY RUN — no DB writes\n')

  // 1. Fetch all routes from Firebase RTDB
  console.log('Fetching routes from Firebase RTDB...')
  const res = await fetch(`${RTDB_URL}/routes.json`)
  const rawRoutes = await res.json()
  const routes = Object.values(rawRoutes)
  console.log(`Got ${routes.length} routes`)

  // 2. Connect to DB
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to DB')

  // 3. Existing terminals
  const existingRes = await client.query('SELECT id, lat, lng, name, schedule FROM terminals')
  const existingTerminals = existingRes.rows.map(r => ({
    id: r.id, lat: parseFloat(r.lat), lng: parseFloat(r.lng),
    name: r.name, hasSchedule: !!r.schedule,
  }))
  console.log(`${existingTerminals.length} terminals already in DB`)

  // 4. Existing connections
  const existingConns = await client.query('SELECT from_id, to_id FROM connections')
  const existingConnSet = new Set(existingConns.rows.map(r => `${r.from_id}-${r.to_id}`))
  console.log(`${existingConns.rows.length} connections already in DB`)

  // 5. Import user
  const adminRes = await client.query(`SELECT id FROM users WHERE username='privanindivan' LIMIT 1`)
  if (!adminRes.rows[0]) throw new Error('User privanindivan not found')
  const userId = adminRes.rows[0].id
  console.log(`Using user id ${userId}\n`)

  const allTerminals = [...existingTerminals]
  let terminalsCreated = 0, connectionsCreated = 0, schedulesSet = 0, skipped = 0

  // 6. Process each route
  for (const route of routes) {
    const { name, puvType, start, end, path, fare, duration, schedule: schedStr } = route
    if (!start?.lat || !end?.lat || !path?.length) { skipped++; continue }

    const type    = detectType(puvType, name)
    const durSecs = parseDuration(duration)
    const fareNum = fare ? parseFloat(fare) : null
    const geometry = path.map(p => [p.lat, p.lng])
    const schedObj = parseSchedule(schedStr)

    // ── Start terminal ──
    let fromTerminal = findNearby(allTerminals, start)
    if (!fromTerminal) {
      if (!DRY_RUN) {
        const ins = await client.query(
          `INSERT INTO terminals (name, lat, lng, type, details, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, lat, lng, name`,
          [start.name?.slice(0, 200) || 'Unnamed', start.lat, start.lng, type,
           `Imported from puv-routes-ph: ${name}`, userId]
        )
        fromTerminal = { id: ins.rows[0].id, lat: start.lat, lng: start.lng, name: start.name, hasSchedule: false }
      } else {
        fromTerminal = { id: `dry-${Math.random()}`, lat: start.lat, lng: start.lng, name: start.name, hasSchedule: false }
      }
      allTerminals.push(fromTerminal)
      terminalsCreated++
      console.log(`  + Terminal: ${start.name}`)
    }

    // ── End terminal ──
    let toTerminal = findNearby(allTerminals, end)
    if (!toTerminal) {
      if (!DRY_RUN) {
        const ins = await client.query(
          `INSERT INTO terminals (name, lat, lng, type, details, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, lat, lng, name`,
          [end.name?.slice(0, 200) || 'Unnamed', end.lat, end.lng, type,
           `Imported from puv-routes-ph: ${name}`, userId]
        )
        toTerminal = { id: ins.rows[0].id, lat: end.lat, lng: end.lng, name: end.name, hasSchedule: false }
      } else {
        toTerminal = { id: `dry-${Math.random()}`, lat: end.lat, lng: end.lng, name: end.name, hasSchedule: false }
      }
      allTerminals.push(toTerminal)
      terminalsCreated++
      console.log(`  + Terminal: ${end.name}`)
    }

    // ── Assign schedule to best pin only (skip if already has one) ──
    if (schedObj) {
      const primary = pickPrimaryTerminal(fromTerminal, toTerminal)
      if (!primary.hasSchedule) {
        if (!DRY_RUN) await client.query(
          `UPDATE terminals SET schedule=$1 WHERE id=$2`,
          [JSON.stringify(schedObj), primary.id]
        )
        primary.hasSchedule = true
        schedulesSet++
        console.log(`  ⏰ Schedule ${schedObj.start}–${schedObj.end} → ${primary.name}`)
      }
    }

    // ── Connection ──
    if (fromTerminal.id === toTerminal.id) {
      console.log(`  ✗ Skip self-ref: ${name} (start/end too close)`)
      skipped++
      continue
    }
    const connKey    = `${fromTerminal.id}-${toTerminal.id}`
    const connKeyRev = `${toTerminal.id}-${fromTerminal.id}`
    if (existingConnSet.has(connKey) || existingConnSet.has(connKeyRev)) {
      console.log(`  ~ Skip existing: ${name}`)
      skipped++
      continue
    }

    if (!DRY_RUN) await client.query(
      `INSERT INTO connections (from_id, to_id, geometry, color, fare, duration_secs, waypoints, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [fromTerminal.id, toTerminal.id, JSON.stringify(geometry),
       TYPE_COLORS[type] || '#4A90D9', fareNum, durSecs, JSON.stringify([]), userId]
    )
    existingConnSet.add(connKey)
    connectionsCreated++
    console.log(`  → ${name} (${type})  fare:${fareNum ?? '-'}  dur:${durSecs ?? '-'}s`)
  }

  await client.end()

  console.log('\n=== IMPORT COMPLETE ===')
  console.log(`Terminals created  : ${terminalsCreated}`)
  console.log(`Connections created: ${connectionsCreated}`)
  console.log(`Schedules assigned : ${schedulesSet}`)
  console.log(`Skipped            : ${skipped}`)
}

main().catch(e => { console.error(e); process.exit(1) })
