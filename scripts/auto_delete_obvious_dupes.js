// Auto-deletes obvious duplicate terminals without manual review.
// "Obvious" = same image URL, OR exact same name, within a duplicate group.
// Keeps the "richest" terminal (most images + has details + has connections).
// Deletes the rest from DB.

const { Pool } = require('pg')
const fs = require('fs')

const DB_URL = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const GROUPS_PATH = 'C:/Users/jj/Downloads/duplicate_groups.json'

// Normalize name for exact comparison
function normExact(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function main() {
  const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

  // Load duplicate groups
  const groups = JSON.parse(fs.readFileSync(GROUPS_PATH, 'utf8'))
  console.log(`Loaded ${groups.length} duplicate groups`)

  // Get all terminal IDs involved
  const allIds = groups.flatMap(g => g.terminals.map(t => t.id))
  console.log(`Fetching full data for ${allIds.length} terminals...`)

  // Fetch full terminal data + connection count
  const { rows: terminals } = await pool.query(`
    SELECT t.id, t.name, t.type, t.images, t.details, t.schedule,
           COUNT(DISTINCT c.id) AS conn_count
    FROM terminals t
    LEFT JOIN connections c ON c.from_id = t.id OR c.to_id = t.id
    WHERE t.id = ANY($1)
    GROUP BY t.id
  `, [allIds])

  const termMap = new Map(terminals.map(t => [t.id, t]))

  // Score a terminal by "richness" (higher = better, keep this one)
  function richness(t) {
    const full = termMap.get(t.id)
    if (!full) return 0
    const imgCount  = (full.images || []).length
    const hasType   = full.type ? 1 : 0
    const hasDetails= (full.details && Object.keys(full.details).length > 0) ? 2 : 0
    const hasSched  = (full.schedule && Object.keys(full.schedule).length > 0) ? 2 : 0
    const connCount = parseInt(full.conn_count) || 0
    return imgCount * 3 + hasType + hasDetails + hasSched + connCount * 5
  }

  // Identify obvious duplicates in each group
  const toDelete = new Set()
  let groupsActioned = 0

  for (const g of groups) {
    const { terminals: terms } = g

    // Collect "obvious" clusters within the group
    // 1) Same image URL
    const byImage = new Map()
    for (const t of terms) {
      const full = termMap.get(t.id)
      const imgs = (full?.images || [])
      for (const img of imgs) {
        if (!byImage.has(img)) byImage.set(img, [])
        byImage.get(img).push(t)
      }
    }

    // 2) Exact same normalized name
    const byName = new Map()
    for (const t of terms) {
      const norm = normExact(t.name)
      if (!byName.has(norm)) byName.set(norm, [])
      byName.get(norm).push(t)
    }

    // 3) maxScore = 100 (identical match by all criteria)
    const perfectScore = terms.filter(t => t.maxScore === 100)

    // Build obvious sets: each set of terminals we're confident are the same
    const obviousSets = []

    for (const [img, grp] of byImage) {
      if (grp.length >= 2) obviousSets.push({ reason: `same_image:${img.split('/').pop()}`, members: grp })
    }
    for (const [norm, grp] of byName) {
      if (grp.length >= 2 && norm.length >= 3) obviousSets.push({ reason: `same_name:${norm}`, members: grp })
    }
    if (perfectScore.length >= 2) {
      obviousSets.push({ reason: 'perfect_score_100', members: perfectScore })
    }

    // For each obvious set, keep richest, delete rest
    for (const { reason, members } of obviousSets) {
      const sorted = [...members].sort((a, b) => richness(b) - richness(a))
      const keep = sorted[0]
      const del  = sorted.slice(1)
      for (const d of del) {
        if (!toDelete.has(d.id)) {
          console.log(`  DELETE ${d.id} (${d.name}) [${reason}] → keep ${keep.id} (${keep.name})`)
          toDelete.add(d.id)
        }
      }
      groupsActioned++
    }
  }

  console.log(`\n── Summary ──`)
  console.log(`Groups with obvious dupes: ${groupsActioned}`)
  console.log(`Terminals to delete: ${toDelete.size}`)

  if (toDelete.size === 0) {
    console.log('Nothing to delete.')
    await pool.end()
    return
  }

  // Delete from DB
  console.log('\nDeleting...')
  const ids = [...toDelete]

  // Also remove from connections
  const { rowCount: connDel } = await pool.query(
    `DELETE FROM connections WHERE from_id = ANY($1) OR to_id = ANY($1)`,
    [ids]
  )
  console.log(`  Removed ${connDel} connections`)

  const { rowCount: termDel } = await pool.query(
    `DELETE FROM terminals WHERE id = ANY($1)`,
    [ids]
  )
  console.log(`  Deleted ${termDel} terminals`)

  // Regenerate duplicate_groups.json removing deleted IDs
  const deletedSet = new Set(ids)
  const updatedGroups = groups
    .map(g => ({
      ...g,
      terminals: g.terminals.filter(t => !deletedSet.has(t.id)),
    }))
    .filter(g => g.terminals.length >= 2)
    .map(g => ({ ...g, size: g.terminals.length }))

  fs.writeFileSync(GROUPS_PATH, JSON.stringify(updatedGroups, null, 2))
  console.log(`\nUpdated duplicate_groups.json → ${updatedGroups.length} remaining groups`)

  await pool.end()
}

main().catch(console.error)
