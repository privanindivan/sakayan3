/**
 * GMaps Full Import — replaces all terminal photos
 * - Scrapes Google Maps per terminal (all or limited)
 * - Uploads immediately to Cloudinary (no blank URLs)
 * - Replaces existing photos in DB
 * - Live preview at localhost:7789, Stop button included
 *
 * Usage:
 *   node scripts/gmaps_import.js              (all terminals)
 *   node scripts/gmaps_import.js --limit 200  (test batch)
 *   node scripts/gmaps_import.js --type Jeep  (filter by type)
 *   node scripts/gmaps_import.js --resume     (skip already done)
 */

require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const https = require('https')
const http = require('http')
const { Pool } = require('pg')
const cloudinary = require('cloudinary').v2
const fs = require('fs')
const path = require('path')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PORT = 7789
const PROGRESS_FILE = path.join(__dirname, 'gmaps_import_progress.json')
const MAX_PHOTOS = 4
const DELAY_MS = 2000

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dmpytrcpl',
  api_key: process.env.CLOUDINARY_API_KEY || '659219458216645',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Y-s8TVGEroo2HaFEPDjNGK70oSk',
})

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const typeIdx = args.indexOf('--type')
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 999999
const TYPE_FILTER = typeIdx !== -1 ? args[typeIdx + 1] : null
const RESUME = args.includes('--resume')
const TEST_MODE = args.includes('--test') // preview only, no DB writes, separate Cloudinary folder

// ── state ─────────────────────────────────────────────────────
let state = {
  running: false, done: false, current: '', currentIdx: 0,
  total: 0, processed: 0, uploaded: 0, skipped: 0, noPhotos: 0,
  blockedProfilePics: 0,
  results: [], // { terminalName, photos: [cloudinaryUrl,...] }
  log: []
}
let stopRequested = false

function log(msg) {
  const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg
  console.log(line)
  state.log.unshift(line)
  if (state.log.length > 150) state.log.length = 150
}

// ── progress ──────────────────────────────────────────────────
function loadDone() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))) } catch { return new Set() }
}
function saveDone(done) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done])) }

// ── URL filter — place photos only ────────────────────────────
function isPlacePhoto(url) {
  if (!url.includes('googleusercontent.com')) return false
  if (url.includes('gps-cs-s/')) return true
  if (url.includes('geougc-cs/')) return true
  if (url.match(/\/p\/AF[0-9a-zA-Z]/)) return true
  return false
}

function photoBaseId(url) {
  return url.replace(/=[whks][0-9].*$/, '').replace(/\?.*$/, '')
}

function bestSize(url) {
  return url.replace(/=w\d+-h\d+.*$/, '=w1200').replace(/=w\d+.*$/, '=w1200')
}

// ── upload one URL to Cloudinary ──────────────────────────────
async function uploadToCloudinary(imageUrl) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: TEST_MODE ? 'sakayan/terminals_test' : 'sakayan/terminals',
      resource_type: 'image',
      fetch_format: 'auto',
      quality: 'auto',
    })
    return result.secure_url
  } catch {
    // Try without size params if it failed
    try {
      const clean = imageUrl.replace(/=w\d+.*$/, '').replace(/=h\d+.*$/, '')
      const result = await cloudinary.uploader.upload(clean, {
        folder: 'sakayan/terminals',
        resource_type: 'image',
        fetch_format: 'auto',
        quality: 'auto',
      })
      return result.secure_url
    } catch { return null }
  }
}

