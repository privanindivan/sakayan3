/**
 * Google Maps transport terminal scraper — Philippines nationwide
 * Extracts name + coords directly from search result cards (no per-place navigation)
 * Outputs: scripts/terminals-raw.json  (resume-safe)
 */

import { chromium } from 'playwright'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT_FILE   = path.join(SCRIPT_DIR, 'terminals-raw.json')
mkdirSync(SCRIPT_DIR, { recursive: true })

const QUERIES = [
  // Metro Manila — Jeepney
  'jeepney terminal Manila',
  'jeepney terminal Quezon City Philippines',
  'jeepney terminal Caloocan Philippines',
  'jeepney terminal Marikina Philippines',
  'jeepney terminal Pasig Philippines',
  'jeepney terminal Makati Philippines',
  'jeepney terminal Pasay Philippines',
  'jeepney terminal Parañaque Philippines',
  'jeepney terminal Valenzuela Philippines',
  'jeepney terminal Malabon Philippines',
  'jeepney terminal Las Piñas Philippines',
  'jeepney terminal Muntinlupa Philippines',
  'jeepney terminal Taguig Philippines',
  'jeepney terminal Mandaluyong Philippines',
  'jeepney terminal San Juan Metro Manila',
  // Metro Manila — Bus / UV / others
  'bus terminal Manila Philippines',
  'bus terminal Quezon City Philippines',
  'bus terminal Pasay Philippines',
  'bus terminal Parañaque Philippines',
  'UV express terminal Metro Manila',
  'FX terminal Metro Manila Philippines',
  'P2P bus terminal Metro Manila Philippines',
  'tricycle terminal Manila Philippines',
  'transport terminal Cubao Quezon City',
  'transport terminal Buendia Pasay',
  'transport hub EDSA Philippines',
  // Trains
  'LRT station Manila Philippines',
  'LRT-2 station Philippines',
  'MRT-3 station Metro Manila',
  'MRT-7 station Philippines',
  'PNR station Manila Philippines',
  // Luzon
  'bus terminal Pampanga Philippines',
  'bus terminal Angeles City Philippines',
  'jeepney terminal Angeles City Philippines',
  'bus terminal Olongapo Philippines',
  'bus terminal Batangas City Philippines',
  'bus terminal Lipa Batangas Philippines',
  'bus terminal Lucena City Philippines',
  'bus terminal San Fernando La Union Philippines',
  'bus terminal Baguio City Philippines',
  'jeepney terminal Baguio City Philippines',
  'bus terminal Dagupan City Philippines',
  'bus terminal Cabanatuan Nueva Ecija Philippines',
  'bus terminal Tarlac City Philippines',
  'bus terminal Legazpi City Philippines',
  'jeepney terminal Naga City Philippines',
  'bus terminal Naga City Philippines',
  'bus terminal Tuguegarao Philippines',
  'bus terminal Vigan City Philippines',
  'bus terminal Laoag City Philippines',
  'bus terminal Malolos Bulacan Philippines',
  'jeepney terminal Bulacan Philippines',
  'bus terminal Antipolo Rizal Philippines',
  'jeepney terminal Antipolo Philippines',
  'bus terminal Bacoor Cavite Philippines',
  'bus terminal Laguna Philippines',
  'bus terminal Santa Rosa Laguna Philippines',
  // Visayas
  'bus terminal Cebu City Philippines',
  'jeepney terminal Cebu City Philippines',
  'South Bus Terminal Cebu Philippines',
  'North Bus Terminal Cebu Philippines',
  'jeepney terminal Mandaue Philippines',
  'bus terminal Lapu-Lapu Philippines',
  'bus terminal Iloilo City Philippines',
  'jeepney terminal Iloilo City Philippines',
  'bus terminal Bacolod City Philippines',
  'jeepney terminal Bacolod City Philippines',
  'bus terminal Tacloban City Philippines',
  'jeepney terminal Tacloban Philippines',
  'bus terminal Dumaguete City Philippines',
  'jeepney terminal Dumaguete Philippines',
  'bus terminal Roxas City Philippines',
  'transport terminal Ormoc City Philippines',
  // Mindanao
  'bus terminal Davao City Philippines',
  'jeepney terminal Davao City Philippines',
  'bus terminal Cagayan de Oro Philippines',
  'jeepney terminal Cagayan de Oro Philippines',
  'bus terminal Zamboanga City Philippines',
  'bus terminal General Santos City Philippines',
  'bus terminal Butuan City Philippines',
  'bus terminal Iligan City Philippines',
  'bus terminal Cotabato City Philippines',
  'bus terminal Koronadal South Cotabato Philippines',
  'bus terminal Pagadian City Philippines',
  'bus terminal Dipolog City Philippines',
  'bus terminal Ozamiz City Philippines',
  'jeepney terminal Surigao City Philippines',
  // Ferries / Ports
  'ferry terminal Manila Philippines',
  'Batangas Port terminal Philippines',
  'Matnog Port Sorsogon Philippines',
  'Allen Port Samar Philippines',
  'Liloan Port Southern Leyte Philippines',
  'ferry terminal Cebu Philippines',
  'port terminal Ormoc Leyte Philippines',
  'RORO port terminal Philippines',
]

