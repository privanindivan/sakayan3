/**
 * OSM → Sakayan Connection Importer
 * Queries Overpass API for all PH transit routes (nationwide),
 * matches stops to existing terminals by GPS proximity,
 * and bulk-inserts connections into the DB.
 */

const https = require('https')
const http = require('http')
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PROGRESS_FILE = path.join(__dirname, 'osm_import_progress.json')
const LOG_FILE = path.join(__dirname, 'osm_import.log')
const TRACKER_PORT = 7790
const MATCH_RADIUS_M = 500   // max meters to match OSM stop → terminal
const MIN_CONN_DIST_M = 1000 // skip connections where matched terminals are < 1km apart (useless micro-routes)
const TEST_ONE = process.argv.includes('--test-one') // import only 1 longest route
const FRESH_MONTHS = 12
const FRESH_DATE = new Date(Date.now() - FRESH_MONTHS * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

const TYPE_COLOR = {
  bus:        '#3B82F6',
  share_taxi: '#F59E0B',
  jeepney:    '#F59E0B',
  train:      '#8B5CF6',
  light_rail: '#8B5CF6',
  subway:     '#6D28D9',
  tram:       '#EC4899',
  ferry:      '#06B6D4',
  monorail:   '#8B5CF6',
}

// Philippines split into 4 bbox chunks [minLat,minLng,maxLat,maxLng]
const REGIONS = [
  { name: 'North Luzon',       bbox: [15.5, 118.0, 21.5, 122.5] },
  { name: 'South Luzon + NCR', bbox: [12.5, 119.5, 15.5, 122.5] },
  { name: 'Visayas',           bbox: [9.0,  121.5, 12.5, 126.5] },
  { name: 'Mindanao',          bbox: [4.5,  118.0,  9.5, 127.0] },
]

const ROUTE_TYPES = 'bus|share_taxi|jeepney|train|light_rail|subway|tram|ferry|monorail'

// ── state ────────────────────────────────────────────────────
let state = {
  phase: 'idle',
  region: '',
  routesTotal: 0,
  routesDone: 0,
  routesSkipped: 0,
  stopsMatched: 0,
  connectionsInserted: 0,
  connectionsDuplicate: 0,
  errors: [],
  log: [],
  done: false,
  testRoute: null,
}

function log(msg) {
  const line = '[' + new Date().toISOString().slice(11,19) + '] ' + msg
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
  state.log.unshift(line)
  if (state.log.length > 200) state.log.length = 200
}

// ── Overpass query ───────────────────────────────────────────
function overpassQuery(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query)
    const opts = {
      hostname: 'overpass-api.de',
      path: '/api/interpreter',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'SakayanApp/1.0 (transit map PH; contact via github)' }
    }
    const req = https.request(opts, res => {
      const chunks = []
      res.on('data', d => chunks.push(d))
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        try { resolve(JSON.parse(raw)) }
        catch(e) { reject(new Error('Parse error: ' + raw.slice(0,300))) }
      })
    })
    req.on('error', reject)
    req.setTimeout(300000, () => { req.destroy(); reject(new Error('Timeout')) })
    req.write(body)
    req.end()
  })
}

// ── geo helpers ──────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function findNearest(terminals, lat, lng) {
  let best = null, bestDist = Infinity
  for (const t of terminals) {
    const d = haversineM(lat, lng, t.lat, t.lng)
    if (d < bestDist) { bestDist = d; best = t }
  }
  return bestDist <= MATCH_RADIUS_M ? { terminal: best, dist: bestDist } : null
}

