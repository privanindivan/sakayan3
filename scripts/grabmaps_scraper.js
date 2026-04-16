#!/usr/bin/env node
// GrabMaps Public Transit route scraper via ADB
// Scrolls through the route list, extracts route code + from/to terminals,
// optionally clicks each route to get full stop list, then matches to Sakayan DB

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const ADB = 'C:\\Users\\jj\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Google.PlatformTools_Microsoft.Winget.Source_8wekyb3d8bbwe\\platform-tools\\adb.exe'
const DEVICE = '863d005830483132385104a7bfe0ab'
const PROGRESS_FILE = path.join(__dirname, 'grabmaps_routes.json')
const OUTPUT_FILE = path.join(__dirname, 'grabmaps_extracted.json')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

function log(msg) {
  const t = new Date().toTimeString().slice(0, 8)
  console.log(`[${t}] ${msg}`)
}

function adb(...args) {
  const result = spawnSync(ADB, ['-s', DEVICE, ...args], { encoding: 'buffer', timeout: 15000 })
  return result.stdout ? result.stdout.toString('utf8') : ''
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function dumpUI() {
  adb('shell', 'uiautomator', 'dump')
  await sleep(500)
  const xml = adb('exec-out', 'cat /storage/self/primary/window_dump.xml')
  return xml
}

function parseRoutes(xml) {
  // Extract all text values in order
  const texts = [...xml.matchAll(/text="([^"]+)"/g)].map(m => m[1])

  const routes = []
  let i = 0
  while (i < texts.length) {
    // Route code is a short code like T422, NIL-10, PNR, LRT1, MRT3, etc.
    // It's followed by route name, then "From → To", then "N stops"
    const t = texts[i]
    if (/^[A-Z]{1,5}[-]?[0-9A-Z]{0,5}$/.test(t) && t.length <= 10 && t !== 'LRT' && t !== 'MRT') {
      // This looks like a route code
      const code = t
      const name = texts[i + 1] || ''
      const dirRaw = texts[i + 2] || ''
      // Arrow char may be encoded differently
      const arrowMatch = dirRaw.match(/^(.+?)\s*[\u2192\u2794\u27a1]|ÔåÆ\s*(.+)$/) ||
                         dirRaw.match(/^(.+?)\s+.+\s+(.+)$/)

      // Parse "From → To" - the → might be encoded as ÔåÆ
      let from = '', to = ''
      const cleanDir = dirRaw.replace(/ÔåÆ/g, '→')
      const arrowIdx = cleanDir.indexOf('→')
      if (arrowIdx > -1) {
        from = cleanDir.slice(0, arrowIdx).trim()
        to = cleanDir.slice(arrowIdx + 1).trim()
      }

      const stopsText = texts[i + 3] || ''
      const stopsMatch = stopsText.match(/(\d+)\s+stop/)
      const stopCount = stopsMatch ? parseInt(stopsMatch[1]) : 0

      if (from && to) {
        routes.push({ code, name, from, to, stopCount })
        i += 4
        continue
      }
    }
    i++
  }
  return routes
}

function swipeUp() {
  // Swipe from bottom to top to scroll down
  adb('shell', 'input', 'swipe', '360', '1200', '360', '400', '600')
}

async function clickTab(tabName) {
  const xml = await dumpUI()
  // Find the tab's bounds
  const tabMatch = xml.match(new RegExp(`text="${tabName}"[^/]*/node[^>]+bounds="\\[([0-9,]+)\\]"`)) ||
                   xml.match(new RegExp(`text="${tabName}"[^>]+bounds="\\[([0-9,]+)\\]\\[([0-9,]+)\\]"`))
  if (tabMatch) {
    const bounds = tabMatch[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    if (bounds) {
      const cx = Math.floor((parseInt(bounds[1]) + parseInt(bounds[3])) / 2)
      const cy = Math.floor((parseInt(bounds[2]) + parseInt(bounds[4])) / 2)
      adb('shell', 'input', 'tap', String(cx), String(cy))
      await sleep(1500)
      log(`  Clicked tab: ${tabName} at ${cx},${cy}`)
      return true
    }
  }
  log(`  Tab not found: ${tabName}`)
  return false
}

async function scrapeTab(tabName) {
  log(`\n=== Scraping tab: ${tabName} ===`)
  await clickTab(tabName)
  await sleep(1000)

  const allRoutes = new Map() // key = code|from|to
  let noNewCount = 0
  let scrollCount = 0
  const MAX_SCROLLS = 50

  while (scrollCount < MAX_SCROLLS) {
    const xml = await dumpUI()
    const routes = parseRoutes(xml)

    let newCount = 0
    for (const r of routes) {
      const key = `${r.code}|${r.from}|${r.to}`
      if (!allRoutes.has(key)) {
        allRoutes.set(key, r)
        newCount++
        log(`  + ${r.code}: ${r.from} → ${r.to} (${r.stopCount} stops)`)
      }
    }

    if (newCount === 0) {
      noNewCount++
      if (noNewCount >= 3) {
        log(`  No new routes after ${noNewCount} scrolls, done with tab.`)
        break
      }
    } else {
      noNewCount = 0
    }

    swipeUp()
    await sleep(1200)
    scrollCount++
  }

  return [...allRoutes.values()]
}

async function matchTerminals(routes) {
  log('\n=== Matching terminals in DB ===')

  // Get all terminals from DB
  const { rows: terminals } = await pool.query(
    'SELECT id, name FROM terminals ORDER BY name'
  )

  log(`Loaded ${terminals.length} terminals`)

  // Build name index for fuzzy matching
  const terminalMap = new Map()
  for (const t of terminals) {
    terminalMap.set(normalize(t.name), t)
  }

  function normalize(s) {
    return s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function findTerminal(name) {
    const norm = normalize(name)
    // Exact match
    if (terminalMap.has(norm)) return terminalMap.get(norm)
    // Contains match
    for (const [k, v] of terminalMap) {
      if (k.includes(norm) || norm.includes(k)) return v
    }
    return null
  }

  const matched = []
  const unmatched = []

  for (const r of routes) {
    const fromT = findTerminal(r.from)
    const toT = findTerminal(r.to)

    if (fromT && toT) {
      matched.push({ ...r, from_id: fromT.id, to_id: toT.id, from_name: fromT.name, to_name: toT.name })
    } else {
      unmatched.push({ ...r, from_matched: fromT?.name, to_matched: toT?.name })
    }
  }

  log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}`)

  if (unmatched.length > 0) {
    log('\nUnmatched routes:')
    for (const r of unmatched) {
      log(`  ${r.code}: "${r.from}" → "${r.to}"`)
      if (!r.from_matched) log(`    !! No match for FROM: "${r.from}"`)
      if (!r.to_matched) log(`    !! No match for TO: "${r.to}"`)
    }
  }

  return { matched, unmatched }
}

async function insertConnections(matched) {
  log('\n=== Inserting connections ===')

  // Load existing connections to dedup
  const { rows: existing } = await pool.query('SELECT from_id, to_id FROM connections')
  const existingSet = new Set()
  for (const c of existing) {
    existingSet.add(`${c.from_id}|${c.to_id}`)
    existingSet.add(`${c.to_id}|${c.from_id}`)
  }

  let inserted = 0
  let skipped = 0

  for (const r of matched) {
    const key = `${r.from_id}|${r.to_id}`
    if (existingSet.has(key)) {
      skipped++
      continue
    }

    await pool.query(
      `INSERT INTO connections (from_id, to_id, source, notes) VALUES ($1, $2, $3, $4)`,
      [r.from_id, r.to_id, 'grabmaps', `${r.code}: ${r.name}`]
    )
    existingSet.add(key)
    existingSet.add(`${r.to_id}|${r.from_id}`)
    inserted++
    log(`  Inserted: ${r.from_name} → ${r.to_name} [${r.code}]`)
  }

  log(`Inserted: ${inserted}, Skipped (already exist): ${skipped}`)
  return inserted
}

async function main() {
  const args = process.argv.slice(2)
  const DRY_RUN = args.includes('--dry-run')

  log('=== GrabMaps Scraper ===')
  if (DRY_RUN) log('DRY RUN MODE - no DB writes')

  const allRoutes = []

  // Scrape each tab
  const tabs = ['Nearby', 'Jeepney', 'LRT', 'MRT']
  for (const tab of tabs) {
    const routes = await scrapeTab(tab)
    allRoutes.push(...routes)
    log(`  Tab "${tab}": ${routes.length} routes`)
    await sleep(500)
  }

  // Dedup across tabs
  const deduped = new Map()
  for (const r of allRoutes) {
    const key = `${r.code}|${r.from}|${r.to}`
    deduped.set(key, r)
  }
  const uniqueRoutes = [...deduped.values()]
  log(`\nTotal unique routes: ${uniqueRoutes.length}`)

  // Save extracted routes
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(uniqueRoutes, null, 2))
  log(`Saved to ${OUTPUT_FILE}`)

  if (DRY_RUN) {
    log('\nDry run: showing routes only, no DB writes.')
    for (const r of uniqueRoutes) {
      log(`  ${r.code}: ${r.from} → ${r.to}`)
    }
    process.exit(0)
  }

  // Match to DB terminals
  const { matched, unmatched } = await matchTerminals(uniqueRoutes)

  // Save match results
  fs.writeFileSync(
    path.join(__dirname, 'grabmaps_match_results.json'),
    JSON.stringify({ matched, unmatched }, null, 2)
  )

  // Insert connections
  if (matched.length > 0) {
    const inserted = await insertConnections(matched)
    log(`\nDone! ${inserted} new connections inserted.`)
  }

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
