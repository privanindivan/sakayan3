/**
 * Retry failed OSM regions with longer delays to avoid rate limiting
 */
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { neon } from '@neondatabase/serverless'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DB_URL = 'postgresql://neondb_owner:npg_YuOG0zeck1Is@ep-small-star-a1mmvsnn-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const VALID_TYPES = new Set(['Jeep', 'Bus', 'UV', 'Train', 'Ferry', 'Tricycle'])

// Only the regions that kept failing
const RETRY_REGIONS = [
  { name: 'Cagayan + Isabela',              bbox: '16.5,121.0,18.7,122.5' },
  { name: 'Tarlac + Nueva Ecija + Aurora',  bbox: '15.0,120.6,16.3,122.0' },
  { name: 'Metro Manila NCR',               bbox: '14.35,120.88,14.82,121.15' },
  { name: 'Laguna',                         bbox: '13.9,121.0,14.45,121.7' },
  { name: 'Marinduque + Romblon',           bbox: '12.5,121.8,13.6,122.7' },
  { name: 'Occidental Mindoro',             bbox: '12.2,120.5,13.5,121.1' },
  { name: 'Catanduanes',                    bbox: '13.5,124.1,14.0,124.5' },
  { name: 'Negros Oriental',                bbox: '9.0,122.8,10.7,123.6' },
  { name: 'Bohol',                          bbox: '9.5,123.7,10.3,124.6' },
  { name: 'Zamboanga City area',            bbox: '6.7,121.8,7.2,122.2' },
  { name: 'Davao del Sur + Sarangani',      bbox: '5.8,124.5,6.8,125.5' },
  { name: 'Dinagat Islands',                bbox: '10.0,125.5,10.5,126.0' },
  { name: 'Maguindanao + Cotabato City',    bbox: '6.5,124.2,7.5,125.0' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

function typeFromTags(tags) {
  const amenity = (tags.amenity || '').toLowerCase()
  const railway = (tags.railway || '').toLowerCase()
  const name    = (tags.name    || '').toLowerCase()

  if (railway === 'station' || railway === 'halt') return 'Train'
  if (amenity === 'ferry_terminal' || name.includes('port') || name.includes('pier') || name.includes('wharf')) return 'Ferry'
  if (amenity === 'bus_station' || name.includes('bus')) return 'Bus'
  if (name.includes('jeep') || name.includes('jeepney')) return 'Jeep'
  if (name.includes('uv') || name.includes('van')) return 'UV'
  if (amenity === 'bus_station') return 'Bus'
  return 'Bus'
}

async function fetchOSMRegion(bbox) {
  const query = `
    [out:json][timeout:30];
    (
      node["amenity"="bus_station"](${bbox});
      node["railway"="station"](${bbox});
      node["amenity"="ferry_terminal"](${bbox});
      node["public_transport"="station"](${bbox});
      node["highway"="bus_stop"]["name"](${bbox});
      way["amenity"="bus_station"](${bbox});
      way["railway"="station"](${bbox});
      way["amenity"="ferry_terminal"](${bbox});
    );
    out center;
  `
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(35000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.elements || []
}

async function main() {
  const sql = neon(DB_URL)
  const existing = await sql`SELECT lat, lng FROM terminals`
  const dbSet = new Set(existing.map(r => `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lng).toFixed(4)}`))

  console.log(`📊 DB has ${dbSet.size} terminals`)
  console.log(`🔁 Retrying ${RETRY_REGIONS.length} failed OSM regions with 8s delay between requests\n`)

  let totalNew = 0

  for (let i = 0; i < RETRY_REGIONS.length; i++) {
    const region = RETRY_REGIONS[i]
    process.stdout.write(`[${i+1}/${RETRY_REGIONS.length}] ${region.name} ... `)

    // Wait before each request to avoid rate limiting
    if (i > 0) await sleep(8000)

    let elements
    try {
      elements = await fetchOSMRegion(region.bbox)
    } catch (e) {
      // On failure, wait longer and retry once
      console.log(`❌ ${e.message} — waiting 20s and retrying...`)
      await sleep(20000)
      try {
        elements = await fetchOSMRegion(region.bbox)
      } catch (e2) {
        console.log(`❌ retry failed: ${e2.message}`)
        continue
      }
    }

    const candidates = elements
      .map(el => {
        const lat = el.lat ?? el.center?.lat
        const lng = el.lon ?? el.center?.lon
        const name = el.tags?.name || el.tags?.['name:en'] || ''
        if (!lat || !lng || !name.trim()) return null
        const key = `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`
        return { lat, lng, name: name.trim(), type: typeFromTags(el.tags || {}), key }
      })
      .filter(Boolean)
      .filter(c => !dbSet.has(c.key))
      // PH bounds check
      .filter(c => c.lat >= 4 && c.lat <= 22 && c.lng >= 114 && c.lng <= 128)

    if (candidates.length === 0) {
      console.log(`${elements.length} found, +0 new`)
      continue
    }

    // Insert in batches
    let inserted = 0
    for (const c of candidates) {
      try {
        await sql`
          INSERT INTO terminals (name, lat, lng, type, created_by)
          VALUES (${c.name}, ${c.lat}, ${c.lng}, ${c.type}, NULL)
          ON CONFLICT DO NOTHING
        `
        dbSet.add(c.key)
        inserted++
      } catch {}
    }
    totalNew += inserted
    console.log(`${elements.length} found, +${inserted} new (running total: ${totalNew})`)
  }

  const [count] = await sql`SELECT COUNT(*) as total FROM terminals`
  console.log(`\n✅ Done — ${totalNew} new terminals inserted`)
  console.log(`📊 DB now has ${count.total} terminals total`)
}

main().catch(console.error)