// ── main import ──────────────────────────────────────────────
async function runImport() {
  log('=== OSM Nationwide Import Starting ===')

  // Load all terminals into memory
  log('Loading terminals from DB...')
  const { rows: terminals } = await pool.query('SELECT id, name, lat, lng, type FROM terminals')
  log(`Loaded ${terminals.length} terminals`)

  // Load existing connections to avoid duplicates
  log('Loading existing connections...')
  const { rows: existingConns } = await pool.query('SELECT from_id, to_id FROM connections')
  // Store both directions so A→B and B→A are treated as the same connection
  const existingSet = new Set()
  for (const c of existingConns) {
    existingSet.add(c.from_id + '|' + c.to_id)
    existingSet.add(c.to_id + '|' + c.from_id)
  }
  log(`Found ${existingConns.length} existing connections`)

  let progress = {}
  if (!TEST_ONE) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) } catch {}
  }

  for (const region of REGIONS) {
    if (!TEST_ONE && progress[region.name] === 'done') {
      log(`Skipping ${region.name} (already done)`)
      continue
    }

    state.region = region.name
    state.phase = 'fetching'
    log(`\n--- Fetching ${region.name} ---`)

    const [minLat, minLng, maxLat, maxLng] = region.bbox
    const query = `[out:json][timeout:280];
relation["type"="route"]["route"~"${ROUTE_TYPES}"](${minLat},${minLng},${maxLat},${maxLng});
out body meta;`

    let data
    let attempt = 0
    while (true) {
      try {
        attempt++
        log(`  Querying Overpass (attempt ${attempt})...`)
        data = await overpassQuery(query)
        log(`  Got ${data.elements.length} relations`)
        break
      } catch(e) {
        log(`  Error: ${e.message}. Waiting 60s...`)
        if (attempt >= 3) { log('  Giving up on ' + region.name); break }
        await new Promise(r => setTimeout(r, 60000))
      }
    }
    if (!data) continue

    // Get all route relations
    const relations = data.elements.filter(el => el.type === 'relation')
    log(`  ${relations.length} route relations found`)

    // Collect all unique stop node IDs from first+last stop of each relation
    const stopNodeIds = new Set()
    for (const rel of relations) {
      const stopMembers = (rel.members || []).filter(m =>
        m.type === 'node' && (m.role === 'stop' || m.role === 'stop_entry_only' || m.role === 'stop_exit_only' || m.role === 'platform' || m.role === '')
      )
      if (stopMembers.length >= 2) {
        stopNodeIds.add(stopMembers[0].ref)
        stopNodeIds.add(stopMembers[stopMembers.length - 1].ref)
      }
    }

    // Fetch node coords in batches of 200 IDs (smaller = more reliable)
    const nodeMap = {}
    const nodeIdList = [...stopNodeIds]
    for (let i = 0; i < nodeIdList.length; i += 200) {
      const batch = nodeIdList.slice(i, i + 200)
      const nodeQuery = `[out:json][timeout:60];node(id:${batch.join(',')});out body;`
      let fetched = false
      for (let attempt = 1; attempt <= 3 && !fetched; attempt++) {
        try {
          const nodeData = await overpassQuery(nodeQuery)
          for (const el of nodeData.elements) {
            if (el.type === 'node') nodeMap[el.id] = { lat: el.lat, lng: el.lon }
          }
          fetched = true
        } catch(e) {
          if (attempt < 3) await new Promise(r => setTimeout(r, 5000))
          else log(`  Warning: node fetch batch ${i}-${i+200} failed after 3 attempts`)
        }
      }
    }
    log(`  Fetched coords for ${Object.keys(nodeMap).length}/${nodeIdList.length} stop nodes`)

    state.routesTotal += relations.length
    state.phase = 'processing'

    const insertBatch = []

    for (const rel of relations) {
      state.routesDone++

      if (rel.timestamp) {
        const ageMonths = (Date.now() - new Date(rel.timestamp)) / (1000 * 60 * 60 * 24 * 30)
        if (ageMonths > FRESH_MONTHS) { state.routesSkipped++; continue }
      }
      const tags = rel.tags || {}
      const routeType = tags.route || 'bus'
      const routeName = tags.name || tags.ref || '(unnamed)'
      const color = TYPE_COLOR[routeType] || '#4A90D9'

      // Extract ordered stop nodes from members — only use FIRST and LAST
      const stopMembers = (rel.members || []).filter(m =>
        m.type === 'node' && (m.role === 'stop' || m.role === 'stop_entry_only' || m.role === 'stop_exit_only' || m.role === 'platform' || m.role === '')
      )

      if (stopMembers.length < 2) continue

      // Only take first and last stop node
      const endpoints = [stopMembers[0], stopMembers[stopMembers.length - 1]]
      const matched = []
      for (const member of endpoints) {
        const node = nodeMap[member.ref]
        if (!node) continue
        const hit = findNearest(terminals, node.lat, node.lng)
        if (hit) {
          matched.push({ terminalId: hit.terminal.id, dist: hit.dist })
          state.stopsMatched++
        }
      }

      if (matched.length < 2) continue
      if (matched[0].terminalId === matched[1].terminalId) continue

      // One connection: first stop → last stop
      const fromId = matched[0].terminalId
      const toId = matched[1].terminalId
      const key = fromId + '|' + toId
      if (existingSet.has(key)) { state.connectionsDuplicate++; continue }
      existingSet.add(key)
      existingSet.add(toId + '|' + fromId) // block reverse direction too

      const fromT2 = terminals.find(t => t.id === fromId)
      const toT2   = terminals.find(t => t.id === toId)
      const distM  = fromT2 && toT2 ? haversineM(fromT2.lat, fromT2.lng, toT2.lat, toT2.lng) : 0
      if (distM < MIN_CONN_DIST_M) { state.routesSkipped++; continue } // too close — micro-route or bad match
      const distKm = distM / 1000
      insertBatch.push({ fromId, toId, color, routeName, routeType, distKm, stopCount: stopMembers.length })
    }

    // If test mode — pick only the single route with most stops
    let toInsert = insertBatch
    if (TEST_ONE && insertBatch.length > 0) {
      toInsert = [insertBatch.sort((a, b) => (b.stopCount || 0) - (a.stopCount || 0))[0]]
      const pick = toInsert[0]
      const fT = terminals.find(t => t.id === pick.fromId)
      const tT = terminals.find(t => t.id === pick.toId)
      log(`  TEST MODE: picked route with most stops "${pick.routeName}" (${pick.stopCount} stops, ${pick.distKm.toFixed(1)}km)`)
      log(`  From: "${fT?.name}" → To: "${tT?.name}"`)
      state.testRoute = { name: pick.routeName, from: fT?.name, to: tT?.name, distKm: pick.distKm.toFixed(1), stops: pick.stopCount }
    }

    // Insert one by one — fetch OSRM geometry for each so it renders like manual connections
    log(`  Inserting ${toInsert.length} connections for ${region.name} (with OSRM geometry)...`)
    let inserted = 0
    for (const c of toInsert) {
      const fromT = terminals.find(t => t.id === c.fromId)
      const toT   = terminals.find(t => t.id === c.toId)
      let geometry = null
      if (fromT && toT) {
        try {
          const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${fromT.lng},${fromT.lat};${toT.lng},${toT.lat}?overview=full&geometries=geojson`
          const osrmRes = await new Promise((resolve, reject) => {
            https.get(osrmUrl, res => {
              const chunks = []
              res.on('data', d => chunks.push(d))
              res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch(e) { reject(e) } })
            }).on('error', reject).setTimeout(8000, function() { this.destroy() })
          })
          const coords = osrmRes.routes?.[0]?.geometry?.coordinates
          if (coords) geometry = JSON.stringify({ type: 'LineString', coordinates: coords })
        } catch { /* fall through — store without geometry */ }
        await new Promise(r => setTimeout(r, 120)) // ~8 req/s, stay under OSRM rate limit
      }
      try {
        await pool.query(
          `INSERT INTO connections (from_id,to_id,color,type,geometry,waypoints,budget_level) VALUES ($1,$2,$3,$4,$5::jsonb,'[]','medium') ON CONFLICT DO NOTHING`,
          [c.fromId, c.toId, c.color, c.routeType, geometry]
        )
        inserted++
        state.connectionsInserted++
        if (inserted % 10 === 0) log(`  ${region.name}: ${inserted}/${insertBatch.length} inserted`)
      } catch(e) {
        log(`  Insert error: ${e.message}`)
      }
    }
    log(`  Inserted ${inserted} connections for ${region.name}`)

    if (!TEST_ONE) {
      progress[region.name] = 'done'
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
    }
    log(`  ${region.name} complete`)

    if (TEST_ONE) {
      log('  TEST MODE: stopping after 1 route. Check your site to verify the connection.')
      break
    }
  }

  state.phase = 'done'
  state.done = true
  log('\n=== Import Complete ===')
  log(`Routes processed: ${state.routesDone}`)
  log(`Routes skipped (old): ${state.routesSkipped}`)
  log(`Stops matched: ${state.stopsMatched}`)
  log(`Connections inserted: ${state.connectionsInserted}`)
  log(`Duplicates skipped: ${state.connectionsDuplicate}`)
  pool.end()
}

// ── tracker HTTP server ──────────────────────────────────────
const HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>OSM Import Tracker</title>
<style>
*{box-sizing:border-box;margin:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:20px;margin-bottom:4px}
.sub{color:#64748b;font-size:13px;margin-bottom:20px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
.card{background:#1e293b;border-radius:10px;padding:14px 18px;min-width:130px}
.val{font-size:26px;font-weight:700}.lbl{font-size:11px;color:#64748b;margin-top:2px}
.bar-wrap{background:#1e293b;border-radius:6px;height:10px;margin-bottom:16px}
.bar{height:100%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:6px;transition:width .5s}
.status{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px}
.status.fetching{background:#1e3a5f;color:#93c5fd}.status.processing{background:#166534;color:#86efac}
.status.done{background:#134e4a;color:#5eead4}.status.idle{background:#374151;color:#d1d5db}
.log{background:#1e293b;border-radius:10px;padding:14px;font-size:12px;font-family:monospace;max-height:400px;overflow-y:auto;color:#94a3b8}
.log div{border-bottom:1px solid #0f172a;padding:3px 0}
</style></head><body>
<h1>OSM Nationwide Import</h1>
<p class="sub">Fetching PH transit routes from OpenStreetMap and matching to your terminals</p>
<div id="app">Loading...</div>
<script>
async function refresh(){
  const d=await(await fetch('/api/state')).json()
  const pct=d.routesTotal>0?Math.round(d.routesDone/d.routesTotal*100):0
  document.getElementById('app').innerHTML=\`
    <div class="status \${d.phase}">\${d.phase.toUpperCase()}\${d.region?' — '+d.region:''}</div>
    <div class="bar-wrap"><div class="bar" style="width:\${pct}%"></div></div>
    <div class="cards">
      <div class="card"><div class="val">\${d.routesDone}</div><div class="lbl">Routes processed</div></div>
      <div class="card"><div class="val">\${d.routesSkipped}</div><div class="lbl">Skipped (old)</div></div>
      <div class="card"><div class="val">\${d.stopsMatched}</div><div class="lbl">Stops matched</div></div>
      <div class="card"><div class="val">\${d.connectionsInserted}</div><div class="lbl">Connections added</div></div>
      <div class="card"><div class="val">\${d.connectionsDuplicate}</div><div class="lbl">Duplicates skipped</div></div>
    </div>
    \${d.testRoute ? \`<div class="card" style="width:100%;background:#1e3a5f">
      <div class="lbl">TEST ROUTE PICKED</div>
      <div style="font-size:15px;font-weight:700;margin-top:4px">\${d.testRoute.name} (\${d.testRoute.distKm}km)</div>
      <div style="font-size:13px;margin-top:4px;color:#93c5fd">From: <b>\${d.testRoute.from}</b> → To: <b>\${d.testRoute.to}</b></div>
      <div style="font-size:12px;margin-top:6px;color:#64748b">Search these terminal names on your site to find the connection</div>
    </div>\` : ''}
    <div class="log">\${d.log.map(l=>'<div>'+l+'</div>').join('')}</div>
  \`
}
refresh()
let _t=setInterval(()=>{ fetch('/api/state').then(r=>r.json()).then(d=>{ if(d.done){clearInterval(_t)} else{refresh()} }) },4000)
</script></body></html>`

const server = http.createServer((req, res) => {
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state))
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
})

server.listen(TRACKER_PORT, () => {
  log('Tracker at http://localhost:' + TRACKER_PORT)
  require('child_process').exec('start http://localhost:' + TRACKER_PORT)
  runImport().catch(e => { log('FATAL: ' + e.message); state.phase = 'error' })
})
