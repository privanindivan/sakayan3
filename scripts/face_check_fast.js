// Fast face check using Cloudinary's stored face metadata
// No re-scanning — just reads what Cloudinary already knows
const https = require('https')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const AUTH = 'Basic ' + Buffer.from('659219458216645:Y-s8TVGEroo2HaFEPDjNGK70oSk').toString('base64')
const CLOUD = 'dmpytrcpl'
const PROGRESS_FILE = path.join(__dirname, 'face_scan_progress.json')
const CONCURRENCY = 8

function checkImage(publicId) {
  return new Promise(resolve => {
    const req = https.request({
      hostname: 'api.cloudinary.com',
      path: '/v1_1/' + CLOUD + '/resources/image/upload/' + encodeURIComponent(publicId) + '?faces=true&colors=true',
      method: 'GET',
      headers: { Authorization: AUTH },
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const j = JSON.parse(d)
          if (j.error) resolve({ faces: [], colors: [], rateLimited: j.error.message?.includes('rate') || res.statusCode === 429 })
          else resolve({ faces: j.faces || [], colors: j.colors || [] })
        } catch { resolve({ faces: [], colors: [] }) }
      })
    })
    req.on('error', () => resolve({ faces: [], colors: [] }))
    req.end()
  })
}

function isLetterAvatar(result) {
  if (!result.colors || !result.colors.length) return false
  const top = result.colors[0]
  return Array.isArray(top) && parseFloat(top[1]) > 55
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  // Load all terminals with images from DB
  const pool = new Pool({ connectionString: process.env.DATABASE_URL.replace(':5432/', ':6543/'), ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query('SELECT id, name, images FROM terminals WHERE images IS NOT NULL AND array_length(images,1) > 0')
  await pool.end()

  const allImages = []
  for (const t of rows) {
    for (const url of (t.images || [])) {
      const publicId = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/)?.[1]
      if (publicId) allImages.push({ terminalId: t.id, terminalName: t.name, url, publicId })
    }
  }

  console.log(`Checking ${allImages.length} images from ${rows.length} terminals...`)

  const flagged = []
  let done = 0
  let rateLimitHits = 0

  // Process in batches of CONCURRENCY
  for (let i = 0; i < allImages.length; i += CONCURRENCY) {
    const batch = allImages.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(img => checkImage(img.publicId)))

    for (let j = 0; j < batch.length; j++) {
      const img = batch[j]
      const r = results[j]
      done++

      if (r.rateLimited) {
        rateLimitHits++
        console.log('Rate limited, waiting 60s...')
        await sleep(60000)
      }

      if (r.faces && r.faces.length > 0) {
        flagged.push({ ...img, reason: `${r.faces.length} face(s)`, faceCount: r.faces.length, isAvatar: false })
      } else if (isLetterAvatar(r)) {
        flagged.push({ ...img, reason: 'letter avatar', faceCount: 0, isAvatar: true })
      }
    }

    if (done % 200 === 0 || done === allImages.length) {
      process.stdout.write(`\r${done}/${allImages.length} checked, ${flagged.length} flagged...`)
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ checkedUrls: allImages.slice(0, done).map(x => x.url), flagged, done: done === allImages.length }))
    }

    // Small delay to avoid hammering API
    if (i + CONCURRENCY < allImages.length) await sleep(150)
  }

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ checkedUrls: allImages.map(x => x.url), flagged, done: true }))
  console.log(`\nDone! ${flagged.length} flagged images found.`)
}

main().catch(e => { console.error(e); process.exit(1) })
