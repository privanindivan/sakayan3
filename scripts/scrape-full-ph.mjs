/**
 * Full Philippines terminal scraper — comprehensive edition
 * Sources: OSM Overpass API (stations/terminals by region) + Google Maps (Playwright)
 * Deduplicates against current DB before every insert
 * Run AFTER scrape-more.mjs finishes.
 */

import { chromium } from 'playwright'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { neon } from '@neondatabase/serverless'

const SCRIPT_DIR  = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE  = path.join(SCRIPT_DIR, 'scrape-full-state.json')
const DB_URL = process.env.NEON_DATABASE_URL
const VALID_TYPES = new Set(['Jeep', 'Bus', 'UV', 'Train', 'Ferry', 'Tricycle'])

// ── OSM regional bounding boxes covering all Philippines ─────────────────────
// Format: { name, bbox: 'south,west,north,east' }
const OSM_REGIONS = [
  // Luzon
  { name: 'Ilocos Norte/Sur + Apayao', bbox: '17.3,119.8,18.7,121.0' },
  { name: 'Cagayan + Isabela', bbox: '16.5,121.0,18.7,122.5' },
  { name: 'Mountain Province + Ifugao + Benguet', bbox: '16.3,120.4,17.3,121.3' },
  { name: 'La Union + Pangasinan', bbox: '15.6,119.7,16.7,120.8' },
  { name: 'Baguio + Benguet lowlands', bbox: '16.2,120.4,16.7,120.8' },
  { name: 'Tarlac + Nueva Ecija + Aurora', bbox: '15.0,120.6,16.3,122.0' },
  { name: 'Pampanga + Zambales + Bataan', bbox: '14.6,119.9,15.5,120.9' },
  { name: 'Bulacan', bbox: '14.7,120.7,15.2,121.2' },
  { name: 'Metro Manila NCR', bbox: '14.35,120.88,14.82,121.15' },
  { name: 'Rizal', bbox: '14.35,121.1,14.9,121.6' },
  { name: 'Cavite', bbox: '14.0,120.75,14.45,121.0' },
  { name: 'Laguna', bbox: '13.9,121.0,14.45,121.7' },
  { name: 'Batangas', bbox: '13.5,120.7,14.15,121.3' },
  { name: 'Quezon Province + Polillo', bbox: '13.5,121.4,14.8,122.4' },
  { name: 'Marinduque + Romblon', bbox: '12.5,121.8,13.6,122.7' },
  { name: 'Occidental Mindoro', bbox: '12.2,120.5,13.5,121.1' },
  { name: 'Oriental Mindoro', bbox: '12.2,121.0,13.5,121.7' },
  { name: 'Palawan', bbox: '8.3,117.0,12.5,119.5' },
  { name: 'Camarines Norte + Sur', bbox: '13.5,122.5,14.3,124.0' },
  { name: 'Albay + Sorsogon', bbox: '12.5,123.3,13.5,124.2' },
  { name: 'Catanduanes', bbox: '13.5,124.1,14.0,124.5' },
  { name: 'Masbate', bbox: '11.8,123.4,12.5,124.0' },

  // Visayas
  { name: 'Aklan + Capiz + Antique', bbox: '11.0,121.8,12.0,122.8' },
  { name: 'Iloilo', bbox: '10.4,122.2,11.2,122.8' },
  { name: 'Guimaras', bbox: '10.5,122.5,10.8,122.8' },
  { name: 'Negros Occidental', bbox: '9.8,122.3,11.1,123.3' },
  { name: 'Negros Oriental', bbox: '9.0,122.8,10.7,123.6' },
  { name: 'Cebu + Metro Cebu', bbox: '9.8,123.3,11.3,124.1' },
  { name: 'Bohol', bbox: '9.5,123.7,10.3,124.6' },
  { name: 'Siquijor', bbox: '9.1,123.4,9.3,123.6' },
  { name: 'Leyte', bbox: '10.1,124.3,11.5,125.1' },
  { name: 'Biliran', bbox: '11.4,124.2,11.8,124.6' },
  { name: 'Eastern Samar', bbox: '11.0,125.1,12.1,125.7' },
  { name: 'Western Samar + Northern Samar', bbox: '11.2,124.0,12.6,125.1' },

  // Mindanao
  { name: 'Zamboanga del Norte + del Sur', bbox: '7.0,121.8,8.5,123.5' },
  { name: 'Zamboanga City area', bbox: '6.7,121.8,7.3,122.4' },
  { name: 'Misamis Occidental + Oriental', bbox: '7.8,123.2,9.0,124.8' },
  { name: 'Cagayan de Oro + Iligan', bbox: '8.0,124.0,8.7,124.8' },
  { name: 'Lanao del Norte + Sur', bbox: '7.5,123.8,8.5,124.5' },
  { name: 'Bukidnon', bbox: '7.5,124.5,8.5,125.5' },
  { name: 'Davao del Norte + City', bbox: '7.0,125.3,7.7,126.0' },
  { name: 'Davao del Sur + Sarangani', bbox: '5.9,124.8,6.8,125.5' },
  { name: 'Davao Oriental', bbox: '6.5,126.0,7.8,126.7' },
  { name: 'North Cotabato + South Cotabato', bbox: '6.5,124.5,7.5,125.5' },
  { name: 'Sultan Kudarat', bbox: '6.2,124.0,7.2,124.9' },
  { name: 'General Santos City', bbox: '6.0,125.0,6.3,125.3' },
  { name: 'Agusan del Norte + Sur', bbox: '8.0,125.5,9.0,126.3' },
  { name: 'Surigao del Norte', bbox: '9.4,125.3,10.0,126.0' },
  { name: 'Surigao del Sur', bbox: '7.9,126.0,9.0,126.7' },
  { name: 'Dinagat Islands', bbox: '9.9,125.4,10.4,126.0' },
  { name: 'Maguindanao + Cotabato City', bbox: '6.8,124.0,7.4,124.6' },
  { name: 'Basilan + Sulu + Tawi-Tawi', bbox: '4.5,119.0,6.7,122.5' },
]

