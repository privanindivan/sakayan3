const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const PORT = 7790
const AUTH = 'Basic ' + Buffer.from('659219458216645:Y-s8TVGEroo2HaFEPDjNGK70oSk').toString('base64')
const CLOUD = 'dmpytrcpl'
const DB_URL = process.env.DATABASE_URL.replace(':5432/', ':6543/')

function toPublicId(url) {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
  return m ? m[1] : null
}

function thumb(url) {
  return url.includes('cloudinary.com')
    ? url.replace('/upload/', '/upload/c_fill,w_160,h_120,q_auto,f_auto/')
    : url
}

async function loadTerminals() {
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(
    `SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images,1)>0 ORDER BY name ASC`
  )
  await pool.end()
  return rows
}

async function deleteImages(toDelete) {
  const urlSet = new Set(toDelete.map(d => d.url))
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`SELECT id, images FROM terminals WHERE images && $1::text[]`, [[...urlSet]])
  let dbUpdated = 0
  for (const row of rows) {
    const cleaned = (row.images || []).filter(u => !urlSet.has(u))
    if (cleaned.length !== (row.images || []).length) {
      await pool.query(`UPDATE terminals SET images = CASE WHEN $1::text[] = '{}' THEN NULL ELSE $1::text[] END WHERE id = $2`, [cleaned, row.id])
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
        path: `/v1_1/${CLOUD}/resources/image/upload?${params}`,
        method: 'DELETE',
        headers: { Authorization: AUTH }
      }, r => {
        let d = ''; r.on('data', c => d += c)
        r.on('end', () => { try { const j = JSON.parse(d); cloudDeleted += j.deleted ? Object.keys(j.deleted).length : 0 } catch {} resolve() })
      })
      req.on('error', resolve); req.end()
    })
  }
  return { dbUpdated, cloudDeleted }
}

