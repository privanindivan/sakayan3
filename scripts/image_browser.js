/**
 * Sakayan Image Browser
 * Shows ALL terminal images from the DB — browse, select, delete.
 * No Cloudinary Admin API needed for browsing.
 */

const https = require('https')
const http = require('http')
const { Pool } = require('pg')
const fs = require('fs')

const CLOUD_NAME = 'dmpytrcpl'
const API_KEY = '659219458216645'
const API_SECRET = 'Y-s8TVGEroo2HaFEPDjNGK70oSk'
const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
const PORT = 7788

let allImages = []   // { url, publicId, terminalId, terminalName }
let ready = false

function toPublicId(url) {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
  return m ? m[1] : null
}

async function loadImages() {
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(
    `SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images,1)>0 ORDER BY name`
  )
  await pool.end()
  allImages = []
  for (const row of rows) {
    for (const url of (row.images || [])) {
      const pid = toPublicId(url)
      if (pid) allImages.push({ url, publicId: pid, terminalId: row.id, terminalName: row.name })
    }
  }
  console.log(`Loaded ${allImages.length} images from ${rows.length} terminals`)
  ready = true
}

async function deleteImages(toDelete) {
  const urlSet = new Set(toDelete.map(d => d.url))
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`SELECT id, images FROM terminals WHERE images && $1::text[]`, [[...urlSet]])
  let dbUpdated = 0
  for (const row of rows) {
    const cleaned = (row.images || []).filter(u => !urlSet.has(u))
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

  // Remove from in-memory list
  allImages = allImages.filter(img => !urlSet.has(img.url))
  console.log(`Deleted: ${dbUpdated} terminals updated, ${cloudDeleted} Cloudinary images removed`)
  return { dbUpdated, cloudDeleted }
}

const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><title>Sakayan Image Browser</title>
<style>
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
h1{font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:16px}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:12px 14px;background:#1e293b;border-radius:10px;position:sticky;top:0;z-index:10}
.toolbar button{padding:7px 14px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:600}
.toolbar button:hover{background:#334155}
.del{background:#7f1d1d !important;border-color:#991b1b !important;color:#fca5a5 !important}
.del:hover{background:#991b1b !important}
.del:disabled{background:#1e293b !important;color:#475569 !important;cursor:not-allowed !important;border-color:#334155 !important}
.search{padding:6px 10px;border-radius:6px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:12px;width:180px}
.search::placeholder{color:#475569}
#selcount{font-size:12px;color:#64748b}
.info-bar{font-size:12px;color:#64748b;margin-bottom:14px}
.info-bar b{color:#94a3b8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}
.thumb{border-radius:8px;overflow:hidden;background:#1e293b;cursor:pointer;border:2px solid transparent;transition:border-color .12s;position:relative}
.thumb.sel{border-color:#ef4444}
.thumb img{width:100%;height:90px;object-fit:cover;display:block}
.thumb .label{padding:4px 6px;font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.thumb .chk{position:absolute;top:4px;left:4px;width:17px;height:17px;border-radius:50%;background:rgba(15,23,42,.85);border:2px solid #475569;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700}
.thumb.sel .chk{background:#ef4444;border-color:#ef4444}
.loading{color:#475569;font-size:14px;padding:40px 0;text-align:center}
</style>
</head><body>
<h1>Sakayan Image Browser</h1>
<div id="root"><div class="loading">Loading images...</div></div>
<script>
let all=[], filtered=[], selected=new Set(), searchVal=''

async function init(){
  const d = await fetch('/api/images').then(r=>r.json())
  all = d.images || []
  applyFilter()
  render()
}

function applyFilter(){
  const q = searchVal.toLowerCase()
  filtered = q ? all.filter(img => img.terminalName.toLowerCase().includes(q)) : [...all]
}

function render(){
  const root = document.getElementById('root')
  const selInView = filtered.filter(f => selected.has(f.url)).length
  root.innerHTML = \`
    <div class="toolbar">
      <input class="search" placeholder="Search terminal..." oninput="onSearch(this.value)" value="\${searchVal}">
      <button onclick="selAll()">Select All</button>
      <button onclick="selNone()">Select None</button>
      <span id="selcount">\${selected.size} selected</span>
      <button class="del" id="delBtn" \${selected.size===0?'disabled':''} onclick="doDelete()">🗑 Delete Selected (\${selected.size})</button>
    </div>
    <div class="info-bar">Showing <b>\${filtered.length.toLocaleString()}</b> of <b>\${all.length.toLocaleString()}</b> images</div>
    <div class="grid">\${filtered.map(f=>\`
      <div class="thumb \${selected.has(f.url)?'sel':''}" data-url="\${f.url}" data-pid="\${f.publicId}" data-tid="\${f.terminalId}" onclick="toggle(this)" title="\${f.terminalName}">
        <div class="chk">\${selected.has(f.url)?'✓':''}</div>
        <img src="\${f.url}" loading="lazy" onerror="this.style.opacity='.3'"/>
        <div class="label">\${f.terminalName}</div>
      </div>\`).join('')}
    </div>
  \`
}

function onSearch(v){ searchVal=v; applyFilter(); render() }
function toggle(el){
  const url=el.dataset.url
  if(selected.has(url)){selected.delete(url);el.classList.remove('sel');el.querySelector('.chk').textContent=''}
  else{selected.add(url);el.classList.add('sel');el.querySelector('.chk').textContent='✓'}
  document.getElementById('selcount').textContent=selected.size+' selected'
  document.getElementById('delBtn').disabled=selected.size===0
  document.getElementById('delBtn').textContent='🗑 Delete Selected ('+selected.size+')'
}
function selAll(){filtered.forEach(f=>{selected.add(f.url)});render()}
function selNone(){selected.clear();render()}

async function doDelete(){
  if(!selected.size) return
  if(!confirm('Permanently delete '+selected.size+' images from the site and Cloudinary?')) return
  const payload=[...selected].map(url=>{
    const el=document.querySelector('.thumb[data-url="'+url+'"]')
    return{url,publicId:el?.dataset.pid,terminalId:el?.dataset.tid}
  })
  document.getElementById('delBtn').textContent='Deleting...'
  document.getElementById('delBtn').disabled=true
  const r = await fetch('/api/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const result = await r.json()
  alert('Done! Terminals updated: '+result.dbUpdated+'. Deleted from Cloudinary: '+result.cloudDeleted+'.')
  all = all.filter(f=>!selected.has(f.url))
  selected.clear()
  applyFilter()
  render()
}

init()
</script>
</body></html>`

http.createServer(async (req, res) => {
  if (req.url === '/api/images') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ images: allImages, ready }))
  } else if (req.url === '/api/delete' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try {
        const result = await deleteImages(JSON.parse(body))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch(e) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
  }
}).listen(PORT, () => {
  console.log(`Image browser at http://localhost:${PORT}`)
  require('child_process').exec(`start http://localhost:${PORT}`)
  loadImages().catch(console.error)
})