// OSM node types to query — only named transport nodes (not unnamed bus stops)
const OSM_TRANSPORT_FILTER = `
  node["amenity"="bus_station"](BBOX);
  node["amenity"="ferry_terminal"](BBOX);
  node["amenity"="seaport"](BBOX);
  node["railway"="station"](BBOX);
  node["railway"="halt"](BBOX);
  node["public_transport"="station"]["name"](BBOX);
  node["public_transport"="stop_area"]["name"](BBOX);
  node["highway"="bus_stop"]["name"]["name"~"[Tt]erminal|[Ss]tation|[Hh]ub|[Dd]epot"](BBOX);
`

// ── Google Maps queries — systematic by province/city ────────────────────────
const GMAPS_QUERIES = [
  // Luzon - Ilocos
  'jeepney terminal Vigan City Ilocos Sur Philippines',
  'jeepney terminal Candon City Ilocos Sur Philippines',
  'bus terminal San Fernando La Union Philippines',
  'jeepney terminal Narvacan Ilocos Sur Philippines',
  'jeepney terminal Laoag City Ilocos Norte Philippines',
  'bus terminal Bangui Ilocos Norte Philippines',
  // Luzon - Cagayan Valley
  'bus terminal Santiago City Isabela Philippines',
  'jeepney terminal Ilagan Isabela Philippines',
  'bus terminal Cauayan City Isabela Philippines',
  // Luzon - Central Luzon
  'bus terminal Clark Pampanga Philippines',
  'jeepney terminal Cabanatuan Nueva Ecija Philippines',
  'jeepney terminal Palayan Nueva Ecija Philippines',
  'bus terminal San Jose Nueva Ecija Philippines',
  'jeepney terminal Guimba Nueva Ecija Philippines',
  'jeepney terminal Tarlac City Philippines',
  'bus terminal Olongapo Zambales Philippines',
  'jeepney terminal Subic Zambales Philippines',
  'bus terminal Balanga Bataan Philippines',
  // Luzon - Calabarzon extras
  'jeepney terminal Lucena City Quezon Philippines',
  'bus terminal Gumaca Quezon Philippines',
  'bus terminal Infanta Quezon Philippines',
  'jeepney terminal Tayabas Quezon Philippines',
  'jeepney terminal Candelaria Quezon Philippines',
  'jeepney terminal Tanauan Batangas Philippines',
  'jeepney terminal Lipa City Batangas Philippines',
  'jeepney terminal Sto. Tomas Batangas Philippines',
  'bus terminal Batangas City Philippines',
  'jeepney terminal San Pablo Laguna Philippines',
  'jeepney terminal Sta. Cruz Laguna Philippines',
  'jeepney terminal Pagsanjan Laguna Philippines',
  'jeepney terminal Cabuyao Laguna Philippines',
  // Luzon - Mimaropa
  'bus terminal Calapan Oriental Mindoro Philippines',
  'jeepney terminal Pinamalayan Oriental Mindoro Philippines',
  'bus terminal Mamburao Occidental Mindoro Philippines',
  'jeepney terminal Puerto Princesa Palawan Philippines',
  'bus terminal El Nido Palawan Philippines',
  'bus terminal San Jose Occidental Mindoro Philippines',
  'jeepney terminal Romblon Philippines',
  // Luzon - Bicol
  'bus terminal Legazpi City Albay Philippines',
  'jeepney terminal Tabaco Albay Philippines',
  'jeepney terminal Ligao Albay Philippines',
  'bus terminal Naga City Camarines Sur Philippines',
  'jeepney terminal Pili Camarines Sur Philippines',
  'bus terminal Iriga City Camarines Sur Philippines',
  'bus terminal Sorsogon City Philippines',
  'jeepney terminal Bulan Sorsogon Philippines',
  // Visayas
  'bus terminal Kalibo Aklan Philippines',
  'jeepney terminal Caticlan Aklan Philippines',
  'bus terminal Roxas City Capiz Philippines',
  'bus terminal San Jose Antique Philippines',
  'jeepney terminal Pototan Iloilo Philippines',
  'bus terminal Passi City Iloilo Philippines',
  'bus terminal Victorias Negros Occidental Philippines',
  'jeepney terminal Cadiz City Negros Occidental Philippines',
  'bus terminal Silay City Negros Occidental Philippines',
  'bus terminal San Carlos City Negros Occidental Philippines',
  'bus terminal Hinigaran Negros Occidental Philippines',
  'bus terminal Kabankalan City Negros Occidental Philippines',
  'bus terminal Himamaylan Negros Occidental Philippines',
  'bus terminal Escalante Negros Occidental Philippines',
  'bus terminal Talisay Negros Occidental Philippines',
  'jeepney terminal Naga Cebu Philippines',
  'jeepney terminal Toledo City Cebu Philippines',
  'jeepney terminal Danao City Cebu Philippines',
  'jeepney terminal Bogo City Cebu Philippines',
  'bus terminal Tagbilaran City Bohol Philippines',
  'jeepney terminal Panglao Bohol Philippines',
  'bus terminal Carmen Bohol Philippines',
  'bus terminal Ormoc City Leyte Philippines',
  'jeepney terminal Palo Leyte Philippines',
  'bus terminal Baybay City Leyte Philippines',
  'bus terminal Catbalogan Samar Philippines',
  'bus terminal Calbayog City Samar Philippines',
  'bus terminal Borongan Eastern Samar Philippines',
  // Mindanao
  'bus terminal Dipolog City Zamboanga del Norte Philippines',
  'jeepney terminal Dapitan City Philippines',
  'bus terminal Pagadian City Zamboanga del Sur Philippines',
  'bus terminal Ipil Zamboanga Sibugay Philippines',
  'bus terminal Marawi City Lanao del Sur Philippines',
  'bus terminal Ozamiz City Misamis Occidental Philippines',
  'bus terminal Oroquieta City Misamis Occidental Philippines',
  'bus terminal Gingoog City Misamis Oriental Philippines',
  'bus terminal Malaybalay Bukidnon Philippines',
  'bus terminal Valencia City Bukidnon Philippines',
  'bus terminal Tagum City Davao del Norte Philippines',
  'bus terminal Digos City Davao del Sur Philippines',
  'bus terminal Mati City Davao Oriental Philippines',
  'bus terminal Kidapawan City Cotabato Philippines',
  'bus terminal Tacurong Sultan Kudarat Philippines',
  'bus terminal Koronadal South Cotabato Philippines',
  'bus terminal Surallah South Cotabato Philippines',
  'bus terminal Butuan City Agusan del Norte Philippines',
  'bus terminal Bayugan Agusan del Sur Philippines',
  'bus terminal Surigao City Philippines',
  'bus terminal Tandag Surigao del Sur Philippines',
  'bus terminal Bislig Surigao del Sur Philippines',
  // Remaining ferry ports
  'ferry terminal Batangas Port Philippines',
  'ferry terminal Cagayan de Oro port Philippines',
  'RORO terminal Jagna Bohol Philippines',
  'port terminal Dumaguete Philippines',
  'port terminal Iloilo Philippines',
  'ferry terminal Matnog Sorsogon Philippines',
  'port terminal Lipata Surigao Philippines',
  'port terminal Nasipit Agusan Philippines',
  'ferry terminal Zamboanga Philippines',
  'port terminal General Santos Philippines',
  'ferry terminal Allen Northern Samar Philippines',
  'port terminal Calbayog Samar Philippines',
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapType(text = '') {
  const t = text.toLowerCase()
  if (/lrt|mrt|pnr|railway|train|rail|station/.test(t)) return 'Train'
  if (/ferry|port|pier|roro|seaport/.test(t)) return 'Ferry'
  if (/tricycle/.test(t)) return 'Tricycle'
  if (/uv|fx|van for hire/.test(t)) return 'UV'
  if (/bus/.test(t)) return 'Bus'
  return 'Jeep'
}

function near(lat, lng, existing, deg = 0.0003) {
  return existing.some(e => {
    const dl = Number(e.lat) - lat, dn = Number(e.lng) - lng
    return dl * dl + dn * dn < deg * deg
  })
}

// ── OSM fetch for one region ──────────────────────────────────────────────────
async function fetchOSMRegion({ name, bbox }) {
  const [south, west, north, east] = bbox.split(',')
  const bboxStr = `${south},${west},${north},${east}`
  const filter = OSM_TRANSPORT_FILTER.replace(/\(BBOX\)/g, `(${bboxStr})`)
  const query = `[out:json][timeout:30];\n(\n${filter}\n);\nout body;`
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(35000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const elements = data.elements || []
  const named = elements.filter(e => e.tags?.name)

  return named.map(e => ({
    name: e.tags.name,
    lat: e.lat,
    lng: e.lon,
    type: mapType(
      (e.tags.name || '') + ' ' +
      (e.tags.amenity || '') + ' ' +
      (e.tags.railway || '') + ' ' +
      (e.tags.public_transport || '')
    ),
    details: e.tags['addr:full'] || e.tags['addr:street'] || null,
    images: [],
    source_url: `https://www.openstreetmap.org/node/${e.id}`,
    query: `OSM:${name}`,
  }))
}

// ── GMaps scrape for one query ────────────────────────────────────────────────
async function scrapeGMaps(page, query) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1200)
  for (let i = 0; i < 10; i++) {
    await page.locator('[role="feed"]').evaluate(el => el.scrollBy(0, 600)).catch(() => {})
    await page.waitForTimeout(350)
  }
  return page.evaluate(query => {
    const results = []
    document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]').forEach(card => {
      try {
        const href = card.href || ''
        let lat, lng
        const m1 = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
        const m2 = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
        if (m1) { lat = parseFloat(m1[1]); lng = parseFloat(m1[2]) }
        else if (m2) { lat = parseFloat(m2[1]); lng = parseFloat(m2[2]) }
        else return
        const name = card.getAttribute('aria-label') || ''
        if (!name) return
        let address = ''
        card.querySelectorAll('.W4Efsd span').forEach(s => {
          const t = s.textContent.trim()
          if (t.includes(',') && t.length > 10 && !address) address = t
        })
        const img = card.querySelector('img[src*="googleusercontent"]')
        results.push({ name, lat, lng, address, imgSrc: img?.src || '', query })
      } catch {}
    })
    return results
  }, query).then(places => places.map(p => ({
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    type: mapType(p.name + ' ' + p.query),
    details: p.address?.trim() || null,
    images: p.imgSrc ? [p.imgSrc] : [],
    source_url: '',
    query: p.query,
  })))
}