// ── scrape one terminal ───────────────────────────────────────
async function scrapeTerminal(page, terminal) {
  const capturedUrls = new Map()
  let blocked = 0

  const onRequest = req => {
    const url = req.url()
    if (isPlacePhoto(url)) {
      const base = photoBaseId(url)
      const existing = capturedUrls.get(base)
      const existingW = existing ? Number((existing.match(/=w(\d+)/) || [,0])[1]) : 0
      const newW = Number((url.match(/=w(\d+)/) || [,0])[1])
      if (!existing || newW > existingW) capturedUrls.set(base, bestSize(url))
    } else if (url.includes('googleusercontent.com') && (url.includes('/a/') || url.includes('/a-/'))) {
      blocked++
    }
  }
  page.on('request', onRequest)

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(terminal.name)}/@${terminal.lat},${terminal.lng},16z?hl=en`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)

    const firstResult = await page.$('a.hfpxzc')
    if (firstResult) {
      try { await firstResult.click({ timeout: 5000 }) }
      catch { await firstResult.click({ force: true, timeout: 3000 }).catch(() => {}) }
      await page.waitForTimeout(1000)
    }

    // Open photo gallery
    const photoBtn = await page.$('button[aria-label="Photos"], button[aria-label^="Photo of"], button[aria-label="See photos"]')
    if (photoBtn) {
      try {
        await photoBtn.click({ timeout: 4000 })
        await page.waitForTimeout(1200)
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const el = document.querySelector('.m6QErb, [role="main"]')
            if (el) el.scrollTop += 600
          }).catch(() => {})
          await page.waitForTimeout(400)
        }
        // Cycle through lightbox
        for (let i = 0; i < MAX_PHOTOS; i++) {
          const next = await page.$('button[aria-label="Next Photo"], button[aria-label="Next photo"]')
          if (next) { try { await next.click({ timeout: 2000 }) } catch {} await page.waitForTimeout(350) }
        }
      } catch {}
    } else {
      await page.evaluate(() => {
        const el = document.querySelector('.m6QErb, [role="main"]')
        if (el) el.scrollTop += 600
      }).catch(() => {})
      await page.waitForTimeout(600)
    }
  } catch (e) {
    log(`  Error: ${e.message.slice(0, 80)}`)
  }

  page.off('request', onRequest)
  state.blockedProfilePics += blocked

  return [...capturedUrls.values()].slice(0, MAX_PHOTOS)
}

// ── main ──────────────────────────────────────────────────────
async function run() {
  state.running = true
  log('Loading terminals...')

  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  let q = 'SELECT id, name, lat, lng, type FROM terminals WHERE lat IS NOT NULL AND lng IS NOT NULL'
  const params = []
  if (TYPE_FILTER) { q += ` AND type = $${params.length + 1}`; params.push(TYPE_FILTER) }
  q += ' ORDER BY RANDOM()'
  if (LIMIT < 999999) { q += ` LIMIT $${params.length + 1}`; params.push(LIMIT) }

  const { rows: terminals } = await pool.query(q, params)
  state.total = terminals.length
  log(`${terminals.length} terminals to process${TYPE_FILTER ? ' (type=' + TYPE_FILTER + ')' : ''}${TEST_MODE ? ' [TEST MODE — no DB writes]' : RESUME ? ' [resume]' : ' [replacing all photos]'}`)

  const done = RESUME ? loadDone() : new Set()

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'en-US',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  for (let i = 0; i < terminals.length; i++) {
    if (stopRequested) { log('Stopped by user.'); break }

    const terminal = terminals[i]
    state.current = terminal.name
    state.currentIdx = i + 1

    if (RESUME && done.has(terminal.id)) {
      state.processed++; state.skipped++
      continue
    }

    log(`[${i + 1}/${state.total}] ${terminal.name}`)

    const gmapsUrls = await scrapeTerminal(page, terminal)

    if (gmapsUrls.length === 0) {
      state.processed++; state.noPhotos++
      log(`  → no photos found`)
      done.add(terminal.id)
      if (state.processed % 20 === 0) saveDone(done)
      await new Promise(r => setTimeout(r, DELAY_MS))
      continue
    }

    // Upload each photo to Cloudinary immediately
    const cloudUrls = []
    for (const url of gmapsUrls) {
      const cUrl = await uploadToCloudinary(url)
      if (cUrl) { cloudUrls.push(cUrl); state.uploaded++ }
    }

    // Save to DB (replace existing photos) — skipped in test mode
    if (cloudUrls.length > 0) {
      if (!TEST_MODE) {
        try {
          await pool.query(
            `UPDATE terminals SET images = $1, updated_at = NOW() WHERE id = $2`,
            [cloudUrls, terminal.id]
          )
          log(`  → ${cloudUrls.length} photos uploaded & saved to DB`)
        } catch (e) {
          log(`  DB error: ${e.message.slice(0, 80)}`)
        }
      } else {
        log(`  → ${cloudUrls.length} photos uploaded to TEST folder (no DB write)`)
      }
      state.results.push({ terminalName: terminal.name, terminalId: terminal.id, photos: cloudUrls })
    } else {
      log(`  → scraped ${gmapsUrls.length} URLs but all failed to upload`)
    }

    state.processed++
    done.add(terminal.id)
    if (state.processed % 10 === 0) saveDone(done)
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  await browser.close()
  await pool.end()
  saveDone(done)

  state.running = false
  state.done = true
  state.current = ''
  log(`Done! ${state.processed} processed, ${state.uploaded} photos uploaded, ${state.noPhotos} terminals with no photos, ${state.blockedProfilePics} profile pic URLs blocked`)
}

// ── HTTP server ───────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>GMaps Import</title>
<style>
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:20px;font-weight:700;margin-bottom:16px}
.scan-status{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.pill{display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:600}
.pill.running{background:#166534;color:#86efac}
.pill.done{background:#1e3a5f;color:#93c5fd}
.pill.idle{background:#374151;color:#d1d5db}
.scan-info{font-size:13px;color:#64748b}
.stop-btn{padding:5px 14px;border-radius:6px;border:none;background:#7f1d1d;color:#fca5a5;font-size:12px;font-weight:600;cursor:pointer}
.stop-btn:hover{background:#991b1b}
.bar-wrap{background:#1e293b;border-radius:8px;overflow:hidden;height:8px;margin-bottom:16px}
.bar{height:100%;background:linear-gradient(90deg,#6366f1,#22c55e);transition:width .4s}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.stat{background:#1e293b;border-radius:10px;padding:12px 16px;min-width:100px}
.stat .val{font-size:24px;font-weight:700;color:#f8fafc}
.stat .lbl{font-size:11px;color:#64748b;margin-top:2px}
hr{border:none;border-top:1px solid #1e293b;margin:0 0 16px}
.review-header{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.review-title{font-size:15px;font-weight:700}
.review-sub{font-size:12px;color:#64748b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:5px}
.thumb{border-radius:6px;overflow:hidden;background:#1e293b;position:relative}
.thumb img{width:100%;height:76px;object-fit:cover;display:block}
.thumb .info{padding:3px 4px;font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log{background:#1e293b;border-radius:8px;padding:12px;font-size:11px;font-family:monospace;color:#64748b;max-height:160px;overflow-y:auto;margin-top:16px}
.log div{padding:1px 0}
.empty{color:#475569;font-size:13px;padding:20px 0}
</style>
</head><body>
<h1>Sakayan GMaps Photo Import</h1>
<div id="app">Loading...</div>
<script>
let isDone=false
function flatPhotos(r){const o=[];for(const t of r)for(const p of t.photos)o.push({url:p,name:t.terminalName});return o}
async function refresh(){
  const d=await fetch('/api/state').then(r=>r.json())
  isDone=d.done
  const pct=d.total>0?Math.round(d.processed/d.total*100):0
  const sc=d.done?'done':d.running?'running':'idle'
  const st=d.done?'Done':d.running?'Importing':'Starting'
  const info=d.running?(d.currentIdx+' / '+d.total+' terminals ('+pct+'%) — '+d.current)
            :d.done?('Complete — '+d.uploaded+' photos imported to '+d.processed+' terminals'):'Loading...'
  const photos=flatPhotos(d.results)
  document.getElementById('app').innerHTML=\`
    <div class="scan-status">
      <span class="pill \${sc}">\${st}</span>
      <span class="scan-info">\${info}</span>
      \${d.running?'<button class="stop-btn" onclick="doStop()">■ Stop</button>':''}
    </div>
    <div class="bar-wrap"><div class="bar" style="width:\${pct}%"></div></div>
    <div class="stats">
      <div class="stat"><div class="val">\${d.total.toLocaleString()}</div><div class="lbl">Terminals</div></div>
      <div class="stat"><div class="val">\${d.processed.toLocaleString()}</div><div class="lbl">Processed</div></div>
      <div class="stat"><div class="val" style="color:#22c55e">\${d.uploaded.toLocaleString()}</div><div class="lbl">Photos imported</div></div>
      <div class="stat"><div class="val" style="color:#94a3b8">\${d.noPhotos.toLocaleString()}</div><div class="lbl">No photos found</div></div>
      <div class="stat"><div class="val" style="color:#f87171">\${d.blockedProfilePics.toLocaleString()}</div><div class="lbl">Profile pics blocked</div></div>
    </div>
    <hr>
    \${photos.length>0?\`
      <div class="review-header">
        <span class="review-title">Imported photos (Cloudinary)</span>
        <span class="review-sub">\${photos.length} so far — these are permanent, no blanks</span>
      </div>
      <div class="grid">\${photos.map(p=>\`
        <div class="thumb" title="\${p.name}">
          <img src="\${p.url}" loading="lazy"/>
          <div class="info">\${p.name}</div>
        </div>\`).join('')}
      </div>
    \`:'<p class="empty">Importing... photos will appear here as they upload to Cloudinary.</p>'}
    <div class="log">\${d.log.map(l=>'<div>'+l+'</div>').join('')}</div>
  \`
}
async function doStop(){ await fetch('/api/stop',{method:'POST'}) }
refresh()
setInterval(()=>{ if(!isDone) refresh() },3000)
</script>
</body></html>`

const server = http.createServer((req, res) => {
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state))
  } else if (req.url === '/api/stop' && req.method === 'POST') {
    stopRequested = true
    log('Stop requested by user')
    res.writeHead(200); res.end('ok')
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
})

server.listen(PORT, () => {
  log(`Import tracker at http://localhost:${PORT}`)
  require('child_process').exec(`start http://localhost:${PORT}`)
  run().catch(e => { log('FATAL: ' + e.message); state.running = false })
})
