const { Pool } = require('pg')
const https = require('https')
const fs = require('fs')

const CLOUD_NAME = 'dmpytrcpl'
const API_KEY = '659219458216645'
const API_SECRET = 'Y-s8TVGEroo2HaFEPDjNGK70oSk'
const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const AUTH = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')

// Read the file — either from clipboard paste or images_to_delete.json
const INPUT = process.argv[2] || 'images_to_delete.json'

async function main() {
  let toDelete
  try {
    toDelete = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
  } catch {
    console.error(`Cannot read ${INPUT}. Export from the review page first.`)
    process.exit(1)
  }

  console.log(`Deleting ${toDelete.length} images...`)

  // 1. Remove from DB
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  const urlsToDelete = new Set(toDelete.map(d => d.url))

  const res = await pool.query(
    `SELECT id, images FROM terminals WHERE images && $1::text[]`,
    [[...urlsToDelete]]
  )

  let dbUpdated = 0
  for (const row of res.rows) {
    const cleaned = (row.images || []).filter(img => !urlsToDelete.has(img))
    if (cleaned.length !== (row.images || []).length) {
      await pool.query(`UPDATE terminals SET images = $1 WHERE id = $2`, [cleaned, row.id])
      dbUpdated++
    }
  }
  await pool.end()
  console.log(`DB: updated ${dbUpdated} terminals`)

  // 2. Delete from Cloudinary in batches
  const publicIds = toDelete.map(d => d.publicId).filter(Boolean)
  const BATCH = 100
  let cloudDeleted = 0

  for (let i = 0; i < publicIds.length; i += BATCH) {
    const batch = publicIds.slice(i, i + BATCH)
    try {
      const result = await new Promise((resolve, reject) => {
        const params = batch.map(id => `public_ids[]=${encodeURIComponent(id)}`).join('&')
        const req = https.request({
          hostname: 'api.cloudinary.com',
          path: `/v1_1/${CLOUD_NAME}/resources/image/upload?${params}`,
          method: 'DELETE',
          headers: { Authorization: AUTH }
        }, res => {
          let data = ''
          res.on('data', c => data += c)
          res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
        })
        req.on('error', reject)
        req.end()
      })
      const deleted = result.deleted ? Object.keys(result.deleted).length : 0
      cloudDeleted += deleted
      console.log(`Batch ${Math.floor(i/BATCH)+1}: ${deleted}/${batch.length} deleted from Cloudinary`)
    } catch(e) {
      console.error(`Batch error:`, e.message)
    }
  }

  console.log(`\nDone. DB: ${dbUpdated} terminals updated. Cloudinary: ${cloudDeleted}/${publicIds.length} deleted.`)
}

main().catch(e => console.error(e))
