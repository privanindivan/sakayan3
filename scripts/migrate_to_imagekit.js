// Migrate all terminal photos from Cloudinary → ImageKit
// - Uploads directly via URL (no local download needed)
// - Saves progress so it can resume if interrupted
// - Updates DB with new ImageKit URLs when done
const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const PROGRESS_FILE = path.join(__dirname, 'imagekit_migration_progress.json')
const CONCURRENCY = 4
const FOLDER = '/sakayan'

const IK_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY
const IK_AUTH = 'Basic ' + Buffer.from(IK_PRIVATE_KEY + ':').toString('base64')
const IK_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT

// Upload a single image to ImageKit via its source URL using multipart/form-data
function uploadToImageKit(sourceUrl, fileName) {
  return new Promise((resolve, reject) => {
    const boundary = '----IKBoundary' + Date.now()
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\n${sourceUrl}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\n${fileName}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${FOLDER}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="useUniqueFileName"\r\n\r\nfalse`,
      `--${boundary}--`
    ]
    const body = Buffer.from(parts.join('\r\n'), 'utf8')

    const req = https.request({
      hostname: 'upload.imagekit.io',
      path: '/api/v1/files/upload',
      method: 'POST',
      headers: {
        'Authorization': IK_AUTH,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try {
          const j = JSON.parse(d)
          if (j.url) resolve(j.url)
          else reject(new Error(j.message || JSON.stringify(j).substring(0, 200)))
        } catch { reject(new Error('Parse error: ' + d.substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(':5432/', ':6543/'),
    ssl: { rejectUnauthorized: false }
  })

  // Load all terminals with Cloudinary images
  const { rows } = await pool.query(`
    SELECT id, name, images FROM terminals
    WHERE images IS NOT NULL AND array_length(images, 1) > 0
    ORDER BY id ASC
  `)

  // Flatten to list of {terminalId, oldUrl}
  const allImages = []
  for (const t of rows) {
    for (const url of t.images) {
      if (url.includes('cloudinary.com')) {
        allImages.push({ terminalId: t.id, terminalName: t.name, oldUrl: url })
      }
    }
  }

  console.log(`Found ${allImages.length} Cloudinary images across ${rows.length} terminals`)

  // Load progress
  let progress = { done: {}, failed: [] }
  if (fs.existsSync(PROGRESS_FILE)) {
    try { progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) } catch {}
  }

  const remaining = allImages.filter(img => !progress.done[img.oldUrl])
  console.log(`Already migrated: ${allImages.length - remaining.length} | Remaining: ${remaining.length}`)

  if (remaining.length === 0) {
    console.log('All images already migrated! Updating DB...')
  } else {
    let done = 0
    // Process in batches of CONCURRENCY
    for (let i = 0; i < remaining.length; i += CONCURRENCY) {
      const batch = remaining.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(async img => {
        // Extract filename from Cloudinary URL
        const fileName = img.oldUrl.split('/').pop().split('?')[0] || `img_${Date.now()}.jpg`
        try {
          const newUrl = await uploadToImageKit(img.oldUrl, fileName)
          progress.done[img.oldUrl] = newUrl
          done++
        } catch (e) {
          progress.failed.push({ url: img.oldUrl, error: e.message })
          done++
          process.stdout.write(`\n  FAILED: ${img.oldUrl.substring(0,60)} — ${e.message}`)
        }
      }))

      // Save progress every 20 images
      if (done % 20 === 0 || i + CONCURRENCY >= remaining.length) {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
        process.stdout.write(`\r  Progress: ${Object.keys(progress.done).length}/${allImages.length} migrated, ${progress.failed.length} failed  `)
      }

      if (i + CONCURRENCY < remaining.length) await sleep(200)
    }
    console.log(`\n\nUpload complete. Migrated: ${Object.keys(progress.done).length}, Failed: ${progress.failed.length}`)
  }

  // Update DB: replace old Cloudinary URLs with new ImageKit URLs
  console.log('\nUpdating database...')
  let dbUpdated = 0
  const { rows: allTerminals } = await pool.query(`
    SELECT id, images FROM terminals WHERE images IS NOT NULL AND array_length(images, 1) > 0
  `)

  for (const t of allTerminals) {
    const newImages = t.images.map(url => progress.done[url] || url)
    const changed = newImages.some((url, i) => url !== t.images[i])
    if (changed) {
      await pool.query(
        `UPDATE terminals SET images = $1 WHERE id = $2`,
        [newImages, t.id]
      )
      dbUpdated++
    }
  }

  await pool.end()

  console.log(`DB updated: ${dbUpdated} terminals`)
  if (progress.failed.length > 0) {
    console.log(`\nFailed images saved to: ${PROGRESS_FILE}`)
    console.log('Run the script again to retry failed ones.')
  }
  console.log('\nMigration complete!')
  console.log(`ImageKit URL endpoint: ${IK_ENDPOINT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
