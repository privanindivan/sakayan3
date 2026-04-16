/**
 * Google Maps Photo Test Scraper
 * Separate tool — does NOT write to DB or Cloudinary.
 * Scrapes photos per terminal pin and shows live preview at localhost:7789.
 * You can watch the results and stop it if profile pics appear.
 *
 * Usage: node scripts/gmaps_photo_test.js [--limit 20] [--type Jeep]
 */

const { chromium } = require('playwright')
const http = require('http')
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PORT = 7789
const RESULTS_FILE = path.join(__dirname, 'gmaps_photo_test_results.json')
const MAX_PHOTOS_PER_TERMINAL = 4
const DELAY_MS = 2000

const args = process.argv.slice(2)
const limitIdx = args.indexOf('--limit')
const typeIdx = args.indexOf('--type')
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 100
const TYPE_FILTER = typeIdx !== -1 ? args[typeIdx + 1] : null

// ── state ─────────────────────────────────────────────────────
let state = {
  running: false,
  done: false,
  current: '',
  total: 0,
  processed: 0,
  found: 0,
  skipped: 0, // profile pics blocked
  results: [], // { terminalName, terminalId, photos: [url,...] }
  log: []
}

function log(msg) {
  const line = '[' + new Date().toISOString().slice(11, 19) + '] ' + msg
  console.log(line)
  state.log.unshift(line)
  if (state.log.length > 100) state.log.length = 100
}

// ── URL filter — only accept real place photos ─────────────────
function isPlacePhoto(url) {
  if (!url.includes('googleusercontent.com')) return false
  if (url.includes('gps-cs-s/')) return true        // Google place street photos
  if (url.includes('geougc-cs/')) return true        // Google user-generated place content
  if (url.match(/\/p\/AF[0-9a-zA-Z]/)) return true  // Place photos (lh5/lh3)
  return false
}

// ── Extract base photo ID for deduplication ────────────────────
// Strip size params so the same photo at different resolutions counts as one
function photoBaseId(url) {
  return url.replace(/=[whks][0-9].*$/, '').replace(/\?.*$/, '')
}

// ── Normalize URL to a good display size ──────────────────────
function normalizeSize(url) {
  // Replace tiny sizes with w800 for better preview quality
  return url.replace(/=w\d{1,3}(?:-h\d+)?/, '=w800').replace(/=h\d{1,3}(?![\d])/, '=w800')
}

