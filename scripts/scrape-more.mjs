/**
 * Supplemental scraper — fills gaps missed in first pass
 * Sources: Google Maps (Playwright) + OSM Overpass API
 * Deduplicates against existing terminals-raw.json
 * Appends results to terminals-raw.json then re-imports to DB
 */

import { chromium } from 'playwright'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { neon } from '@neondatabase/serverless'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const RAW_FILE   = path.join(SCRIPT_DIR, 'terminals-raw.json')

const DB_URL = 'postgresql://neondb_owner:npg_YuOG0zeck1Is@ep-small-star-a1mmvsnn-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const EXTRA_GMAPS_QUERIES = [
  // Cavite — specifically missed areas
  'jeepney terminal Dasmariñas Cavite Philippines',
  'terminal Dasmariñas City Philippines',
  'jeepney terminal GMA Cavite Philippines',
  'transport terminal Imus Cavite Philippines',
  'jeepney terminal General Trias Cavite Philippines',
  'terminal Trece Martires Cavite Philippines',
  'jeepney terminal Silang Cavite Philippines',
  'bus terminal Tagaytay Philippines',
  'jeepney terminal Tagaytay Philippines',
  'jeepney terminal Carmona Cavite Philippines',
  'jeepney terminal Kawit Cavite Philippines',
  // Rizal / east MM missed
  'jeepney terminal Taytay Rizal Philippines',
  'jeepney terminal Cainta Rizal Philippines',
  'jeepney terminal Angono Rizal Philippines',
  'jeepney terminal Binangonan Rizal Philippines',
  // Laguna missed
  'jeepney terminal Calamba Laguna Philippines',
  'jeepney terminal San Pedro Laguna Philippines',
  'jeepney terminal Biñan Laguna Philippines',
  'jeepney terminal Los Baños Laguna Philippines',
  // Bulacan missed
  'jeepney terminal Meycauayan Bulacan Philippines',
  'jeepney terminal Marilao Bulacan Philippines',
  'jeepney terminal Bocaue Bulacan Philippines',
  'jeepney terminal Balagtas Bulacan Philippines',
  // More Cebu
  'jeepney terminal Talisay Cebu Philippines',
  'jeepney terminal Minglanilla Cebu Philippines',
  'jeepney terminal Carcar Cebu Philippines',
  // Davao missing areas
  'jeepney terminal Digos City Philippines',
  'bus terminal Tagum City Philippines',
  'jeepney terminal Panabo City Philippines',
  // More Iloilo/Negros
  'jeepney terminal Kabankalan Philippines',
  'jeepney terminal Himamaylan Philippines',
  // Pangasinan
  'jeepney terminal Urdaneta Pangasinan Philippines',
  'bus terminal Lingayen Pangasinan Philippines',
  // More Batangas
  'jeepney terminal Tanauan Batangas Philippines',
  'jeepney terminal Sto. Tomas Batangas Philippines',
  // Albay / Sorsogon
  'jeepney terminal Tabaco Albay Philippines',
  'jeepney terminal Sorsogon City Philippines',
]

// OSM Overpass queries — bounding boxes for specific missed areas
const OSM_QUERIES = [
  // Dasmariñas + GMA Cavite
  { name: 'Dasmarinas-GMA Cavite', bbox: '14.25,120.88,14.40,121.02' },
  // Imus Cavite
  { name: 'Imus Cavite', bbox: '14.36,120.90,14.42,120.97' },
  // General Trias Cavite
  { name: 'General Trias Cavite', bbox: '14.35,120.85,14.42,120.92' },
  // Trece Martires
  { name: 'Trece Martires', bbox: '14.27,120.84,14.33,120.90' },
  // Tagaytay
  { name: 'Tagaytay', bbox: '14.09,120.92,14.15,121.00' },
]

function mapType(text = '') {
  const t = text.toLowerCase()
  if (t.includes('lrt') || t.includes('mrt') || t.includes('train') || t.includes('pnr') || t.includes('rail')) return 'Train'
  if (t.includes('ferry') || t.includes('port') || t.includes('pier') || t.includes('roro')) return 'Ferry'
  if (t.includes('tricycle')) return 'Tricycle'
  if (t.includes('uv') || t.includes('fx') || t.includes('van for hire')) return 'UV'
  if (t.includes('bus')) return 'Bus'
  return 'Jeep'
}

function isNearExisting(lat, lng, existing, thresholdDeg = 0.0003) {
  return existing.some(e => {
    const dlat = Number(e.lat) - lat
    const dlng = Number(e.lng) - lng
    return Math.sqrt(dlat * dlat + dlng * dlng) < thresholdDeg
  })
}

// ── OSM Overpass fetch ────────────────────────────────────────────────────────
async function fetchOSM({ name, bbox }) {
  const [south, west, north, east] = bbox.split(',').map(Number)
  const query = `[out:json][timeout:25];
(
  node["amenity"="bus_station"](${south},${west},${north},${east});
  node["highway"="bus_stop"](${south},${west},${north},${east});
  node["public_transport"="stop_position"](${south},${west},${north},${east});
  node["public_transport"="station"](${south},${west},${north},${east});
);
out body;`

  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
  const data = await res.json()
  console.log(`  OSM ${name}: ${data.elements?.length || 0} results`)

  return (data.elements || [])
    .filter(e => e.lat && e.lon && e.tags?.name)
    .map(e => ({
      name: e.tags.name,
      lat: e.lat,
      lng: e.lon,
      type: mapType(e.tags.name + ' ' + (e.tags.amenity || '') + ' ' + (e.tags.public_transport || '')),
      details: null,
      images: [],
      source_url: `https://www.openstreetmap.org/node/${e.id}`,
      query: `OSM:${name}`,
    }))
}