function mapType(text = '') {
  const t = text.toLowerCase()
  if (t.includes('lrt') || t.includes('mrt') || t.includes('train') || t.includes('pnr') || t.includes('rail')) return 'Train'
  if (t.includes('ferry') || t.includes('port') || t.includes('pier') || t.includes('roro') || t.includes('seaport')) return 'Ferry'
  if (t.includes('tricycle')) return 'Tricycle'
  if (t.includes('uv') || t.includes('fx') || t.includes('van for hire')) return 'UV'
  if (t.includes('p2p') || t.includes('bus')) return 'Bus'
  return 'Jeep'
}

function extractCoordsFromUrl(url) {
  // Pattern: @lat,lng,zoom  e.g. @14.5995,120.9842,17z
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  // Pattern: !3d lat !4d lng  (in data param)
  const m2 = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) }
  return null
}

function dedup(places) {
  const out = []
  for (const p of places) {
    const near = out.find(o => {
      const dlat = o.lat - p.lat
      const dlng = o.lng - p.lng
      return Math.sqrt(dlat * dlat + dlng * dlng) < 0.0003 // ~33m
    })
    if (!near) out.push(p)
  }
  return out
}

function save(places, doneQueries) {
  const deduped = dedup(places)
  writeFileSync(OUT_FILE, JSON.stringify({
    places: deduped,
    doneQueries: [...doneQueries],
    total: deduped.length,
    updatedAt: new Date().toISOString(),
  }, null, 2))
  return deduped.length
}

async function scrapeQuery(page, query) {
  console.log(`\n🔍 ${query}`)
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Wait for results feed
  await page.waitForSelector('[role="feed"]', { timeout: 12000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Scroll to load more results
  for (let i = 0; i < 12; i++) {
    await page.locator('[role="feed"]').evaluate(el => el.scrollBy(0, 600)).catch(() => {})
    await page.waitForTimeout(400)
  }

  // Extract all place data directly from the result cards + their links
  const places = await page.evaluate((query) => {
    const results = []

    // Each result card is an <a> inside the feed
    const cards = document.querySelectorAll('[role="feed"] a[href*="/maps/place/"]')

    cards.forEach(card => {
      try {
        const href = card.href || ''

        // Extract coords from the href
        let lat, lng
        const m1 = href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
        const m2 = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
        if (m1) { lat = parseFloat(m1[1]); lng = parseFloat(m1[2]) }
        else if (m2) { lat = parseFloat(m2[1]); lng = parseFloat(m2[2]) }
        else return // no coords, skip

        // Name — try aria-label on the card, or find heading text
        const name = card.getAttribute('aria-label')
          || card.querySelector('.fontHeadlineSmall, [jsan*="t_el"], h3')?.textContent?.trim()
          || ''
        if (!name) return

        // Category / type text
        const categoryEl = card.querySelector('.W4Efsd:last-child .W4Efsd span:first-child, .DkEaL, [jslog] span')
        const category = categoryEl?.textContent?.trim() || ''

        // Address text
        const spans = card.querySelectorAll('.W4Efsd span')
        let address = ''
        spans.forEach(s => {
          const t = s.textContent.trim()
          if (t.includes(',') && t.length > 10 && !address) address = t
        })

        // Thumbnail image
        const img = card.querySelector('img[src*="googleusercontent"], img[src*="maps/"]')
        const imgSrc = img?.src || ''

        results.push({ name, lat, lng, category, address, imgSrc, href, query })
      } catch {}
    })

    return results
  }, query)

  console.log(`  → ${places.length} places extracted`)

  return places.map(p => ({
    name: p.name.trim(),
    lat: p.lat,
    lng: p.lng,
    type: mapType(p.category + ' ' + p.name + ' ' + p.query),
    details: p.address?.trim() || null,
    images: p.imgSrc ? [p.imgSrc] : [],
    source_url: p.href,
    query: p.query,
  }))
}

async function main() {
  let allPlaces = []
  let doneQueries = new Set()

  if (existsSync(OUT_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(OUT_FILE, 'utf8'))
      allPlaces = saved.places || []
      doneQueries = new Set(saved.doneQueries || [])
      console.log(`📂 Resuming — ${allPlaces.length} places, ${doneQueries.size}/${QUERIES.length} queries done`)
    } catch {}
  }

  const remaining = QUERIES.filter(q => !doneQueries.has(q))
  console.log(`▶  ${remaining.length} queries to run\n`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    geolocation: { latitude: 14.5995, longitude: 120.9842 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()
  page.on('dialog', d => d.dismiss().catch(() => {}))

  let i = 0
  for (const query of remaining) {
    i++
    process.stdout.write(`[${i}/${remaining.length}] `)
    try {
      const results = await scrapeQuery(page, query)
      allPlaces.push(...results)
      doneQueries.add(query)
      const total = save(allPlaces, doneQueries)
      console.log(`  💾 ${total} unique total`)
    } catch (e) {
      console.error(`  ❌ ${e.message?.slice(0, 100)}`)
      doneQueries.add(query) // mark done to not retry endlessly
    }
    await page.waitForTimeout(1500 + Math.random() * 1500)
  }

  await browser.close()

  if (existsSync(OUT_FILE)) {
    const final = JSON.parse(readFileSync(OUT_FILE, 'utf8'))
    console.log(`\n✅ Done — ${final.total} unique terminals`)
    const byType = {}
    for (const p of final.places) byType[p.type] = (byType[p.type] || 0) + 1
    for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1]))
      console.log(`  ${t}: ${n}`)
    console.log(`\nRun next: node scripts/import-terminals.mjs`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
