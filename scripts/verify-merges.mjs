/**
 * Checks whether the deletions made sense by looking at what was kept
 * and finding any remaining suspicious cases.
 */
import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Check the kept versions of specific questionable merges
const CHECK = [
  'Genesis Transport - Cabanatuan Terminal',
  'Passenger Terminal 1 - Cebu City',
  'Raymond Transportation - Sampaloc Terminal',
  'San Antonio-Cabanatuan Jeepney Terminal',
  'Partas Bus Terminal Pasay',
  'BGC - Ayala Terminal',
  'Quinta Market Ferry Terminal',
  'Calinan Public Market Jeepney Stop',
  'MRT 7 - Tandang Sora Station',
  'PNR Governor Pascual Station',
  'LRT1 Baclaran Station Entrance',
]

console.log('Verifying kept terminals (lat/lng to confirm they are the right location):\n')
for (const name of CHECK) {
  const { rows } = await client.query(
    `SELECT id, name, type, lat, lng FROM terminals WHERE name ILIKE $1`, [name]
  )
  if (!rows.length) { console.log(`NOT FOUND: ${name}`); continue }
  for (const r of rows) {
    // Rough area name from lat/lng
    const area = r.lat > 14.0 && r.lat < 15.0 && r.lng > 120.9 && r.lng < 121.2 ? 'Metro Manila' :
                 r.lat > 10.2 && r.lat < 10.5 && r.lng > 123.8 && r.lng < 124.1 ? 'Cebu City' :
                 r.lat > 15.7 && r.lat < 16.0 && r.lng > 120.3 && r.lng < 120.6 ? 'Tuguegarao area' :
                 r.lat > 15.4 && r.lat < 16.2 && r.lng > 120.9 && r.lng < 121.3 ? 'Cabanatuan/Nueva Ecija' :
                 r.lat > 7.0  && r.lat < 8.0  && r.lng > 125.0 && r.lng < 126.0 ? 'Davao City' :
                 `lat=${r.lat.toFixed(3)},lng=${r.lng.toFixed(3)}`
    console.log(`  [${r.type}] "${r.name}"`)
    console.log(`    → ${area}  (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})`)
  }
}

await client.end()
