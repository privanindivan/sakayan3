const { Pool } = require('pg')
const https = require('https')
const fs = require('fs')

const CLOUD_NAME = 'dmpytrcpl'
const API_KEY = '659219458216645'
const API_SECRET = 'Y-s8TVGEroo2HaFEPDjNGK70oSk'
const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')

const CONCURRENCY = 3
const PROGRESS_FILE = 'scripts/face_scan_progress.json'
const RESULTS_FILE = 'scripts/face_scan_results.json'

function toPublicId(url) {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)
  return m ? m[1] : null
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Check one image — returns faces array + color info
function checkImage(publicId) {
  return new Promise((resolve) => {
    const path = `/v1_1/${CLOUD_NAME}/resources/image/upload/${encodeURIComponent(publicId)}?faces=true&colors=true`
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path,
      method: 'GET',
      headers: { Authorization: AUTH }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try {
          const j = JSON.parse(data)
          if (j.error) {
            const isRate = j.error.message?.includes('Rate') || j.error.message?.includes('420') || res.statusCode === 420 || res.statusCode === 429
            resolve({ publicId, faces: [], colors: [], error: j.error.message, rateLimited: isRate })
          } else {
            resolve({
              publicId,
              faces: j.faces || [],
              colors: j.colors || [],
              width: j.width,
              height: j.height,
              format: j.format,
            })
          }
        } catch {
          resolve({ publicId, faces: [], colors: [], error: 'parse error' })
        }
      })
    })
    req.on('error', e => resolve({ publicId, faces: [], colors: [], error: e.message }))
    req.end()
  })
}

// Detect if image looks like a Google default profile avatar
// (single dominant color background, small/square, few colors)
function isLetterAvatar(result) {
  if (!result.colors || !result.width) return false
  const { width, height, colors } = result
  // Typically square-ish and small
  const ratio = Math.max(width, height) / Math.min(width, height)
  if (ratio > 1.5) return false  // not square enough
  // Check if one color dominates 60%+
  if (colors.length > 0) {
    const topColor = colors[0]
    // colors format: [[color_hex, percentage], ...]
    if (Array.isArray(topColor) && topColor.length >= 2) {
      const pct = parseFloat(topColor[1])
      if (pct > 55) return true
    }
  }
  return false
}

// Load progress
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
  } catch {
    return { checkedUrls: [], flagged: [] }
  }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const res = await pool.query(`SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images, 1) > 0`)
  await pool.end()

  // Build flat list
  const allImages = []
  for (const row of res.rows) {
    for (const url of row.images) {
      const pid = toPublicId(url)
      if (pid) allImages.push({ terminalId: row.id, terminalName: row.name, url, publicId: pid })
    }
  }

  console.log(`Total images in DB: ${allImages.length}`)

  // Resume from progress
  const progress = loadProgress()
  const checkedSet = new Set(progress.checkedUrls || [])
  const flagged = progress.flagged || []
  const remaining = allImages.filter(img => !checkedSet.has(img.url))

  console.log(`Already checked: ${checkedSet.size}`)
  console.log(`Already flagged: ${flagged.length}`)
  console.log(`Remaining: ${remaining.length}`)

  if (remaining.length === 0) {
    console.log('All images already scanned! Generating review page...')
    generateReviewPage(flagged)
    return
  }

  let batchCount = 0

  for (let i = 0; i < remaining.length; i++) {
    const img = remaining[i]
    const result = await checkImage(img.publicId)

    if (result.rateLimited) {
      console.log(`Rate limited at ${checkedSet.size + 1}/${allImages.length}. Waiting 65s...`)
      // Save before waiting
      saveProgress({ checkedUrls: [...checkedSet], flagged })
      await sleep(65000)
      i-- // retry this image
      continue
    }

    if (result.error) {
      // Skip errors but log
      checkedSet.add(img.url)
      batchCount++
      continue
    }

    checkedSet.add(img.url)
    batchCount++

    const hasFace = result.faces && result.faces.length > 0
    const isAvatar = isLetterAvatar(result)

    if (hasFace || isAvatar) {
      const reason = []
      if (hasFace) reason.push(`${result.faces.length} face(s)`)
      if (isAvatar) reason.push('letter avatar')
      flagged.push({
        terminalId: img.terminalId,
        terminalName: img.terminalName,
        url: img.url,
        publicId: img.publicId,
        reason: reason.join(', '),
        faceCount: result.faces?.length || 0,
        isAvatar,
      })
      console.log(`  FLAG [${reason.join(', ')}]: ${img.terminalName} — ${img.publicId}`)
    }

    if (batchCount % 50 === 0) {
      const total = checkedSet.size
      console.log(`[${total}/${allImages.length}] flagged: ${flagged.length}`)
      saveProgress({ checkedUrls: [...checkedSet], flagged })
    }

    // Small delay between calls to avoid hitting rate limit
    if (batchCount % 3 === 0) await sleep(200)
  }

  // Final save
  saveProgress({ checkedUrls: [...checkedSet], flagged })

  console.log(`\n=== DONE ===`)
  console.log(`Checked: ${checkedSet.size}`)
  console.log(`Flagged: ${flagged.length}`)

  generateReviewPage(flagged)
}