// ── Load / save state ─────────────────────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_FILE)) return { doneOSM: [], doneGMaps: [] }
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) } catch { return { doneOSM: [], doneGMaps: [] } }
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const sql = neon(DB_URL)

  // Live DB snapshot for dedup — refresh in batches
  let dbExisting = await sql`SELECT lat, lng FROM terminals`
  console.log(`📊 DB has ${dbExisting.length} terminals`)

  const state = loadState()
  const doneOSM   = new Set(state.doneOSM)
  const doneGMaps = new Set(state.doneGMaps)

  let totalInserted = 0

  async function insertIfNew(p) {
    if (!p.name?.trim() || !p.lat || !p.lng) return false
    if (p.lat < 4 || p.lat > 22 || p.lng < 114 || p.lng > 127) return false
    if (near(p.lat, p.lng, dbExisting)) return false
    const type   = VALID_TYPES.has(p.type) ? p.type : 'Jeep'
    const images = (p.images || []).filter(Boolean)
    try {
      await sql`INSERT INTO terminals (name, lat, lng, type, details, images)
                VALUES (${p.name.trim()}, ${p.lat}, ${p.lng}, ${type}, ${p.details}, ${images})`
      dbExisting.push({ lat: p.lat, lng: p.lng }) // add to local cache
      totalInserted++
      return true
    } catch { return false }
  }

  // ── Phase 1: OSM all regions ────────────────────────────────────────────────
  const pendingOSM = OSM_REGIONS.filter(r => !doneOSM.has(r.name))
  console.log(`\n🗺️  OSM: ${pendingOSM.length}/${OSM_REGIONS.length} regions to fetch\n`)

  for (let i = 0; i < pendingOSM.length; i++) {
    const region = pendingOSM[i]
    process.stdout.write(`[OSM ${i + 1}/${pendingOSM.length}] ${region.name} ... `)
    try {
      const places = await fetchOSMRegion(region)
      let added = 0
      for (const p of places) {
        if (await insertIfNew(p)) added++
      }
      console.log(`${places.length} found, +${added} new (total: ${totalInserted})`)
      doneOSM.add(region.name)
      saveState({ doneOSM: [...doneOSM], doneGMaps: [...doneGMaps] })
    } catch (e) {
      console.log(`❌ ${e.message?.slice(0, 60)}`)
    }
    // Polite delay for Overpass API
    await new Promise(r => setTimeout(r, 2000))
  }

  // ── Phase 2: Google Maps targeted queries ───────────────────────────────────
  const pendingGMaps = GMAPS_QUERIES.filter(q => !doneGMaps.has(q))
  console.log(`\n🔍 GMaps: ${pendingGMaps.length}/${GMAPS_QUERIES.length} queries to run\n`)

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    geolocation: { latitude: 14.5995, longitude: 120.9842 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))

  for (let i = 0; i < pendingGMaps.length; i++) {
    const q = pendingGMaps[i]
    process.stdout.write(`[GM ${i + 1}/${pendingGMaps.length}] ${q.slice(0, 50)} ... `)
    try {
      const places = await scrapeGMaps(page, q)
      let added = 0
      for (const p of places) {
        if (await insertIfNew(p)) added++
      }
      console.log(`${places.length} found, +${added} new (total: ${totalInserted})`)
      doneGMaps.add(q)
      saveState({ doneOSM: [...doneOSM], doneGMaps: [...doneGMaps] })
    } catch (e) {
      console.log(`❌ ${e.message?.slice(0, 60)}`)
    }
    await page.waitForTimeout(1500 + Math.random() * 1000)
  }

  await browser.close()

  console.log(`\n✅ Full PH scrape complete — ${totalInserted} new terminals inserted`)
  const final = await sql`SELECT type, COUNT(*) as n FROM terminals GROUP BY type ORDER BY n DESC`
  console.log('\nDB breakdown:')
  for (const r of final) console.log(`  ${r.type}: ${r.n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
