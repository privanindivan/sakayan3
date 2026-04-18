import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// Check what NAIA T3 entries remain to get coords reference
const { rows: existing } = await client.query(`
  SELECT id, name, lat, lng FROM terminals WHERE name ILIKE 'NAIA Terminal 3%' ORDER BY name
`)
console.log('Existing NAIA T3 entries:')
for (const r of existing) console.log(`  "${r.name}"  lat=${r.lat}  lng=${r.lng}`)

// The 7 deleted bays — restore them at their original approximate lat/lng
// From the earlier query output we had the lats; lng is same as the main terminal
// Reference: NAIA T3 main is at lng≈121.0197 area
// The bays run along the arrivals road, slight lat variation
const baseLng = existing[0]?.lng ?? 121.0194

const BAYS = [
  { name: 'NAIA Terminal 3 Arrivals Bay 1',  lat: 14.5214 },
  { name: 'NAIA Terminal 3 Arrivals Bay 3',  lat: 14.5212 },
  { name: 'NAIA Terminal 3 Arrivals Bay 7',  lat: 14.5207 },
  { name: 'NAIA Terminal 3 Arrivals Bay 9',  lat: 14.5205 },
  { name: 'NAIA Terminal 3 Arrivals Bay 11', lat: 14.5203 },
  { name: 'NAIA Terminal 3 Arrivals Bay 13', lat: 14.5200 },
  { name: 'NAIA Terminal 3 Departures Bay 9',lat: 14.5204 },
]

console.log(`\nRestoring ${BAYS.length} bay entries at lng=${baseLng}...`)
for (const bay of BAYS) {
  // Check if it already exists
  const { rows: exists } = await client.query(
    `SELECT id FROM terminals WHERE name ILIKE $1`, [bay.name]
  )
  if (exists.length) { console.log(`  already exists: ${bay.name}`); continue }

  await client.query(
    `INSERT INTO terminals (name, lat, lng, type) VALUES ($1, $2, $3, 'Bus')`,
    [bay.name, bay.lat, baseLng]
  )
  console.log(`  ✓ restored: ${bay.name}`)
}

await client.end()
console.log('Done')
