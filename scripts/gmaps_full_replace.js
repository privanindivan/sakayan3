/**
 * Full Photo Replace — deletes all old Cloudinary images then re-imports from Google Maps
 * Live tracker at localhost:7789 with grid view + delete feature
 *
 * Usage: node scripts/gmaps_full_replace.js
 *   --skip-delete   skip Cloudinary wipe, go straight to import
 *   --skip-import   only wipe, don't import
 *   --resume        resume import from where it stopped
 */

require('dotenv').config({ path: '.env.local' })
const { chromium } = require('playwright')
const http = require('http')
const { Pool } = require('pg')
const cloudinary = require('cloudinary').v2
const fs = require('fs')
const path = require('path')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PORT = 7789
const PROGRESS_FILE = path.join(__dirname, 'gmaps_import_progress.json')
const MAX_PHOTOS = 4
const DELAY_MS = 600

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dmpytrcpl',
  api_key: process.env.CLOUDINARY_API_KEY || '659219458216645',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Y-s8TVGEroo2HaFEPDjNGK70oSk',
})

const args = process.argv.slice(2)
const SKIP_DELETE = args.includes('--skip-delete') || fs.existsSync(PROGRESS_FILE)
const SKIP_IMPORT = args.includes('--skip-import')
const RESUME = args.includes('--resume') || fs.existsSync(PROGRESS_FILE)

let state = {
  phase: 'idle',      // idle | deleting | importing | done
  paused: false,
  deleteTotal: 0, deleteCount: 0,
  total: 0, processed: 0, uploaded: 0, noPhotos: 0, blockedPics: 0,
  current: '', currentIdx: 0,
  results: [],        // { terminalName, terminalId, photos: [url] }
  log: []
}
let stopRequested = false
let pauseRequested = false
let doneSet = new Set()      // module-level so deleteSelected can remove terminals for re-scrape
let requeuedIds = new Set()  // terminal IDs removed from doneSet — save progress file immediately after re-scraping these
let retryBrokenIds = new Set() // terminal IDs queued for immediate broken-photo retry

function log(msg) {
  const line = '[' + new Date().toISOString().slice(11,19) + '] ' + msg
  console.log(line)
  state.log.unshift(line)
  if (state.log.length > 200) state.log.length = 200
}

// ── URL filter ────────────────────────────────────────────────
function isPlacePhoto(url) {
  if (!url.includes('googleusercontent.com')) return false
  if (url.includes('gps-cs-s/')) return true
  if (url.includes('geougc-cs/')) return true
  if (url.match(/\/p\/AF[0-9a-zA-Z]/)) return true
  return false
}
function photoBaseId(url) { return url.replace(/=[whks][0-9].*$/, '').replace(/\?.*$/, '') }
function bestSize(url) { return url.replace(/=w\d+(-h\d+)?.*$/, '=w1200') }

// ── Cloudinary wipe ───────────────────────────────────────────
async function wipeCloudinary() {
  log('=== Phase 1: Deleting old Cloudinary images ===')
  state.phase = 'deleting'
  let round = 0
  while (!stopRequested) {
    round++
    try {
      const result = await cloudinary.api.delete_resources_by_prefix('sakayan/terminals', { max_results: 1000 })
      const count = Object.keys(result.deleted || {}).length
      state.deleteCount += count
      log(`  Round ${round}: deleted ${count} (total: ${state.deleteCount})`)
      if (count < 100) break  // no more left
      await new Promise(r => setTimeout(r, 800))
    } catch(e) {
      log(`  Cloudinary delete error: ${e.message}`)
      if (e.message.includes('Rate Limit')) {
        log('  Rate limited — waiting 60s...')
        await new Promise(r => setTimeout(r, 60000))
      } else break
    }
  }
  log(`=== Cloudinary wipe done. Deleted: ${state.deleteCount} images ===`)
}

