const http = require('http')
const { Pool } = require('pg')
const fs = require('fs')
const { exec } = require('child_process')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const PORT = 7789

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

const TYPE_COLORS = {
  Jeep: '#F59E0B',
  Bus: '#3B82F6',
  UV: '#10B981',
  Tricycle: '#EC4899',
  Train: '#8B5CF6',
  Ferry: '#06B6D4',
  Other: '#94A3B8'
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sakayan Route Entry</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}
header{background:#1e293b;border-bottom:1px solid #334155;padding:14px 20px;display:flex;align-items:center;gap:10px}
header h1{font-size:18px;font-weight:700;color:#f8fafc}
header .badge{background:#334155;color:#94a3b8;font-size:11px;padding:3px 8px;border-radius:20px}
.layout{display:grid;grid-template-columns:400px 1fr;min-height:calc(100vh - 53px)}
.form-panel{background:#1e293b;border-right:1px solid #334155;padding:20px;overflow-y:auto}
.list-panel{padding:20px;overflow-y:auto}
.field{margin-bottom:14px}
label{display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
.search-wrap{position:relative}
input[type=text],input[type=number],select{width:100%;background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:10px 12px;border-radius:8px;font-size:14px;outline:none}
input[type=text]:focus,input[type=number]:focus,select:focus{border-color:#6366f1}
.dropdown{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#1e293b;border:1px solid #334155;border-radius:8px;max-height:220px;overflow-y:auto;z-index:100;display:none}
.dropdown.open{display:block}
.dd-item{padding:10px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #1e293b}
.dd-item:hover,.dd-item.active{background:#334155}
.dd-item .type{font-size:11px;color:#64748b;margin-top:2px}
.selected-tag{background:#334155;border-radius:8px;padding:10px 12px;font-size:14px;color:#e2e8f0;display:flex;align-items:center;justify-content:space-between}
.selected-tag .clr{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:6px}
.selected-tag button{background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;line-height:1}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.color-grid{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.color-btn{width:32px;height:32px;border-radius:6px;border:3px solid transparent;cursor:pointer;transition:border-color .15s}
.color-btn.sel{border-color:#fff}
.btn-submit{width:100%;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px;transition:background .15s}
.btn-submit:hover{background:#4f46e5}
.btn-submit:disabled{background:#334155;color:#64748b;cursor:not-allowed}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none}
.toast.err{background:#ef4444}
.toast.show{opacity:1}
.list-title{font-size:14px;font-weight:700;color:#64748b;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.list-title span{background:#334155;color:#94a3b8;font-size:11px;padding:2px 8px;border-radius:20px}
.conn-card{background:#1e293b;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;border:1px solid #334155}
.conn-dot{width:12px;height:12px;border-radius:50%;flex-shrink:0}
.conn-info{flex:1;min-width:0}
.conn-route{font-size:13px;font-weight:600;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.conn-sub{font-size:11px;color:#64748b;margin-top:2px}
.conn-fare{font-size:13px;font-weight:700;color:#22c55e;flex-shrink:0}
.conn-del{background:none;border:none;color:#475569;cursor:pointer;font-size:16px;padding:4px;border-radius:4px;flex-shrink:0}
.conn-del:hover{color:#ef4444}
.empty{color:#475569;font-size:13px;text-align:center;padding:40px 0}
.swap-btn{background:none;border:1px solid #334155;color:#94a3b8;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:14px;width:100%}
.swap-btn:hover{border-color:#6366f1;color:#6366f1}
</style>
</head>
<body>
<header>
  <h1>Sakayan Route Entry</h1>
  <div class="badge" id="termCount">Loading terminals...</div>
</header>
<div class="layout">
  <div class="form-panel">
    <div class="field">
      <label>From Terminal</label>
      <div class="search-wrap" id="fromWrap">
        <input type="text" id="fromInput" placeholder="Search terminal..." autocomplete="off">
        <div class="dropdown" id="fromDrop"></div>
      </div>
      <div id="fromTag" style="display:none;margin-top:6px"></div>
    </div>

    <button class="swap-btn" onclick="swapTerminals()">⇅ Swap From / To</button>

    <div class="field">
      <label>To Terminal</label>
      <div class="search-wrap" id="toWrap">
        <input type="text" id="toInput" placeholder="Search terminal..." autocomplete="off">
        <div class="dropdown" id="toDrop"></div>
      </div>
      <div id="toTag" style="display:none;margin-top:6px"></div>
    </div>

    <div class="row2">
      <div class="field">
        <label>Vehicle Type</label>
        <select id="vtype">
          <option value="Jeep">Jeepney</option>
          <option value="Bus">Bus</option>
          <option value="UV">UV Express</option>
          <option value="Tricycle">Tricycle</option>
          <option value="Train">Train / MRT / LRT</option>
          <option value="Ferry">Ferry / Boat</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="field">
        <label>Fare (PHP)</label>
        <input type="number" id="fare" placeholder="e.g. 15" min="0" step="1">
      </div>
    </div>

    <div class="field">
      <label>Line Color</label>
      <div class="color-grid" id="colorGrid"></div>
    </div>

    <div class="field">
      <label>Duration (minutes, optional)</label>
      <input type="number" id="duration" placeholder="e.g. 20" min="0" step="1">
    </div>

    <button class="btn-submit" id="submitBtn" onclick="submitConnection()">Add Connection</button>
  </div>

  <div class="list-panel">
    <div class="list-title">Recently Added <span id="recentCount">0</span></div>
    <div id="recentList"><div class="empty">No connections added yet</div></div>
  </div>
</div>
<div class="toast" id="toast"></div>

<script>
const TYPE_COLORS = ${JSON.stringify(TYPE_COLORS)}
const PRESETS = Object.values(TYPE_COLORS)
let terminals = []
let fromId = null, toId = null
let selectedColor = '#F59E0B'
let recent = []

// ── init ─────────────────────────────────────────────────────
async function init() {
  const res = await fetch('/api/terminals')
  terminals = await res.json()
  document.getElementById('termCount').textContent = terminals.length + ' terminals'
  buildColorGrid()
  setupSearch('from')
  setupSearch('to')
  loadRecent()
}

function buildColorGrid() {
  const grid = document.getElementById('colorGrid')
  const all = [...new Set([...PRESETS, '#4A90D9','#EF4444','#F97316','#A855F7'])]
  all.forEach(c => {
    const btn = document.createElement('button')
    btn.className = 'color-btn' + (c === selectedColor ? ' sel' : '')
    btn.style.background = c
    btn.title = c
    btn.onclick = () => { selectedColor = c; document.querySelectorAll('.color-btn').forEach(b=>b.classList.remove('sel')); btn.classList.add('sel') }
    grid.appendChild(btn)
  })
}

// auto-set color when type changes
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('vtype').addEventListener('change', e => {
    const c = TYPE_COLORS[e.target.value]
    if (c) {
      selectedColor = c
      document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.toggle('sel', b.title === c)
      })
    }
  })
})

// ── terminal search ───────────────────────────────────────────
function setupSearch(which) {
  const input = document.getElementById(which + 'Input')
  const drop = document.getElementById(which + 'Drop')
  let idx = -1

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    if (!q) { drop.classList.remove('open'); return }
    const matches = terminals.filter(t => t.name.toLowerCase().includes(q)).slice(0, 30)
    drop.innerHTML = matches.map((t,i) => \`<div class="dd-item" data-i="\${i}" onclick="selectTerminal('\${which}','\${t.id}','\${t.name.replace(/'/g,"\\\\'")}','\${t.type}')">
      \${t.name}<div class="type">\${t.type}</div>
    </div>\`).join('')
    drop.classList.toggle('open', matches.length > 0)
    idx = -1
  })

  input.addEventListener('keydown', e => {
    const items = drop.querySelectorAll('.dd-item')
    if (e.key === 'ArrowDown') { idx = Math.min(idx+1, items.length-1); highlight(items, idx); e.preventDefault() }
    if (e.key === 'ArrowUp') { idx = Math.max(idx-1, 0); highlight(items, idx); e.preventDefault() }
    if (e.key === 'Enter' && idx >= 0) { items[idx].click(); e.preventDefault() }
    if (e.key === 'Escape') { drop.classList.remove('open') }
  })

  document.addEventListener('click', e => {
    if (!e.target.closest('#' + which + 'Wrap') && !e.target.closest('#' + which + 'Tag')) {
      drop.classList.remove('open')
    }
  })
}

function highlight(items, idx) {
  items.forEach((el,i) => el.classList.toggle('active', i===idx))
  if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' })
}

function selectTerminal(which, id, name, type) {
  const drop = document.getElementById(which + 'Drop')
  const input = document.getElementById(which + 'Input')
  const tag = document.getElementById(which + 'Tag')
  drop.classList.remove('open')
  input.style.display = 'none'

  if (which === 'from') fromId = id
  else toId = id

  const color = TYPE_COLORS[type] || '#94A3B8'
  tag.style.display = 'flex'
  tag.innerHTML = \`<div class="selected-tag"><span><span class="clr" style="background:\${color}"></span>\${name} <small style="color:#64748b">(\${type})</small></span><button onclick="clearTerminal('\${which}')">×</button></div>\`
}

function clearTerminal(which) {
  if (which === 'from') fromId = null
  else toId = null
  document.getElementById(which + 'Input').style.display = ''
  document.getElementById(which + 'Input').value = ''
  document.getElementById(which + 'Tag').style.display = 'none'
}

function swapTerminals() {
  const tmpId = fromId, tmpName = document.getElementById('fromTag').innerHTML
  const fromTag = document.getElementById('fromTag'), toTag = document.getElementById('toTag')
  const fromInput = document.getElementById('fromInput'), toInput = document.getElementById('toInput')

  if (!fromId && !toId) return

  // swap IDs
  fromId = toId; toId = tmpId

  // swap tag HTML
  const toHtml = toTag.innerHTML
  fromTag.innerHTML = toHtml; toTag.innerHTML = tmpName

  // fix onclick in tags
  fromTag.querySelectorAll('button').forEach(b => b.onclick = () => clearTerminal('from'))
  toTag.querySelectorAll('button').forEach(b => b.onclick = () => clearTerminal('to'))

  // fix display
  fromTag.style.display = fromId ? 'block' : 'none'
  fromInput.style.display = fromId ? 'none' : ''
  if (!fromId) fromInput.value = ''

  toTag.style.display = toId ? 'block' : 'none'
  toInput.style.display = toId ? 'none' : ''
  if (!toId) toInput.value = ''
}

// ── submit ────────────────────────────────────────────────────
async function submitConnection() {
  if (!fromId || !toId) { showToast('Select both terminals', true); return }
  if (fromId === toId) { showToast('From and To cannot be the same', true); return }

  const btn = document.getElementById('submitBtn')
  btn.disabled = true
  btn.textContent = 'Saving...'

  const fare = parseFloat(document.getElementById('fare').value) || null
  const durMin = parseInt(document.getElementById('duration').value) || null
  const vtype = document.getElementById('vtype').value

  try {
    const res = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_id: fromId,
        to_id: toId,
        color: selectedColor,
        fare,
        duration_secs: durMin ? durMin * 60 : null,
        budget_level: fare == null ? 'medium' : fare <= 15 ? 'low' : fare <= 30 ? 'medium' : 'high',
        vehicle_type: vtype
      })
    })
    if (!res.ok) throw new Error(await res.text())
    const conn = await res.json()
    showToast('Connection added!')
    recent.unshift(conn)
    renderRecent()
    // reset form
    clearTerminal('from'); clearTerminal('to')
    document.getElementById('fare').value = ''
    document.getElementById('duration').value = ''
  } catch(e) {
    showToast('Error: ' + e.message, true)
  }

  btn.disabled = false
  btn.textContent = 'Add Connection'
}

// ── recent list ───────────────────────────────────────────────
async function loadRecent() {
  const res = await fetch('/api/connections/recent')
  recent = await res.json()
  renderRecent()
}

function renderRecent() {
  document.getElementById('recentCount').textContent = recent.length
  if (!recent.length) {
    document.getElementById('recentList').innerHTML = '<div class="empty">No connections added yet</div>'
    return
  }
  document.getElementById('recentList').innerHTML = recent.map(c => \`
    <div class="conn-card">
      <div class="conn-dot" style="background:\${c.color||'#4A90D9'}"></div>
      <div class="conn-info">
        <div class="conn-route">\${c.from_name} → \${c.to_name}</div>
        <div class="conn-sub">\${c.vehicle_type||'?'} · \${formatAgo(c.created_at)}</div>
      </div>
      <div class="conn-fare">\${c.fare != null ? '₱'+c.fare : '—'}</div>
      <button class="conn-del" onclick="deleteConn('\${c.id}')" title="Delete">🗑</button>
    </div>
  \`).join('')
}

function formatAgo(ts) {
  const sec = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return Math.floor(sec/60) + 'm ago'
  if (sec < 86400) return Math.floor(sec/3600) + 'h ago'
  return Math.floor(sec/86400) + 'd ago'
}

async function deleteConn(id) {
  if (!confirm('Delete this connection?')) return
  await fetch('/api/connections/' + id, { method: 'DELETE' })
  recent = recent.filter(c => c.id !== id)
  renderRecent()
  showToast('Deleted')
}

function showToast(msg, err=false) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = 'toast' + (err?' err':'') + ' show'
  setTimeout(() => t.classList.remove('show'), 3000)
}

init()
</script>
</body>
</html>`

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  // Serve HTML
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(HTML)
    return
  }

  // GET /api/terminals
  if (req.method === 'GET' && req.url === '/api/terminals') {
    try {
      const { rows } = await pool.query(
        `SELECT id, name, type, lat, lng FROM terminals ORDER BY name ASC`
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(rows))
    } catch(e) {
      res.writeHead(500); res.end(e.message)
    }
    return
  }

  // GET /api/connections/recent
  if (req.method === 'GET' && req.url === '/api/connections/recent') {
    try {
      const { rows } = await pool.query(`
        SELECT c.id, c.from_id, c.to_id, c.color, c.fare, c.duration_secs, c.budget_level, c.type AS vehicle_type, c.created_at,
          tf.name AS from_name,
          tt.name AS to_name
        FROM connections c
        LEFT JOIN terminals tf ON tf.id = c.from_id
        LEFT JOIN terminals tt ON tt.id = c.to_id
        ORDER BY c.created_at DESC
        LIMIT 50
      `)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(rows))
    } catch(e) {
      res.writeHead(500); res.end(e.message)
    }
    return
  }

  // POST /api/connections
  if (req.method === 'POST' && req.url === '/api/connections') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', async () => {
      try {
        const { from_id, to_id, color, fare, duration_secs, budget_level, vehicle_type } = JSON.parse(body)

        // Build straight-line geometry from terminal coords
        const { rows: terms } = await pool.query(
          `SELECT id, lat, lng FROM terminals WHERE id = ANY($1)`,
          [[from_id, to_id]]
        )
        const fromT = terms.find(t => t.id === from_id)
        const toT = terms.find(t => t.id === to_id)

        const geometry = fromT && toT ? {
          type: 'LineString',
          coordinates: [[fromT.lng, fromT.lat], [toT.lng, toT.lat]]
        } : null

        const { rows } = await pool.query(`
          INSERT INTO connections (from_id, to_id, color, fare, duration_secs, waypoints, budget_level, type, geometry)
          VALUES ($1, $2, $3, $4, $5, '[]', $6, $7, $8)
          RETURNING id, from_id, to_id, color, fare, duration_secs, budget_level, type, created_at
        `, [from_id, to_id, color, fare, duration_secs, budget_level, vehicle_type, geometry ? JSON.stringify(geometry) : null])

        const conn = rows[0]
        // attach names and display type
        conn.from_name = fromT?.name || ''
        conn.to_name = toT?.name || ''
        conn.vehicle_type = vehicle_type

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(conn))
        console.log(`[+] ${conn.from_name} → ${conn.to_name} (${vehicle_type}, ₱${fare ?? '?'})`)
      } catch(e) {
        console.error(e)
        res.writeHead(500); res.end(e.message)
      }
    })
    return
  }

  // DELETE /api/connections/:id
  const delMatch = req.url.match(/^\/api\/connections\/([a-f0-9-]+)$/)
  if (req.method === 'DELETE' && delMatch) {
    try {
      await pool.query(`DELETE FROM connections WHERE id = $1`, [delMatch[1]])
      res.writeHead(200); res.end('ok')
    } catch(e) {
      res.writeHead(500); res.end(e.message)
    }
    return
  }

  res.writeHead(404); res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`Route Entry Tool running at http://localhost:${PORT}`)
  exec(`start http://localhost:${PORT}`)
})