// ── scrape one terminal ───────────────────────────────────────
async function scrapeTerminal(page, terminal) {
  const capturedUrls = new Map() // baseId → full url
  let blockedCount = 0

  const onRequest = req => {
    const url = req.url()
    if (isPlacePhoto(url)) {
      const base = photoBaseId(url)
      // Keep the largest version seen for each unique photo
      const existing = capturedUrls.get(base)
      const existingSize = existing ? (existing.match(/=w(\d+)/) || [,0])[1] : 0
      const newSize = (url.match(/=w(\d+)/) || [,0])[1]
      if (!existing || Number(newSize) > Number(existingSize)) {
        capturedUrls.set(base, normalizeSize(url))
      }
    } else if (url.includes('googleusercontent.com') && (url.includes('/a/') || url.includes('/a-/'))) {
      blockedCount++
    }
  }
  page.on('request', onRequest)

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(terminal.name)}/@${terminal.lat},${terminal.lng},16z?hl=en`
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1000)

    // Click first result if on list page
    const firstResult = await page.$('a.hfpxzc')
    if (firstResult) {
      try { await firstResult.click({ timeout: 5000 }) }
      catch { await firstResult.click({ force: true, timeout: 3000 }).catch(() => {}) }
      await page.waitForTimeout(1000)
    }

    // Try to open the Photos tab directly (grid view — avoids mixing with review photos)
    const photosTab = await page.$('button[aria-label="Photos"], [aria-label="All"], button[jsaction*="pane.photos"]')
    if (photosTab) {
      try {
        await photosTab.click({ timeout: 4000 })
        await page.waitForTimeout(1200)
        // Scroll the photo grid to load more thumbnails
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const grid = document.querySelector('.m6QErb, [role="main"], .DxyBCb')
            if (grid) grid.scrollTop += 800
          }).catch(() => {})
          await page.waitForTimeout(500)
        }
      } catch {}
    }

    // Also click the hero photo to open lightbox and cycle through (triggers full-res URLs)
    const heroBtn = await page.$('button[aria-label^="Photo of"], [data-photo-index], .gallery-image-high-res')
    if (heroBtn) {
      try {
        await heroBtn.click({ timeout: 3000 })
        await page.waitForTimeout(800)
        for (let i = 0; i < Math.min(MAX_PHOTOS_PER_TERMINAL, 4); i++) {
          const next = await page.$('button[aria-label="Next Photo"], button[aria-label="Next photo"]')
          if (next) { try { await next.click({ timeout: 2000 }) } catch {} await page.waitForTimeout(400) }
        }
      } catch {}
    }

    // Fallback scroll if nothing opened
    if (capturedUrls.size === 0) {
      await page.evaluate(() => {
        const panel = document.querySelector('.m6QErb, .DxyBCb, [role="main"]')
        if (panel) panel.scrollTop += 600
      }).catch(() => {})
      await page.waitForTimeout(600)
    }

  } catch (e) {
    log(`  Error: ${e.message.slice(0, 80)}`)
  }

  page.off('request', onRequest)
  state.skipped += blockedCount

  // Return up to MAX_PHOTOS, preferring larger images
  const photos = [...capturedUrls.values()]
    .sort((a, b) => {
      const sa = Number((a.match(/=w(\d+)/) || [,0])[1])
      const sb = Number((b.match(/=w(\d+)/) || [,0])[1])
      return sb - sa
    })
    .slice(0, MAX_PHOTOS_PER_TERMINAL)

  return photos
}

// ── main run ──────────────────────────────────────────────────
let stopRequested = false

async function run() {
  state.running = true
  log('Loading terminals from DB...')

  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  let query = 'SELECT id, name, lat, lng FROM terminals WHERE lat IS NOT NULL'
  const params = []
  if (TYPE_FILTER) { query += ' AND type = $1'; params.push(TYPE_FILTER) }
  query += ` ORDER BY RANDOM() LIMIT $${params.length + 1}`
  params.push(LIMIT)

  const { rows: terminals } = await pool.query(query, params)
  await pool.end()

  state.total = terminals.length
  log(`Starting scrape of ${terminals.length} terminals (limit ${LIMIT})${TYPE_FILTER ? ' type=' + TYPE_FILTER : ''}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
  const page = await context.newPage()

  for (const terminal of terminals) {
    if (stopRequested) { log('Stopped by user.'); break }

    state.current = terminal.name
    log(`[${state.processed + 1}/${state.total}] ${terminal.name}`)

    const photos = await scrapeTerminal(page, terminal)
    state.processed++
    state.found += photos.length

    if (photos.length > 0) {
      const entry = { terminalId: terminal.id, terminalName: terminal.name, photos }
      state.results.push(entry)
      log(`  → ${photos.length} photos found`)
    } else {
      log(`  → no photos`)
    }

    if (!stopRequested) await new Promise(r => setTimeout(r, DELAY_MS))
  }

  await browser.close()

  // Save results to file
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(state.results, null, 2))
  log(`\nDone! ${state.processed} terminals processed, ${state.found} photos found.`)
  log(`Results saved to ${RESULTS_FILE}`)
  log(`Profile pic URLs blocked: ${state.skipped}`)

  state.running = false
  state.done = true
  state.current = ''
}