function generateReviewPage(flagged) {
  // Group by terminal
  const byTerminal = {}
  for (const f of flagged) {
    if (!byTerminal[f.terminalId]) byTerminal[f.terminalId] = { name: f.terminalName, id: f.terminalId, images: [] }
    byTerminal[f.terminalId].images.push(f)
  }

  const groups = Object.values(byTerminal).sort((a, b) => b.images.length - a.images.length)

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Sakayan Face/Avatar Review — ${flagged.length} flagged</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; padding: 16px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .stats { color: #666; font-size: 13px; margin-bottom: 16px; }
  .actions { position: sticky; top: 0; background: #fff; padding: 12px 16px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 16px; z-index: 100; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .actions button { padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; cursor: pointer; font-size: 13px; font-weight: 600; }
  .actions .delete-btn { background: #ef4444; color: white; border: none; }
  .actions .delete-btn:disabled { background: #fca5a5; cursor: not-allowed; }
  .group { background: white; border-radius: 10px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .group-header { font-size: 14px; font-weight: 700; margin-bottom: 8px; color: #111; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .card { position: relative; width: 160px; border-radius: 8px; overflow: hidden; border: 3px solid transparent; cursor: pointer; transition: border-color 0.15s; }
  .card.selected { border-color: #ef4444; }
  .card img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .card .badge { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; }
  .card .badge.avatar { background: #6366f1; }
  .card .check { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; border-radius: 50%; background: white; border: 2px solid #d1d5db; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .card.selected .check { background: #ef4444; border-color: #ef4444; color: white; }
  #count { font-weight: 700; color: #ef4444; }
</style>
</head><body>
<h1>Flagged Images Review</h1>
<p class="stats">${flagged.length} images flagged across ${groups.length} terminals. Click to select, then delete selected.</p>

<div class="actions">
  <button onclick="selectAll()">Select All</button>
  <button onclick="selectNone()">Select None</button>
  <button onclick="selectFaces()">Select All Faces</button>
  <button onclick="selectAvatars()">Select All Avatars</button>
  <span>Selected: <span id="count">0</span></span>
  <button class="delete-btn" id="deleteBtn" disabled onclick="doDelete()">Delete Selected</button>
</div>

${groups.map(g => `
<div class="group">
  <div class="group-header">${g.name} (${g.images.length})</div>
  <div class="grid">
    ${g.images.map(img => `
    <div class="card" data-url="${img.url}" data-pid="${img.publicId}" data-tid="${img.terminalId}" data-face="${img.faceCount > 0}" data-avatar="${img.isAvatar}" onclick="toggle(this)">
      <div class="check"></div>
      <img src="${img.url}" loading="lazy" />
      <div class="badge ${img.isAvatar ? 'avatar' : ''}">${img.reason}</div>
    </div>`).join('')}
  </div>
</div>`).join('')}

<script>
const selected = new Set()
function updateCount() {
  document.getElementById('count').textContent = selected.size
  document.getElementById('deleteBtn').disabled = selected.size === 0
}
function toggle(el) {
  const url = el.dataset.url
  if (selected.has(url)) { selected.delete(url); el.classList.remove('selected') }
  else { selected.add(url); el.classList.add('selected') }
  updateCount()
}
function selectAll() {
  document.querySelectorAll('.card').forEach(c => { selected.add(c.dataset.url); c.classList.add('selected') })
  updateCount()
}
function selectNone() {
  selected.clear()
  document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'))
  updateCount()
}
function selectFaces() {
  document.querySelectorAll('.card[data-face="true"]').forEach(c => { selected.add(c.dataset.url); c.classList.add('selected') })
  updateCount()
}
function selectAvatars() {
  document.querySelectorAll('.card[data-avatar="true"]').forEach(c => { selected.add(c.dataset.url); c.classList.add('selected') })
  updateCount()
}
function doDelete() {
  if (!selected.size) return
  const data = [...selected].map(url => {
    const card = document.querySelector('.card[data-url="' + CSS.escape(url) + '"]')
    return { url, publicId: card?.dataset.pid, terminalId: card?.dataset.tid }
  })
  // Copy JSON to clipboard for deletion script
  const json = JSON.stringify(data, null, 2)
  navigator.clipboard.writeText(json).then(() => {
    alert(selected.size + ' images copied to clipboard as JSON.\\nRun: node scripts/delete_flagged.js to delete them.')
  }).catch(() => {
    // Fallback — download as file
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'images_to_delete.json'
    a.click()
    alert(selected.size + ' images saved to images_to_delete.json.\\nRun: node scripts/delete_flagged.js to delete them.')
  })
}
</script>
</body></html>`

  fs.writeFileSync('sakayan_face_review.html', html)
  console.log(`Review page: sakayan_face_review.html (${flagged.length} images, ${groups.length} terminals)`)
  fs.writeFileSync(RESULTS_FILE, JSON.stringify({ total: flagged.length, terminals: groups.length, flagged }, null, 2))
}

main().catch(e => console.error(e))
