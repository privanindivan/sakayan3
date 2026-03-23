/**
 * Import scraped terminals into Neon DB
 * Reads: scripts/terminals-raw.json
 * Inserts into: terminals table (skips duplicates by proximity ~33m)
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { neon } from '@neondatabase/serverless'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const RAW_FILE   = path.join(SCRIPT_DIR, 'terminals-raw.json')

const DB_URL = 'postgresql://neondb_owner:npg_YuOG0zeck1Is@ep-small-star-a1mmvsnn-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

const VALID_TYPES = new Set(['Jeep', 'Bus', 'UV', 'Train', 'Ferry', 'Tricycle'])

async function main() {
  const raw = JSON.parse(readFileSync(RAW_FILE, 'utf8'))
  const places = raw.places || []
  console.log(`📂 Loaded ${places.length} scraped terminals`)

  const sql = neon(DB_URL)

  // Fetch existing terminals to avoid duplicates
  const existing = await sql`SELECT name, lat, lng FROM terminals`
  console.log(`📊 ${existing.length} terminals already in DB\n`)

  function isDuplicate(place) {
    return existing.some(e => {
      const dlat = Number(e.lat) - place.lat
      const dlng = Number(e.lng) - place.lng
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.0003 // ~33m
    })
  }

  let inserted = 0
  let skipped  = 0
  let errors   = 0

  for (const place of places) {
    // Validate
    if (!place.name?.trim() || !place.lat || !place.lng) { skipped++; continue }

    // Must be within Philippines bounding box
    if (place.lat < 4 || place.lat > 22 || place.lng < 114 || place.lng > 127) {
      skipped++; continue
    }

    if (isDuplicate(place)) { skipped++; continue }

    const type    = VALID_TYPES.has(place.type) ? place.type : 'Jeep'
    const details = place.details?.trim() || null
    const images  = (place.images || []).filter(Boolean)

    try {
      await sql`
        INSERT INTO terminals (name, lat, lng, type, details, images)
        VALUES (${place.name.trim()}, ${place.lat}, ${place.lng}, ${type}, ${details}, ${images})
      `
      existing.push({ lat: place.lat, lng: place.lng })
      inserted++
      process.stdout.write(`  ✓ [${type}] ${place.name}\n`)
    } catch (e) {
      errors++
      process.stdout.write(`  ✗ ${place.name}: ${e.message?.slice(0, 60)}\n`)
    }
  }

  console.log(`
✅ Import complete
   Inserted : ${inserted}
   Skipped  : ${skipped} (duplicates / out of PH bounds / invalid)
   Errors   : ${errors}
   Total DB : ${existing.length}
`)
}

main().catch(e => { console.error(e); process.exit(1) })