// ── Google Maps scrape (same approach as main scraper) ────────────────────────
async function scrapeGMaps(page, query) {
  console.log(`  GMaps: ${query}`)
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[role="feed"]', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1200)

  for (let i = 0; i < 10; i++) {
    await page.locator('[role="feed"]').evaluate(el => el.scrollBy(0, 600)).catch(() => {})
    await page.waitForTimeout(350)
  }

  const places = await page.evaluate((query) => {
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
        const spans = card.querySelectorAll('.W4Efsd span')
        let address = ''
        spans.forEach(s => { const t = s.textContent.trim(); if (t.includes(',') && t.length > 10 && !address) address = t })
        const img = card.querySelector('img[src*="googleusercontent"]')
        results.push({ name, lat, lng, address, imgSrc: img?.src || '', query })
      } catch {}
    })
    return results
  }, query)

  return places.map(p => ({
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    type: mapType(p.name + ' ' + p.query),
    details: p.address?.trim() || null,
    images: p.imgSrc ? [p.imgSrc] : [],
    source_url: '',
    query: p.query,
  }))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load existing scraped data
  const saved = existsSync(RAW_FILE) ? JSON.parse(readFileSync(RAW_FILE, 'utf8')) : { places: [] }
  const existing = saved.places || []
  console.log(`📂 Existing: ${existing.length} scraped places`)

  // Fetch existing DB terminals too
  const sql = neon(DB_URL)
  const dbTerminals = await sql`SELECT lat, lng FROM terminals`
  console.log(`📊 Existing in DB: ${dbTerminals.length}`)

  const allExisting = [...existing, ...dbTerminals]
  const newPlaces = []

  // ── 1. OSM fetch ────────────────────────────────────────────────────────────
  console.log('\n🗺️  Fetching from OSM Overpass API...')
  for (const osmQ of OSM_QUERIES) {
    try {
      const results = await fetchOSM(osmQ)
      for (const p of results) {
        if (!isNearExisting(p.lat, p.lng, allExisting)) {
          newPlaces.push(p)
          allExisting.push({ lat: p.lat, lng: p.lng })
        }
      }
    } catch (e) {
      console.error(`  OSM error ${osmQ.name}: ${e.message?.slice(0, 60)}`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
  console.log(`  → ${newPlaces.length} new from OSM so far`)

  // ── 2. Google Maps extra queries ────────────────────────────────────────────
  console.log('\n🔍 Google Maps extra queries...')
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

  for (let i = 0; i < EXTRA_GMAPS_QUERIES.length; i++) {
    const q = EXTRA_GMAPS_QUERIES[i]
    process.stdout.write(`[${i + 1}/${EXTRA_GMAPS_QUERIES.length}] `)
    try {
      const results = await scrapeGMaps(page, q)
      let added = 0
      for (const p of results) {
        if (p.lat < 4 || p.lat > 22 || p.lng < 114 || p.lng > 127) continue
        if (!isNearExisting(p.lat, p.lng, allExisting)) {
          newPlaces.push(p)
          allExisting.push({ lat: p.lat, lng: p.lng })
          added++
        }
      }
      console.log(`  +${added} new (${results.length} found)`)
    } catch (e) {
      console.error(`  ❌ ${e.message?.slice(0, 80)}`)
    }
    await page.waitForTimeout(1500 + Math.random() * 1000)
  }

  await browser.close()

  console.log(`\n✅ ${newPlaces.length} new unique terminals found`)
  if (newPlaces.length === 0) { console.log('Nothing to import.'); return }

  // ── 3. Import new places into DB ────────────────────────────────────────────
  console.log('\n📥 Importing to DB...')
  const VALID_TYPES = new Set(['Jeep', 'Bus', 'UV', 'Train', 'Ferry', 'Tricycle'])
  let inserted = 0, errors = 0

  for (const p of newPlaces) {
    const type   = VALID_TYPES.has(p.type) ? p.type : 'Jeep'
    const images = (p.images || []).filter(Boolean)
    try {
      await sql`INSERT INTO terminals (name, lat, lng, type, details, images)
                VALUES (${p.name}, ${p.lat}, ${p.lng}, ${type}, ${p.details}, ${images})`
      inserted++
      process.stdout.write(`  ✓ [${type}] ${p.name}\n`)
    } catch (e) {
      errors++
    }
  }

  // ── 4. Update raw file ──────────────────────────────────────────────────────
  const updatedPlaces = [...existing, ...newPlaces]
  writeFileSync(RAW_FILE, JSON.stringify({
    places: updatedPlaces,
    total: updatedPlaces.length,
    updatedAt: new Date().toISOString(),
  }, null, 2))

  console.log(`\n✅ Done — inserted ${inserted}, errors ${errors}`)
  console.log(`   terminals-raw.json updated: ${updatedPlaces.length} total`)
}

main().catch(e => { console.error(e); process.exit(1) })