const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Sakayan Photo Review</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0}
#header{position:sticky;top:0;background:#0f172a;border-bottom:1px solid #1e293b;padding:10px 14px;z-index:100;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
h1{font-size:16px;font-weight:700;color:#f8fafc;flex-shrink:0}
#stats{font-size:12px;color:#64748b;flex-shrink:0}
.toolbar{display:flex;gap:6px;margin-left:auto;align-items:center;flex-wrap:wrap}
.toolbar button{padding:5px 12px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600}
.toolbar button:hover{background:#334155}
#delBtn{background:#7f1d1d!important;border-color:#991b1b!important;color:#fca5a5!important}
#delBtn:hover{background:#991b1b!important}
#delBtn:disabled{background:#1e293b!important;color:#475569!important;border-color:#334155!important;cursor:not-allowed!important}
#selcount{font-size:12px;color:#64748b;white-space:nowrap}
#grid{padding:10px 14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px}
.photo{position:relative;aspect-ratio:4/3;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .1s}
.photo.sel{border-color:#ef4444}
.photo img{width:100%;height:100%;object-fit:cover;display:block;background:#1e293b}
.photo .chk{position:absolute;top:4px;left:4px;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,.6);border:2px solid #475569;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff}
.photo.sel .chk{background:#ef4444;border-color:#ef4444}
.photo .label{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.75));padding:16px 4px 4px;font-size:9px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#empty{text-align:center;color:#475569;padding:60px;font-size:14px}
#toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#16a34a;color:#fff;padding:10px 20px;border-radius:24px;font-size:14px;font-weight:600;display:none;z-index:999;box-shadow:0 4px 16px rgba(0,0,0,.4)}
#loading{text-align:center;padding:60px;color:#475569;font-size:14px}
</style>
</head><body>
<div id="header">
  <h1>Sakayan Photo Review</h1>
  <div id="stats">Loading...</div>
  <div class="toolbar">
    <button onclick="selAll()">Select All</button>
    <button onclick="selNone()">Select None</button>
    <span id="selcount">0 selected</span>
    <button id="delBtn" disabled onclick="doDelete()">🗑 Delete Selected</button>
  </div>
</div>
<div id="loading">Loading all photos...</div>
<div id="grid" style="display:none"></div>
<div id="empty" style="display:none">No photos</div>
<div id="toast"></div>

<script>
let allPhotos = [], selected = new Set()

async function load() {
  const r = await fetch('/api/terminals')
  const terminals = await r.json()
  allPhotos = []
  for (const t of terminals) {
    for (const url of t.images) {
      const pid = toPublicId(url)
      allPhotos.push({ url, publicId: pid||'', terminalName: t.name, terminalId: t.id })
    }
  }
  document.getElementById('loading').style.display = 'none'
  document.getElementById('grid').style.display = 'grid'
  document.getElementById('stats').textContent = allPhotos.length + ' photos · ' + terminals.length + ' terminals'
  render()
}

function render() {
  const grid = document.getElementById('grid')
  document.getElementById('empty').style.display = allPhotos.length ? 'none' : 'block'
  grid.innerHTML = allPhotos.map((p, i) => {
    const sel = selected.has(i)
    return \`<div class="photo \${sel?'sel':''}" data-i="\${i}" onclick="toggle(this)">
      <div class="chk">\${sel?'✓':''}</div>
      <img src="\${thumb(p.url)}" loading="lazy" onerror="this.style.background='#334155'">
      <div class="label">\${p.terminalName}</div>
    </div>\`
  }).join('')
  updateCount()
}

function thumb(url) {
  return url.includes('cloudinary.com') ? url.replace('/upload/','/upload/c_fill,w_160,h_120,q_auto,f_auto/') : url
}
function toPublicId(url) {
  const m = url.match(/\\/upload\\/(?:v\\d+\\/)?(.+?)(?:\\.\\w+)?\$/)
  return m ? m[1] : null
}

function toggle(el) {
  const i = +el.dataset.i
  if (selected.has(i)) { selected.delete(i); el.classList.remove('sel'); el.querySelector('.chk').textContent='' }
  else { selected.add(i); el.classList.add('sel'); el.querySelector('.chk').textContent='✓' }
  updateCount()
}
function selAll() {
  document.querySelectorAll('.photo').forEach(el => { selected.add(+el.dataset.i); el.classList.add('sel'); el.querySelector('.chk').textContent='✓' })
  updateCount()
}
function selNone() {
  selected.clear()
  document.querySelectorAll('.photo').forEach(el => { el.classList.remove('sel'); el.querySelector('.chk').textContent='' })
  updateCount()
}
function updateCount() {
  document.getElementById('selcount').textContent = selected.size + ' selected'
  document.getElementById('delBtn').disabled = selected.size === 0
}

async function doDelete() {
  if (!selected.size) return
  if (!confirm('Delete ' + selected.size + ' photo(s)? Cannot be undone.')) return
  const btn = document.getElementById('delBtn')
  btn.textContent = 'Deleting...'
  btn.disabled = true
  const toDelete = [...selected].map(i => ({ url: allPhotos[i].url, publicId: allPhotos[i].publicId }))
  const r = await fetch('/api/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(toDelete) })
  const res = await r.json()
  const deletedUrls = new Set(toDelete.map(d => d.url))
  allPhotos = allPhotos.filter(p => !deletedUrls.has(p.url))
  selected.clear()
  document.getElementById('stats').textContent = allPhotos.length + ' photos remaining'
  toast('Deleted ' + (res.cloudDeleted||0) + ' photos')
  btn.textContent = '🗑 Delete Selected'
  render()
}

function toast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg; el.style.display = 'block'
  setTimeout(() => el.style.display='none', 3000)
}

load()
</script>
</body></html>`

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    return res.end(HTML)
  }

  if (req.method === 'GET' && req.url === '/api/terminals') {
    const rows = await loadTerminals()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(rows))
  }

  if (req.method === 'POST' && req.url === '/api/delete') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      const toDelete = JSON.parse(body)
      const result = await deleteImages(toDelete)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    })
    return
  }

  res.writeHead(404); res.end()
})

server.listen(PORT, () => {
  console.log(`Photo Review: http://localhost:${PORT}`)
  require('child_process').exec(`start http://localhost:${PORT}`)
})
