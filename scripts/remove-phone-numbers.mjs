import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Find all terminals with phone numbers in details
const { rows } = await client.query(`
  SELECT id, name, details FROM terminals
  WHERE details IS NOT NULL AND details != ''
    AND details ~* 'phone|tel|fax|\\(\\d{2,4}\\)|\\+63|09\\d{9}'
  ORDER BY name
`)

console.log(`Terminals with phone data: ${rows.length}\n`)

let updated = 0
for (const r of rows) {
  // Remove phone lines: "Phone: ...", "Tel: ...", "Fax: ...", standalone numbers
  let cleaned = r.details
    .replace(/Phone\s*:?[^\n]*/gi, '')
    .replace(/Tel(?:ephone)?\s*:?[^\n]*/gi, '')
    .replace(/Fax\s*:?[^\n]*/gi, '')
    .replace(/Contact\s*:?[^\n]*/gi, '')
    .replace(/\(\d{2,4}\)\s*[\d\s\-]+/g, '')   // (082) 221 2411
    .replace(/\+63[\d\s\-]+/g, '')              // +63 format
    .replace(/09\d{9}/g, '')                    // 09XXXXXXXXX mobile
    .replace(/\n{3,}/g, '\n\n')                 // collapse blank lines
    .trim()

  if (cleaned === r.details) continue

  console.log(`"${r.name}"`)
  console.log(`  BEFORE: ${r.details.slice(0, 120).replace(/\n/g, ' | ')}`)
  console.log(`  AFTER:  ${cleaned.slice(0, 120).replace(/\n/g, ' | ')}`)

  if (!DRY_RUN) {
    await client.query(
      `UPDATE terminals SET details = $1 WHERE id = $2`,
      [cleaned || null, r.id]
    )
    updated++
  }
}

await client.end()
console.log(`\n${DRY_RUN ? 'DRY RUN' : `Updated: ${updated}`}`)
