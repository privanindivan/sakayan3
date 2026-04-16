const { Pool } = require('pg')
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const CLOUD_NAME = 'dmpytrcpl'
const API_KEY = '659219458216645'
const API_SECRET = 'Y-s8TVGEroo2HaFEPDjNGK70oSk'
const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
let TOTAL = 0  // set dynamically from Cloudinary listing
const PROGRESS_FILE = path.join(__dirname, 'face_scan_progress.json')
const IMAGE_LIST_FILE = path.join(__dirname, 'face_scan_image_list.json')
const TRACKER_PORT = 7788

// ── live state ──────────────────────────────────────────────
let state = { status: 'starting', checked: 0, flagged: [], recentFlags: [], errors: 0, rateLimitWait: false, done: false }

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) }
  catch { return { checkedUrls: [], flagged: [] } }
}
function saveProgress(checkedUrls, flagged) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ checkedUrls, flagged }))
}

// ── tracker HTTP server ──────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Sakayan Face Scan</title>
<style>
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:2px}
.scan-status{display:flex;align-items:center;gap:10px;margin-bottom:18px;margin-top:6px}
.pill{display:inline-block;padding:3px 11px;border-radius:20px;font-size:12px;font-weight:600}
.pill.running{background:#166534;color:#86efac}
.pill.waiting{background:#713f12;color:#fde68a}
.pill.done{background:#1e3a5f;color:#93c5fd}
.pill.starting{background:#374151;color:#d1d5db}
.scan-info{font-size:13px;color:#64748b}
.bar-wrap{background:#1e293b;border-radius:8px;overflow:hidden;height:8px;margin-bottom:18px}
.bar{height:100%;background:linear-gradient(90deg,#6366f1,#22c55e);transition:width 0.5s}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:22px}
.stat{background:#1e293b;border-radius:10px;padding:12px 16px;min-width:110px}
.stat .val{font-size:24px;font-weight:700;color:#f8fafc}
.stat .lbl{font-size:11px;color:#64748b;margin-top:2px}
.divider{border:none;border-top:1px solid #1e293b;margin:0 0 18px}
.review-header{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.review-title{font-size:15px;font-weight:700;color:#f8fafc}
.review-sub{font-size:12px;color:#64748b}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.toolbar button{padding:6px 13px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600}
.toolbar button:hover{background:#334155}
.toolbar .del{background:#7f1d1d;border-color:#991b1b;color:#fca5a5}
.toolbar .del:hover{background:#991b1b}
.toolbar .del:disabled{background:#1e293b;color:#475569;cursor:not-allowed;border-color:#334155}
#selcount{font-size:12px;color:#64748b;margin-left:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:5px}
.thumb{border-radius:6px;overflow:hidden;background:#1e293b;cursor:pointer;border:2px solid transparent;transition:border-color .15s;position:relative}
.thumb.sel{border-color:#ef4444}
.thumb img{width:100%;height:76px;object-fit:cover;display:block}
.thumb .info{padding:3px 4px;font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thumb .badge{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.8);color:#f87171;font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700}
.thumb .chk{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#0f172a;border:2px solid #475569;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff}
.thumb.sel .chk{background:#ef4444;border-color:#ef4444}
.empty{color:#475569;font-size:13px;padding:20px 0}
</style>
</head><body>
<h1>Sakayan Face Scan</h1>
<div id="app">Loading...</div>
<script>
let allFlagged=[], selected=new Set(), isDone=false

function renderGrid(){
  if(!allFlagged.length) return '<p class="empty">No flagged images yet — scan in progress...</p>'
  return \`
    <div class="review-header">
      <span class="review-title">\${isDone?'Review & Delete':'Flagged so far'}</span>
      <span class="review-sub">\${allFlagged.length} image\${allFlagged.length!==1?'s':''} \${isDone?'to review':'found'}</span>
    </div>
    <div class="toolbar">
      <button onclick="selAll()">Select All</button>
      <button onclick="selNone()">Select None</button>
      <button onclick="selFaces()">Faces Only</button>
      <button onclick="selAvatars()">Avatars Only</button>
      <span id="selcount">0 selected</span>
      <button class="del" id="delBtn" disabled onclick="doDelete()">🗑 Delete Selected</button>
    </div>
    <div class="grid">\${allFlagged.map(f=>\`
      <div class="thumb \${selected.has(f.url)?'sel':''}" data-url="\${f.url}" data-pid="\${f.publicId}" data-tid="\${f.terminalId||''}" data-face="\${f.faceCount>0}" data-avatar="\${f.isAvatar}" onclick="toggle(this)" title="\${f.terminalName} — \${f.reason}">
        <div class="chk">\${selected.has(f.url)?'✓':''}</div>
        <img src="\${f.url}" loading="lazy" onerror="this.style.background='#334155';this.alt='⚠';this.style.display='flex';this.style.alignItems='center';this.style.justifyContent='center';this.style.fontSize='20px';this.style.height='76px'"/>
        <div class="badge">\${f.isAvatar?'av':'f'+f.faceCount}</div>
        <div class="info">\${f.terminalName}</div>
      </div>\`).join('')}
    </div>
  \`
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
function selFaces(){document.querySelectorAll('.thumb[data-face="true"]').forEach(c=>{selected.add(c.dataset.url);c.classList.add('sel');c.querySelector('.chk').textContent='✓'});updateSelCount()}
function selAvatars(){document.querySelectorAll('.thumb[data-avatar="true"]').forEach(c=>{selected.add(c.dataset.url);c.classList.add('sel');c.querySelector('.chk').textContent='✓'});updateSelCount()}

async function doDelete(){
  if(!selected.size) return
  if(!confirm('Delete '+selected.size+' images from the site and Cloudinary?')) return
  const payload=[...selected].map(url=>{
    const c=document.querySelector('.thumb[data-url="'+url+'"]')
    return{url,publicId:c?.dataset.pid,terminalId:c?.dataset.tid||null}
  })
  const btn=document.getElementById('delBtn')
  btn.textContent='Deleting...'
  btn.disabled=true
  const r=await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const result=await r.json()
  alert('Done! Terminals updated: '+result.dbUpdated+'. Deleted from Cloudinary: '+result.cloudDeleted+'.')
  for(const url of selected){
    document.querySelector('.thumb[data-url="'+url+'"]')?.remove()
    allFlagged=allFlagged.filter(f=>f.url!==url)
  }
  selected.clear()
  updateSelCount()
  btn.textContent='🗑 Delete Selected'
  document.querySelector('.review-sub').textContent=allFlagged.length+' image'+(allFlagged.length!==1?'s':'')+' to review'
}

async function refresh(){
  const d=await fetch('/api/progress').then(r=>r.json())
  allFlagged=d.allFlagged||[]
  isDone=d.done
  const pct=d.total>0?Math.round(d.checked/d.total*100):0
  const statusClass=d.done?'done':d.rateLimitWait?'waiting':d.checked>0?'running':'starting'
  let pillText='Starting'
  let infoText='Loading images from Cloudinary...'
  if(d.done){
    pillText='Done'
    infoText='Scan complete \u2014 '+d.checked.toLocaleString()+' images checked'
  } else if(d.rateLimitWait && d.rateLimitResetAt){
    const mins=Math.ceil((d.rateLimitResetAt-Date.now())/60000)
    pillText='Paused'
    infoText='Rate limited — resumes in '+mins+' min'
  } else if(d.checked>0){
    pillText='Scanning'
    infoText=d.checked.toLocaleString()+' / '+d.total.toLocaleString()+' images checked ('+pct+'%)'
  }

  document.getElementById('app').innerHTML=\`
    <div class="scan-status">
      <span class="pill \${statusClass}">\${pillText}</span>
      <span class="scan-info">\${infoText}</span>
    </div>
    <div class="bar-wrap"><div class="bar" style="width:\${pct}%"></div></div>
    <div class="stats">
      <div class="stat"><div class="val">\${d.total.toLocaleString()}</div><div class="lbl">Total images</div></div>
      <div class="stat"><div class="val">\${d.checked.toLocaleString()}</div><div class="lbl">Checked</div></div>
      <div class="stat"><div class="val" style="color:#f87171">\${d.flagged}</div><div class="lbl">Flagged</div></div>
      <div class="stat"><div class="val" style="color:#fbbf24">\${d.errors}</div><div class="lbl">Errors</div></div>
    </div>
    <hr class="divider">
    \${renderGrid()}
  \`
  updateSelCount()
}

refresh()
setInterval(()=>{ if(!isDone) refresh() },5000)
</script>
</body></html>`

http.createServer(async (req, res) => {
  if (req.url === '/api/progress') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      total: TOTAL || state.checked,
      checked: state.checked,
      flagged: state.flagged.length,
      errors: state.errors,
      rateLimitWait: state.rateLimitWait,
      rateLimitResetAt: state.rateLimitResetAt || null,
      done: state.done,
      allFlagged: state.flagged,
    }))
  } else if (req.url === '/api/delete' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try {
        const toDelete = JSON.parse(body)
        const { dbUpdated, cloudDeleted } = await deleteImages(toDelete)
        // Remove from state and persist so restarts don't show deleted images
        const delUrls = new Set(toDelete.map(d => d.url))
        state.flagged = state.flagged.filter(f => !delUrls.has(f.url))
        // Update progress file to remove deleted entries
        try {
          const prog = loadProgress()
          prog.flagged = state.flagged
          saveProgress(prog.checkedUrls || [], state.flagged)
        } catch(e) { console.error('Failed to update progress file:', e.message) }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ dbUpdated, cloudDeleted }))
      } catch(e) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
}).listen(TRACKER_PORT, () => {
  console.log(`Tracker: http://localhost:${TRACKER_PORT}`)
  exec(`start http://localhost:${TRACKER_PORT}`)
})

// ── helpers ──────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function toPublicId(url) {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
  return m ? m[1] : null
}

function checkImage(publicId) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUD_NAME}/resources/image/upload/${encodeURIComponent(publicId)}?faces=true&colors=true`,
      method: 'GET',
      headers: { Authorization: AUTH }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (j.error) {
            const rateLimited = j.error.message?.toLowerCase().includes('rate') || res.statusCode === 420 || res.statusCode === 429
            resolve({ faces: [], colors: [], error: j.error.message, rateLimited })
          } else {
            resolve({ faces: j.faces || [], colors: j.colors || [], width: j.width, height: j.height })
          }
        } catch { resolve({ faces: [], colors: [], error: 'parse' }) }
      })
    })
    req.on('error', e => resolve({ faces: [], colors: [], error: e.message }))
    req.end()
  })
}

function isLetterAvatar(result) {
  if (!result.colors || !result.width) return false
  const ratio = Math.max(result.width, result.height) / Math.min(result.width, result.height)
  if (ratio > 1.5) return false
  const top = result.colors[0]
  return Array.isArray(top) && parseFloat(top[1]) > 55
}

// ── delete selected images ───────────────────────────────────
async function deleteImages(toDelete) {
  const urlSet = new Set(toDelete.map(d => d.url))
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const res = await pool.query(`SELECT id, images FROM terminals WHERE images && $1::text[]`, [[...urlSet]])
  let dbUpdated = 0
  for (const row of res.rows) {
    const cleaned = (row.images || []).filter(img => !urlSet.has(img))
    if (cleaned.length !== (row.images || []).length) {
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
      const req = https.request({
        hostname: 'api.cloudinary.com',
        path: `/v1_1/${CLOUD_NAME}/resources/image/upload?${params}`,
        method: 'DELETE',
        headers: { Authorization: AUTH }
      }, r => {
        let data = ''
        r.on('data', c => data += c)
        r.on('end', () => {
          try { const j = JSON.parse(data); cloudDeleted += j.deleted ? Object.keys(j.deleted).length : 0 } catch {}
          resolve()
        })
      })
      req.on('error', resolve)
      req.end()
    })
  }
  console.log(`Deleted: DB ${dbUpdated} terminals, Cloudinary ${cloudDeleted} images`)
  return { dbUpdated, cloudDeleted }
}

// ── list all Cloudinary images (cached to disk) ───────────────
async function listAllCloudinaryImages() {
  // Use cached list if available — avoids burning API rate limit on every restart
  try {
    const cached = JSON.parse(fs.readFileSync(IMAGE_LIST_FILE, 'utf8'))
    if (Array.isArray(cached) && cached.length > 0) {
      console.log(`Using cached image list: ${cached.length} images`)
      return cached
    }
  } catch {}

  const images = []
  let nextCursor = null
  let page = 0
  do {
    page++
    let qs = 'max_results=500'
    if (nextCursor) qs += '&next_cursor=' + encodeURIComponent(nextCursor)
    const result = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.cloudinary.com',
        path: `/v1_1/${CLOUD_NAME}/resources/image/upload?${qs}`,
        method: 'GET',
        headers: { Authorization: AUTH }
      }, res => {
        let d = ''
        res.on('data', c => d += c)
        res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } })
      })
      req.on('error', reject)
      req.end()
    })
    if (result.error) throw new Error('Cloudinary list error: ' + result.error.message)
    for (const r of (result.resources || [])) {
      const url = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${r.public_id}.${r.format}`
      images.push({ terminalId: null, terminalName: r.public_id, url, publicId: r.public_id })
    }
    nextCursor = result.next_cursor || null
    console.log(`  Cloudinary page ${page}: ${images.length} images listed so far`)
    if (nextCursor) await sleep(300)
  } while (nextCursor)

  // Cache to disk so restarts don't re-list
  fs.writeFileSync(IMAGE_LIST_FILE, JSON.stringify(images))
  console.log(`Image list cached to disk (${images.length} images)`)
  return images
}

// ── enrich images with terminal names from DB ─────────────────
async function enrichWithTerminalNames(images) {
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images, 1) > 0`)
  await pool.end()
  const urlToTerminal = {}
  for (const row of rows) {
    for (const imgUrl of (row.images || [])) {
      urlToTerminal[imgUrl] = { id: row.id, name: row.name }
    }
  }
  for (const img of images) {
    const t = urlToTerminal[img.url]
    if (t) { img.terminalId = t.id; img.terminalName = t.name }
    else img.terminalName = '(orphaned) ' + img.publicId.split('/').pop()
  }
}

// ── main scan loop ────────────────────────────────────────────
async function runScan() {
  console.log('Listing all images from Cloudinary...')
  let allImages
  try {
    allImages = await listAllCloudinaryImages()
  } catch(e) {
    if (e.message.includes('Rate Limit')) {
      // Wait until top of next hour then retry
      const resetAt = new Date()
      resetAt.setUTCHours(resetAt.getUTCHours() + 1, 0, 0, 0)
      state.rateLimitWait = true
      state.rateLimitResetAt = resetAt.getTime()
      console.log(`Rate limited during listing. Waiting until ${resetAt.toUTCString()}`)
      await sleep(resetAt.getTime() - Date.now())
      state.rateLimitWait = false
      state.rateLimitResetAt = null
      allImages = await listAllCloudinaryImages()
    } else throw e
  }
  TOTAL = allImages.length
  console.log(`Total Cloudinary images: ${TOTAL}`)
  console.log('Enriching with terminal names...')
  await enrichWithTerminalNames(allImages)

  const progress = loadProgress()
  const checkedSet = new Set(progress.checkedUrls || [])
  state.flagged = progress.flagged || []
  state.recentFlags = state.flagged.slice(-20)
  state.checked = checkedSet.size

  const remaining = allImages.filter(img => !checkedSet.has(img.url))
  console.log(`Total: ${allImages.length} | Already checked: ${checkedSet.size} | Remaining: ${remaining.length}`)

  state.status = 'running'
  let batchCount = 0

  for (let i = 0; i < remaining.length; i++) {
    const img = remaining[i]
    const result = await checkImage(img.publicId)

    if (result.rateLimited) {
      const resetAt = Date.now() + 60 * 60 * 1000
      state.rateLimitWait = true
      state.rateLimitResetAt = resetAt
      saveProgress([...checkedSet], state.flagged)
      console.log(`Rate limited. Waiting until ${new Date(resetAt).toLocaleTimeString()}...`)
      await sleep(resetAt - Date.now())
      state.rateLimitWait = false
      state.rateLimitResetAt = null
      i--
      continue
    }

    if (result.error) { state.errors++; checkedSet.add(img.url); state.checked = checkedSet.size; batchCount++; continue }

    checkedSet.add(img.url)
    state.checked = checkedSet.size
    batchCount++

    const hasFace = result.faces?.length > 0
    const isAvatar = isLetterAvatar(result)

    if (hasFace || isAvatar) {
      const reason = [hasFace && `${result.faces.length} face(s)`, isAvatar && 'letter avatar'].filter(Boolean).join(', ')
      const entry = { terminalId: img.terminalId, terminalName: img.terminalName, url: img.url, publicId: img.publicId, reason, faceCount: result.faces?.length || 0, isAvatar }
      state.flagged.push(entry)
      state.recentFlags.push(entry)
      if (state.recentFlags.length > 50) state.recentFlags.shift()
      console.log(`FLAG [${reason}]: ${img.terminalName}`)
    }

    if (batchCount % 50 === 0) {
      console.log(`[${state.checked}/${TOTAL}] flagged: ${state.flagged.length}`)
      saveProgress([...checkedSet], state.flagged)
    }

    if (batchCount % 3 === 0) await sleep(200)
  }

  saveProgress([...checkedSet], state.flagged)
  state.done = true
  console.log(`\nDone! Checked: ${state.checked} | Flagged: ${state.flagged.length}`)
  console.log(`Open http://localhost:${TRACKER_PORT} to review and delete flagged images.`)
}

runScan().catch(e => { console.error(e); state.status = 'error' })