// ── HTTP server ───────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>GMaps Photo Test</title>
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
.warn{color:#fbbf24;font-size:12px;margin-bottom:14px;padding:8px 12px;background:#1c1208;border-radius:6px;border-left:3px solid #f59e0b}
hr{border:none;border-top:1px solid #1e293b;margin:0 0 16px}
.review-header{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.review-title{font-size:15px;font-weight:700;color:#f8fafc}
.review-sub{font-size:12px;color:#64748b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:5px}
.thumb{border-radius:6px;overflow:hidden;background:#1e293b;position:relative}
.thumb img{width:100%;height:76px;object-fit:cover;display:block}
.thumb img.bad{opacity:.25}
.thumb .info{padding:3px 4px;font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.log{background:#1e293b;border-radius:8px;padding:12px;font-size:11px;font-family:monospace;color:#64748b;max-height:140px;overflow-y:auto;margin-top:16px}
.log div{padding:1px 0}
.empty{color:#475569;font-size:13px;padding:20px 0}
</style>
</head><body>
<h1>GMaps Photo Test Scraper</h1>
<div class="warn">⚠ Not connected to your main site. If you see profile pics or letter avatars below, click Stop.</div>
<div id="app">Loading...</div>
<script>
let isDone=false
function flatPhotos(results){
  const out=[]
  for(const r of results) for(const p of r.photos) out.push({url:p,terminalName:r.terminalName})
  return out
}
async function refresh(){
  const d=await fetch('/api/state').then(r=>r.json())
  isDone=d.done
  const pct=d.total>0?Math.round(d.processed/d.total*100):0
  const sc=d.done?'done':d.running?'running':'idle'
  const st=d.done?'Done':d.running?'Scanning':'Idle'
  const info=d.running?(d.processed+' / '+d.total+' terminals ('+pct+'%)'+(d.current?' — '+d.current:''))
            :d.done?('Complete — '+d.processed+' terminals, '+d.found+' photos')
            :'Starting...'
  const photos=flatPhotos(d.results)
  document.getElementById('app').innerHTML=\`
    <div class="scan-status">
      <span class="pill \${sc}">\${st}</span>
      <span class="scan-info">\${info}</span>
      \${d.running?'<button class="stop-btn" onclick="doStop()">■ Stop</button>':''}
    </div>
    <div class="bar-wrap"><div class="bar" style="width:\${pct}%"></div></div>
    <div class="stats">
      <div class="stat"><div class="val">\${d.total}</div><div class="lbl">Terminals</div></div>
      <div class="stat"><div class="val">\${d.processed}</div><div class="lbl">Processed</div></div>
      <div class="stat"><div class="val" style="color:#22c55e">\${d.found}</div><div class="lbl">Photos found</div></div>
      <div class="stat"><div class="val" style="color:#f87171">\${d.skipped}</div><div class="lbl">Profile pics blocked</div></div>
    </div>
    <hr>
    \${photos.length>0?\`
      <div class="review-header">
        <span class="review-title">Photos scraped so far</span>
        <span class="review-sub">\${photos.length} total</span>
      </div>
      <div class="grid">\${photos.map(p=>\`
        <div class="thumb" title="\${p.terminalName}">
          <img src="/proxy?url=\${encodeURIComponent(p.url)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
          <div class="broken" style="display:none;width:100%;height:76px;background:#1e293b;align-items:center;justify-content:center;font-size:18px;color:#334155">✕</div>
          <div class="info">\${p.terminalName}</div>
        </div>\`).join('')}
      </div>
    \`:'<p class="empty">No photos yet — scan in progress...</p>'}
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
    res.writeHead(200)
    res.end('ok')
  } else if (req.url.startsWith('/proxy?url=')) {
    // Proxy Google Maps images with proper Referer header so they don't 403
    const targetUrl = decodeURIComponent(req.url.slice('/proxy?url='.length))
    const parsed = new URL(targetUrl)
    const isHttps = parsed.protocol === 'https:'
    const lib = isHttps ? require('https') : http
    const proxyReq = lib.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'Referer': 'https://www.google.com/maps/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    }, proxyRes => {
      res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'image/jpeg' })
      proxyRes.pipe(res)
    })
    proxyReq.on('error', () => { res.writeHead(502); res.end() })
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
})

server.listen(PORT, () => {
  log(`Test scraper at http://localhost:${PORT}`)
  require('child_process').exec(`start http://localhost:${PORT}`)
  run().catch(e => { log('FATAL: ' + e.message); state.running = false })
})