// ── upload to Cloudinary ──────────────────────────────────────
async function uploadPhoto(imageUrl) {
  try {
    const res = await cloudinary.uploader.upload(imageUrl, {
      folder: 'sakayan/terminals', resource_type: 'image',
      fetch_format: 'auto', quality: 'auto',
    })
    return res.secure_url
  } catch {
    try {
      const clean = imageUrl.replace(/=[whks][0-9].*$/, '')
      const res = await cloudinary.uploader.upload(clean, {
        folder: 'sakayan/terminals', resource_type: 'image',
        fetch_format: 'auto', quality: 'auto',
      })
      return res.secure_url
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
      const existW = Number((capturedUrls.get(base) || '').match(/=w(\d+)/)?.[1] || 0)
      const newW = Number((url.match(/=w(\d+)/) || [,0])[1])
      if (newW > existW) capturedUrls.set(base, bestSize(url))
    } else if (url.includes('googleusercontent.com') && (url.includes('/a/') || url.includes('/a-/'))) {
      blocked++
    }
  }
  page.on('request', onRequest)
  try {
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(terminal.name)}/@${terminal.lat},${terminal.lng},16z?hl=en`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(600)
    const first = await page.$('a.hfpxzc')
    if (first) { try { await first.click({ timeout: 5000 }) } catch { await first.click({ force: true, timeout: 3000 }).catch(() => {}) }; await page.waitForTimeout(700) }
    const photoBtn = await page.$('button[aria-label="Photos"], button[aria-label^="Photo of"], button[aria-label="See photos"]')
    if (photoBtn) {
      try {
        await photoBtn.click({ timeout: 4000 }); await page.waitForTimeout(1200)
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => { const el = document.querySelector('.m6QErb,[role="main"]'); if(el) el.scrollTop += 600 }).catch(()=>{})
          await page.waitForTimeout(400)
        }
        for (let i = 0; i < MAX_PHOTOS; i++) {
          const next = await page.$('button[aria-label="Next Photo"],button[aria-label="Next photo"]')
          if (next) { try { await next.click({ timeout: 2000 }) } catch {} await page.waitForTimeout(350) }
        }
      } catch {}
    } else {
      await page.evaluate(() => { const el = document.querySelector('.m6QErb,[role="main"]'); if(el) el.scrollTop += 600 }).catch(()=>{})
      await page.waitForTimeout(600)
    }
  } catch(e) {
    log(`  Error: ${e.message.slice(0,80)}`)
    page.off('request', onRequest)
    state.blockedPics += blocked
    if (e.message.includes('crashed') || e.message.includes('Target closed') || e.message.includes('has been closed') || e.message.includes('context or browser')) return null
    return [...capturedUrls.values()].slice(0, MAX_PHOTOS)
  }
  page.off('request', onRequest)
  state.blockedPics += blocked
  return [...capturedUrls.values()].slice(0, MAX_PHOTOS)
}

// ── delete selected images (for manual review UI) ─────────────
async function deleteSelected(toDelete) {
  const urlSet = new Set(toDelete.map(d => d.url))
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`SELECT id, images FROM terminals WHERE images && $1::text[]`, [[...urlSet]])
  let dbUpdated = 0
  for (const row of rows) {
    const cleaned = (row.images || []).filter(u => !urlSet.has(u))
    if (cleaned.length !== row.images.length) {
      await pool.query(`UPDATE terminals SET images = $1 WHERE id = $2`, [cleaned, row.id])
      dbUpdated++
    }
  }
  await pool.end()
  const publicIds = toDelete.map(d => d.publicId).filter(Boolean)
  let cloudDeleted = 0
  for (let i = 0; i < publicIds.length; i += 100) {
    const batch = publicIds.slice(i, i + 100)
    await new Promise(resolve => {
      const params = batch.map(id => `public_ids[]=${encodeURIComponent(id)}`).join('&')
      const req = require('https').request({ hostname: 'api.cloudinary.com', path: `/v1_1/dmpytrcpl/resources/image/upload?${params}`, method: 'DELETE', headers: { Authorization: 'Basic ' + Buffer.from('659219458216645:Y-s8TVGEroo2HaFEPDjNGK70oSk').toString('base64') } }, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => { try { const j = JSON.parse(d); cloudDeleted += j.deleted ? Object.keys(j.deleted).length : 0 } catch {} resolve() })
      })
      req.on('error', resolve); req.end()
    })
  }
  // Remove terminals that now have 0 photos from the done set so the loop re-scrapes them
  const terminalIdsDeleted = new Set(toDelete.map(d => d.terminalId))
  state.results = state.results.filter(r => {
    r.photos = r.photos.filter(p => !urlSet.has(p.url))
    if (r.photos.length === 0) {
      doneSet.delete(r.terminalId)
      requeuedIds.add(r.terminalId)
      return false
    }
    return true
  })
  // Update progress file so re-scrape survives restarts too
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet])) } catch {}
  return { dbUpdated, cloudDeleted, requeued: terminalIdsDeleted.size }
}

// ── main ──────────────────────────────────────────────────────
async function run() {
  if (!SKIP_DELETE) await wipeCloudinary()
  if (SKIP_IMPORT || stopRequested) { state.phase = 'done'; return }

  log('=== Phase 2: Importing from Google Maps ===')
  state.phase = 'importing'

  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

  // ── Auto-cleanup: fetch all existing Cloudinary public_ids, strip broken DB urls ──
  log('Checking Cloudinary for broken photo URLs...')
  const cloudIds = new Set()
  try {
    let nextCursor = null
    do {
      const opts = { type: 'upload', prefix: 'sakayan/terminals', max_results: 500 }
      if (nextCursor) opts.next_cursor = nextCursor
      const res = await cloudinary.api.resources(opts)
      for (const r of res.resources) cloudIds.add(r.public_id)
      nextCursor = res.next_cursor || null
    } while (nextCursor)
    log(`Cloudinary has ${cloudIds.size} photos`)
  } catch(e) { log(`Warning: Cloudinary check failed — ${e.message.slice(0,80)}`) }

  // Load all terminals with photos, fix broken ones in-memory then batch update DB
  const { rows: existing } = await pool.query(`SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY name`)
  const nullIds = [], updates = []
  for (const row of existing) {
    if (cloudIds.size === 0) {
      // Cloudinary check failed — just show all as-is
      state.results.push({ terminalName: row.name, terminalId: row.id, photos: row.images.map(u => ({ url: u, publicId: u.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1] || '' })) })
      state.uploaded += row.images.length
      continue
    }
    const good = row.images.filter(u => { const pid = u.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1] || ''; return cloudIds.has(pid) })
    if (good.length < row.images.length) {
      if (good.length === 0) { nullIds.push(row.id); requeuedIds.add(row.id) }
      else updates.push({ id: row.id, images: good })
    }
    if (good.length > 0) {
      state.results.push({ terminalName: row.name, terminalId: row.id, photos: good.map(u => ({ url: u, publicId: u.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1] || '' })) })
      state.uploaded += good.length
    }
  }
  // Batch DB cleanup
  if (nullIds.length > 0) {
    await pool.query(`UPDATE terminals SET images = NULL WHERE id = ANY($1::uuid[])`, [nullIds])
    log(`Cleared broken images from ${nullIds.length} terminals — will re-scrape`)
  }
  for (const u of updates) await pool.query(`UPDATE terminals SET images = $1 WHERE id = $2`, [u.images, u.id])
  if (updates.length > 0) log(`Trimmed broken URLs from ${updates.length} terminals`)
  log(`Loaded ${state.results.length} terminals with existing photos from DB`)

  const { rows: terminals } = await pool.query('SELECT id, name, lat, lng FROM terminals WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY RANDOM()')
  state.total = terminals.length
  log(`${terminals.length} terminals to scrape`)

  let savedIds = []
  if (RESUME && fs.existsSync(PROGRESS_FILE)) {
    try { savedIds = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) } catch {}
  }
  doneSet = new Set(savedIds)
  // Remove broken terminals from doneSet so they get re-scraped
  for (const id of requeuedIds) doneSet.delete(id)
  if (requeuedIds.size > 0) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet]))
    log(`Queued ${requeuedIds.size} broken terminals for re-scrape`)
  }
  if (doneSet.size > 0) log(`Resuming from progress file — ${doneSet.size} terminals already done`)

  let browser = await chromium.launch({ headless: true })
  let ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
  let page = await ctx.newPage()

  async function restartBrowser() {
    try { await browser.close() } catch {}
    browser = await chromium.launch({ headless: true })
    ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' })
    page = await ctx.newPage()
    log('  Browser restarted.')
  }

  let crashCount = 0

  for (let i = 0; i < terminals.length; i++) {
    if (stopRequested) { log('Stopped.'); break }
    const t = terminals[i]
    state.current = t.name; state.currentIdx = i + 1
    // Pause loop — wait until resumed
    while (pauseRequested && !stopRequested) await new Promise(r => setTimeout(r, 500))
    if (stopRequested) { log('Stopped.'); break }

    if (doneSet.has(t.id) && !requeuedIds.has(t.id)) { state.processed++; continue }

    log(`[${i+1}/${state.total}] ${t.name}`)
    let gmapsUrls = await scrapeTerminal(page, t)
    if (gmapsUrls === null) {
      // page crashed — restart browser and retry this terminal
      await restartBrowser()
      gmapsUrls = await scrapeTerminal(page, t) || []
      crashCount = 0
    } else if (gmapsUrls.length === 0) {
      crashCount++
      if (crashCount >= 5) { crashCount = 0; await restartBrowser() }
    } else {
      crashCount = 0
    }

    if (!gmapsUrls.length) {
      state.processed++; state.noPhotos++
      log(`  → no photos`)
      doneSet.add(t.id)
      if (requeuedIds.has(t.id)) { requeuedIds.delete(t.id); fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet])) }
      else if (state.processed % 20 === 0) fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet]))
      await new Promise(r => setTimeout(r, DELAY_MS))
      continue
    }

    const cloudUrls = []
    for (const url of gmapsUrls) {
      const cu = await uploadPhoto(url)
      if (cu) { cloudUrls.push(cu); state.uploaded++ }
    }

    if (cloudUrls.length > 0) {
      try {
        await pool.query(`UPDATE terminals SET images = $1, updated_at = NOW() WHERE id = $2`, [cloudUrls, t.id])
        const newPhotos = cloudUrls.map(u => ({ url: u, publicId: u.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1] || '' }))
        const existing = state.results.find(r => r.terminalId === t.id)
        if (existing) existing.photos = newPhotos
        else state.results.push({ terminalName: t.name, terminalId: t.id, photos: newPhotos })
        log(`  → ${cloudUrls.length} photos saved`)
      } catch(e) { log(`  DB error: ${e.message.slice(0,60)}`) }
    }

    state.processed++
    doneSet.add(t.id)
    // Save immediately for requeued terminals so they never get re-scraped again after one retry
    if (requeuedIds.has(t.id)) { requeuedIds.delete(t.id); fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet])) }
    else if (state.processed % 10 === 0) fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet]))
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  await browser.close(); await pool.end()
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...doneSet]))
  state.phase = 'done'; state.current = ''
  log(`=== Done! ${state.uploaded} photos imported across ${state.processed} terminals ===`)
}

// ── HTML UI ───────────────────────────────────────────────────
const HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"><title>Sakayan Photo Import</title>
<style>
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:20px;font-weight:700;margin-bottom:16px}
.scan-status{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.pill{padding:3px 11px;border-radius:20px;font-size:12px;font-weight:600}
.pill.idle,.pill.starting{background:#374151;color:#d1d5db}
.pill.deleting{background:#713f12;color:#fde68a}
.pill.importing{background:#166534;color:#86efac}
.pill.done{background:#1e3a5f;color:#93c5fd}
.scan-info{font-size:13px;color:#64748b;flex:1}
.stop-btn{padding:5px 14px;border-radius:6px;border:none;background:#7f1d1d;color:#fca5a5;font-size:12px;font-weight:600;cursor:pointer}
.stop-btn:hover{background:#991b1b}
.bar-wrap{background:#1e293b;border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden}
.bar{height:100%;background:linear-gradient(90deg,#f59e0b,#22c55e);transition:width .4s}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.stat{background:#1e293b;border-radius:10px;padding:12px 16px;min-width:100px}
.stat .val{font-size:22px;font-weight:700}
.stat .lbl{font-size:11px;color:#64748b;margin-top:2px}
hr{border:none;border-top:1px solid #1e293b;margin:0 0 14px}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.toolbar button{padding:6px 13px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600}
.toolbar button:hover{background:#334155}
.del{background:#7f1d1d !important;border-color:#991b1b !important;color:#fca5a5 !important}
.del:disabled{background:#1e293b !important;color:#475569 !important;cursor:not-allowed !important}
#selcount{font-size:12px;color:#64748b}
.review-header{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.review-title{font-size:15px;font-weight:700}
.review-sub{font-size:12px;color:#64748b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:5px}
.thumb{border-radius:6px;overflow:hidden;background:#1e293b;cursor:pointer;border:2px solid transparent;transition:border-color .12s;position:relative}
.thumb.sel{border-color:#ef4444}
.thumb img{width:100%;height:76px;object-fit:cover;display:block}
.thumb .info{padding:3px 4px;font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thumb .chk{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:rgba(15,23,42,.85);border:2px solid #475569;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700}
.thumb.sel .chk{background:#ef4444;border-color:#ef4444}
.log{background:#1e293b;border-radius:8px;padding:12px;font-size:11px;font-family:monospace;color:#64748b;max-height:160px;overflow-y:auto;margin-top:16px}
.log div{padding:1px 0}
.empty{color:#475569;font-size:13px;padding:20px 0}
</style></head><body>
<h1>Sakayan Photo Import</h1>
<div id="app">Loading...</div>
<script>
let allPhotos=[], selected=new Set(), isDone=false

function flatPhotos(results){
  const out=[]
  for(const r of results) for(const p of r.photos) out.push({url:p.url,publicId:p.publicId,terminalId:r.terminalId,terminalName:r.terminalName})
  return out
}

let isPaused=false
async function refresh(){
  const d=await fetch('/api/state').then(r=>r.json())
  isPaused=d.paused||false
  isDone=d.phase==='done'
  const isDeleting=d.phase==='deleting'
  const isImporting=d.phase==='importing'
  const pct=isDeleting?(d.deleteTotal>0?Math.round(d.deleteCount/d.deleteTotal*100):0)
           :isImporting?(d.total>0?Math.round(d.processed/d.total*100):0):isDone?100:0
  const pillClass=d.phase
  const pillText=d.phase==='deleting'?'Clearing old photos':d.phase==='importing'?'Importing':d.phase==='done'?'Done':'Starting'
  let info=''
  if(d.phase==='deleting') info='Deleting old Cloudinary images... '+d.deleteCount+' removed so far'
  else if(d.phase==='importing') info=d.currentIdx+' / '+d.total+' terminals'+(d.current?' — '+d.current:'')
  else if(d.phase==='done') info='Complete — '+d.uploaded+' photos imported'
  else info='Starting...'

  allPhotos=flatPhotos(d.results)
  document.getElementById('app').innerHTML=\`
    <div class="scan-status">
      <span class="pill \${pillClass}">\${pillText}</span>
      <span class="scan-info">\${info}</span>
      \${!isDone?\`
        <button class="stop-btn" onclick="doStop()">■ Stop</button>
        \${d.paused
          ? '<button onclick="doResume()" style="padding:5px 14px;border-radius:6px;border:none;background:#166534;color:#86efac;font-size:12px;font-weight:600;cursor:pointer">▶ Resume</button>'
          : '<button onclick="doPause()" style="padding:5px 14px;border-radius:6px;border:none;background:#1e3a5f;color:#93c5fd;font-size:12px;font-weight:600;cursor:pointer">⏸ Pause</button>'}
      \`:''}
    </div>
    <div class="bar-wrap"><div class="bar" style="width:\${pct}%"></div></div>
    <div class="stats">
      \${isDeleting||isDone?'<div class="stat"><div class="val" style="color:#f87171">'+d.deleteCount+'</div><div class="lbl">Old photos deleted</div></div>':''}
      <div class="stat"><div class="val">\${d.total.toLocaleString()}</div><div class="lbl">Terminals</div></div>
      <div class="stat"><div class="val">\${d.processed.toLocaleString()}</div><div class="lbl">Processed</div></div>
      <div class="stat"><div class="val" style="color:#22c55e">\${d.uploaded.toLocaleString()}</div><div class="lbl">Photos imported</div></div>
      <div class="stat"><div class="val" style="color:#94a3b8">\${d.noPhotos.toLocaleString()}</div><div class="lbl">No photos</div></div>
      <div class="stat"><div class="val" style="color:#f87171">\${d.blockedPics.toLocaleString()}</div><div class="lbl">Profile pics blocked</div></div>
    </div>
    <hr>
    \${allPhotos.length>0?\`
      <div class="review-header">
        <span class="review-title">Imported photos</span>
        <span class="review-sub">\${allPhotos.length.toLocaleString()} total</span>
      </div>
      <div class="toolbar">
        <button onclick="selAll()">Select All</button>
        <button onclick="selNone()">Select None</button>
        <span id="selcount">0 selected</span>
        <button class="del" id="delBtn" disabled onclick="doDelete()">🗑 Delete Selected</button>
      </div>
      <div class="grid">\${allPhotos.map(p=>\`
        <div class="thumb \${selected.has(p.url)?'sel':''}" data-url="\${p.url}" data-pid="\${p.publicId}" data-tid="\${p.terminalId}" onclick="toggle(this)" title="\${p.terminalName}">
          <div class="chk">\${selected.has(p.url)?'✓':''}</div>
          <img src="\${p.url}" loading="lazy"/>
          <div class="info">\${p.terminalName}</div>
        </div>\`).join('')}
      </div>
    \`:'<p class="empty">'+(d.phase==='deleting'?'Clearing old photos first, import will start after...':'Photos will appear here as they upload...')+'</p>'}
    <div class="log">\${d.log.map(l=>'<div>'+l+'</div>').join('')}</div>
  \`
  updateSelCount()
}

function updateSelCount(){
  const el=document.getElementById('selcount')
  if(el) el.textContent=selected.size+' selected'
  const btn=document.getElementById('delBtn')
  if(btn) btn.disabled=selected.size===0
}
function toggle(el){
  const url=el.dataset.url
  if(selected.has(url)){selected.delete(url);el.classList.remove('sel');el.querySelector('.chk').textContent=''}
  else{selected.add(url);el.classList.add('sel');el.querySelector('.chk').textContent='✓'}
  updateSelCount()
}
function selAll(){document.querySelectorAll('.thumb').forEach(c=>{selected.add(c.dataset.url);c.classList.add('sel');c.querySelector('.chk').textContent='✓'});updateSelCount()}
function selNone(){selected.clear();document.querySelectorAll('.thumb').forEach(c=>{c.classList.remove('sel');c.querySelector('.chk').textContent=''});updateSelCount()}
async function doStop(){ await fetch('/api/stop',{method:'POST'}) }
async function doPause(){ await fetch('/api/pause',{method:'POST'}); refresh() }
async function doResume(){ await fetch('/api/resume',{method:'POST'}); refresh() }
async function doDelete(){
  if(!selected.size) return
  if(!confirm('Delete '+selected.size+' photos from site and Cloudinary?')) return
  const payload=[...selected].map(url=>{
    const el=document.querySelector('.thumb[data-url="'+url+'"]')
    return{url,publicId:el?.dataset.pid,terminalId:el?.dataset.tid}
  })
  document.getElementById('delBtn').textContent='Deleting...'
  document.getElementById('delBtn').disabled=true
  const r=await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const res=await r.json()
  alert('Deleted '+res.cloudDeleted+' from Cloudinary, updated '+res.dbUpdated+' terminals.')
  for(const url of selected) document.querySelector('.thumb[data-url="'+url+'"]')?.remove()
  selected.clear(); updateSelCount()
  document.getElementById('delBtn').textContent='🗑 Delete Selected'
}
refresh()
setInterval(()=>{ if(!isDone && !isPaused) refresh() },3000)
</script></body></html>`

// ── server ────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(state))
  } else if (req.url === '/api/stop' && req.method === 'POST') {
    stopRequested = true; log('Stop requested')
    res.writeHead(200); res.end('ok')
  } else if (req.url === '/api/pause' && req.method === 'POST') {
    pauseRequested = true; state.paused = true; log('Paused')
    res.writeHead(200); res.end('ok')
  } else if (req.url === '/api/resume' && req.method === 'POST') {
    pauseRequested = false; state.paused = false; log('Resumed')
    res.writeHead(200); res.end('ok')
  } else if (req.url === '/api/delete' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try {
        const result = await deleteSelected(JSON.parse(body))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch(e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })) }
    })
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
})

process.on('uncaughtException', e => log('Uncaught: ' + e.message))
process.on('unhandledRejection', e => log('Unhandled: ' + (e?.message || e)))

server.listen(PORT, () => {
  log(`Tracker at http://localhost:${PORT}`)
  require('child_process').exec(`start http://localhost:${PORT}`)
  run().catch(e => { log('FATAL: ' + e.message); state.phase = 'done' })
})
