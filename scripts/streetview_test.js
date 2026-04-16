// Street View — direct thumbnail API, camera pointing AT the terminal
// No browser needed. Fully free.
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const OUT_DIR = path.join(__dirname, 'streetview_test_output')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR)

// Calculate bearing (yaw) FROM point A TOWARD point B
function bearing(aLat, aLng, bLat, bLng) {
  const dLng = (bLng - aLng) * Math.PI / 180
  const lat1 = aLat * Math.PI / 180
  const lat2 = bLat * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// Use Playwright to navigate to Street View URL and extract pano ID from the redirected URL
async function getPanoInfo(termLat, termLng) {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewportSize({ width: 800, height: 600 })

  const url = `https://www.google.com/maps?layer=c&cbll=${termLat},${termLng}&cbp=12,0,,0,1`
  await page.goto(url, { waitUntil: 'load', timeout: 20000 })
  // Wait for the URL to update to the actual pano URL (contains !1s + pano ID)
  await page.waitForFunction(
    () => window.location.href.includes('!1s') || window.location.href.includes('panoid'),
    { timeout: 10000 }
  ).catch(() => {})
  await page.waitForTimeout(2000)

  const finalUrl = page.url()
  await browser.close()

  // Extract pano ID from !1s<PANOID>!
  const panoMatch = finalUrl.match(/!1s([^!]+)!/)
  // Extract pano lat/lng from @lat,lng
  const coordMatch = finalUrl.match(/@([\d.-]+),([\d.-]+)/)

  if (!panoMatch) return null
  return {
    panoId: decodeURIComponent(panoMatch[1]),
    panoLat: coordMatch ? parseFloat(coordMatch[1]) : termLat,
    panoLng: coordMatch ? parseFloat(coordMatch[2]) : termLng
  }
}

// Download Street View thumbnail at specific yaw, no UI, no watermark
function downloadShot(panoId, yaw, width, height, outFile) {
  return new Promise((resolve, reject) => {
    const url = `https://streetviewpixels-pa.googleapis.com/v1/thumbnail` +
      `?cb_client=maps_sv.tactile&w=${width}&h=${height}&pitch=0&panoid=${encodeURIComponent(panoId)}&yaw=${yaw}`
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        fs.writeFileSync(outFile, Buffer.concat(chunks))
        console.log(`  Saved (${res.statusCode}): ${path.basename(outFile)}`)
        resolve()
      })
    }).on('error', reject)
  })
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(':5432/', ':6543/'),
    ssl: { rejectUnauthorized: false }
  })
  const { rows } = await pool.query(`
    SELECT id, name, lat, lng FROM terminals
    WHERE lat IS NOT NULL AND lng IS NOT NULL AND name ILIKE '%cubao%'
    LIMIT 1
  `)
  await pool.end()

  if (!rows.length) { console.log('No terminal found'); return }

  const t = rows[0]
  const termLat = parseFloat(t.lat)
  const termLng = parseFloat(t.lng)
  const safe = t.name.replace(/[^a-z0-9]/gi, '_')

  console.log(`Terminal: ${t.name}`)
  console.log(`Coords:   ${termLat}, ${termLng}`)

  // Get pano ID and position via redirect
  console.log('\nFinding nearest pano...')
  const pano = await getPanoInfo(termLat, termLng)

  if (!pano) {
    console.log('No pano found near this terminal.')
    return
  }

  console.log(`Pano ID:  ${pano.panoId}`)
  console.log(`Pano at:  ${pano.panoLat}, ${pano.panoLng}`)

  // Calculate bearing FROM pano position TOWARD terminal
  const yawToTerminal = Math.round(bearing(pano.panoLat, pano.panoLng, termLat, termLng))
  const OFFSET = 45 // degrees left/right of the terminal bearing
  const yawRight = (yawToTerminal + OFFSET + 360) % 360 // shot 1: camera shifted right
  const yawLeft  = (yawToTerminal - OFFSET + 360) % 360 // shot 2: camera shifted left

  console.log(`\nBearing toward terminal: ${yawToTerminal}°`)
  console.log(`Shot 1 (right offset):   ${yawRight}°`)
  console.log(`Shot 2 (left offset):    ${yawLeft}°`)

  // Download both shots at 1280x720
  console.log('\nDownloading shots...')
  await downloadShot(pano.panoId, yawRight, 1280, 720, path.join(OUT_DIR, `${safe}_shot1.jpg`))
  await downloadShot(pano.panoId, yawLeft,  1280, 720, path.join(OUT_DIR, `${safe}_shot2.jpg`))

  console.log('\nDone! Output:', OUT_DIR)
}

main().catch(e => { console.error(e); process.exit(1) })
