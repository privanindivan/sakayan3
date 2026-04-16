/**
 * import_commutedavao.mjs
 *
 * Imports 52 jeepney routes from commutedavao.com into Sakayan.
 *
 * Each route is a circular loop: coords[0] == coords[last] ≈ the barangay terminal.
 * Strategy:
 *   1. Match route name → existing Sakayan terminal (by name similarity + proximity)
 *   2. Find the "turnaround" city-center stop = coord at the geometric midpoint of the loop
 *   3. Find nearest existing Sakayan terminal within 400m of that midpoint
 *      → if none, CREATE a new terminal there (named "<RouteName> City Stop")
 *   4. POST two connections: outbound (barangay→city) and inbound (city→barangay)
 *      using the actual route geometry for each half
 *
 * Run: node scripts/import_commutedavao.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import pg from 'pg'
const { Client } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:3000'

// ── Auth (generate token directly from DB + JWT_SECRET) ───────────
const EMAIL      = 'privanindivan@gmail.com'
const JWT_SECRET = 'cdab0cbc52a00a4b5e23e2c79f95439b08dfe8615f3c25fe601a3d3f79bcce1b'
const DB_URL     = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'

async function api(path, opts = {}, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(BASE + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    if (res.status === 429) {
      const waitMs = 65_000 // wait 65s to clear the 1-minute window
      console.log(`    ⏳ Rate limited — waiting ${waitMs/1000}s (attempt ${attempt+1}/${retries+1})…`)
      await new Promise(r => setTimeout(r, waitMs))
      continue
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${opts.method || 'GET'} ${path} → ${res.status}: ${txt.slice(0, 200)}`)
    }
    return res.json()
  }
  throw new Error(`${opts.method || 'GET'} ${path} → still 429 after ${retries} retries`)
}

// ── Helpers ───────────────────────────────────────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function nearest(lat, lng, terminals, maxKm = 0.4) {
  let best = null, bestD = Infinity
  for (const t of terminals) {
    const d = haversineKm(lat, lng, t.lat, t.lng)
    if (d < bestD) { bestD = d; best = t }
  }
  return bestD <= maxKm ? { terminal: best, distKm: bestD } : null
}

function nameSimilar(a, b) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = norm(a), nb = norm(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  // Auth: query DB for user, generate JWT directly
  console.log('Authenticating…')
  const dbClient = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await dbClient.connect()
  const { rows } = await dbClient.query('SELECT id, email, role, username FROM users WHERE email = $1', [EMAIL])
  await dbClient.end()
  if (!rows.length) { console.error('User not found:', EMAIL); process.exit(1) }
  const user = rows[0]
  const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  const authHeader = { Authorization: `Bearer ${token}` }
  console.log('Authenticated as', user.username)

  // Load existing terminals
  console.log('Fetching existing terminals…')
  const { terminals } = await api('/api/terminals')
  const davaoTerminals = terminals.filter(t => t.lat > 6.8 && t.lat < 7.5 && t.lng > 125.2 && t.lng < 126)
  console.log(`  ${davaoTerminals.length} Davao terminals loaded`)

  // Load route data
  const routes = JSON.parse(fs.readFileSync(path.join(__dirname, 'commutedavao_routes.json'), 'utf8'))
  console.log(`\n${routes.length} commutedavao routes to import\n`)

  const progress = { created_terminals: [], created_connections: [], skipped: [], errors: [] }
  const progressFile = path.join(__dirname, 'commutedavao_import_progress.json')

  // Load previous progress if any
  let done = new Set()
  if (fs.existsSync(progressFile)) {
    const prev = JSON.parse(fs.readFileSync(progressFile, 'utf8'))
    done = new Set(prev.created_connections.map(c => c.routeName))
    progress.created_terminals = prev.created_terminals || []
    progress.created_connections = prev.created_connections || []
    progress.skipped = prev.skipped || []
    progress.errors = prev.errors || []
    console.log(`Resuming — ${done.size} routes already done\n`)
  }

  const allTerminals = [...davaoTerminals] // will grow as we add new ones

  for (const route of routes) {
    if (done.has(route.name)) { console.log(`  ⏭ ${route.name} (already done)`); continue }

    console.log(`\n── ${route.name} (${route.coords.length} pts) ──`)

    // coords are [lng, lat] from commutedavao
    const coords = route.coords  // [[lng,lat], ...]

    // 1. Match "from" terminal (barangay end) by name + proximity
    const startLat = coords[0][1], startLng = coords[0][0]
    let fromTerminal = null

    // Try name match first
    for (const t of allTerminals) {
      if (nameSimilar(t.name, route.name)) { fromTerminal = t; break }
    }
    // Fallback: nearest within 300m
    if (!fromTerminal) {
      const hit = nearest(startLat, startLng, allTerminals, 0.3)
      if (hit) fromTerminal = hit.terminal
    }
    // Still not found → create it
    if (!fromTerminal) {
      console.log(`    Creating "from" terminal: ${route.name}`)
      try {
        const res = await api('/api/terminals', {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ name: route.name, lat: startLat, lng: startLng, type: 'Jeep' }),
        })
        fromTerminal = res.terminal
        allTerminals.push(fromTerminal)
        progress.created_terminals.push({ name: route.name, id: fromTerminal.id })
        console.log(`    ✓ Created from-terminal: ${fromTerminal.id}`)
      } catch(e) {
        console.error(`    ✗ Failed to create from-terminal: ${e.message}`)
        progress.errors.push({ route: route.name, step: 'from-terminal', error: e.message })
        continue
      }
    } else {
      console.log(`    From: ${fromTerminal.name} (${fromTerminal.id})`)
    }

    // 2. Find turnaround = coordinate at geometric midpoint of the loop
    const midIdx = Math.floor(coords.length / 2)
    const midLat = coords[midIdx][1], midLng = coords[midIdx][0]

    let toTerminal = null
    const hit = nearest(midLat, midLng, allTerminals, 0.4)
    if (hit) {
      toTerminal = hit.terminal
      console.log(`    To:   ${toTerminal.name} (${toTerminal.id}) — ${(hit.distKm*1000).toFixed(0)}m away`)
    } else {
      // Create city-center stop
      const cityName = route.name + ' City Stop'
      console.log(`    Creating city-center terminal: ${cityName} @ ${midLat.toFixed(5)},${midLng.toFixed(5)}`)
      try {
        const res = await api('/api/terminals', {
          method: 'POST',
          headers: authHeader,
          body: JSON.stringify({ name: cityName, lat: midLat, lng: midLng, type: 'Jeep' }),
        })
        toTerminal = res.terminal
        allTerminals.push(toTerminal)
        progress.created_terminals.push({ name: cityName, id: toTerminal.id })
        console.log(`    ✓ Created to-terminal: ${toTerminal.id}`)
      } catch(e) {
        console.error(`    ✗ Failed to create to-terminal: ${e.message}`)
        progress.errors.push({ route: route.name, step: 'to-terminal', error: e.message })
        continue
      }
    }

    if (fromTerminal.id === toTerminal.id) {
      console.log(`    ⚠ from == to terminal, skipping`)
      progress.skipped.push({ route: route.name, reason: 'from==to' })
      done.add(route.name)
      continue
    }

    // 3. Build geometries: [lat,lng] pairs for Sakayan
    const outboundGeom = coords.slice(0, midIdx + 1).map(c => [c[1], c[0]])
    const inboundGeom  = coords.slice(midIdx).map(c => [c[1], c[0]])

    // 4. Create outbound connection (barangay → city)
    try {
      const res = await api('/api/connections', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          fromId: fromTerminal.id,
          toId:   toTerminal.id,
          geometry: outboundGeom,
          color: route.color,
          fare: null,
          duration_secs: null,
          waypoints: [],
        }),
      })
      console.log(`    ✓ Outbound connection: ${res.connection?.id}`)
      progress.created_connections.push({ routeName: route.name, dir: 'out', id: res.connection?.id })
    } catch(e) {
      console.error(`    ✗ Outbound failed: ${e.message}`)
      progress.errors.push({ route: route.name, step: 'outbound', error: e.message })
    }

    // 5. Create inbound connection (city → barangay)
    try {
      const res = await api('/api/connections', {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          fromId: toTerminal.id,
          toId:   fromTerminal.id,
          geometry: inboundGeom,
          color: route.color,
          fare: null,
          duration_secs: null,
          waypoints: [],
        }),
      })
      console.log(`    ✓ Inbound connection:  ${res.connection?.id}`)
      progress.created_connections.push({ routeName: route.name, dir: 'in', id: res.connection?.id })
    } catch(e) {
      console.error(`    ✗ Inbound failed: ${e.message}`)
      progress.errors.push({ route: route.name, step: 'inbound', error: e.message })
    }

    done.add(route.name)
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2))
    await new Promise(r => setTimeout(r, 2500)) // polite delay (stay under 30 writes/min)
  }

  fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2))
  console.log('\n══════════════════════════════')
  console.log(`✓ Terminals created:   ${progress.created_terminals.length}`)
  console.log(`✓ Connections created: ${progress.created_connections.length}`)
  console.log(`⚠ Skipped:            ${progress.skipped.length}`)
  console.log(`✗ Errors:             ${progress.errors.length}`)
  if (progress.errors.length) console.log('Errors:', JSON.stringify(progress.errors, null, 2))
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
