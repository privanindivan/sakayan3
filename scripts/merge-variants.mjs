/**
 * Curated merge list for variants the reversed-name algorithm missed.
 * Format: [keep_name, delete_name] — both must be exact DB names.
 */
import pg from 'pg'
const DB = 'postgresql://postgres.shhlkffpnzdqppwnzehk:i0Xz07KCOJViXl95@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
const DRY_RUN = process.argv.includes('--dry-run')
const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()

// [keep, delete] — always keep the one listed first if it has ≥ connections
const PAIRS = [
  // Remaining reversed-name misses (typo/abbreviation differences)
  ['Chino Roces-J.P. Rizal', 'J.P Rizal-Chino Roces'],
  ['J.P Rizal-Pasong Tirad', 'Pasong Tirad-J.P. Rizal'],
  ['Judge D. Jimenez Street & Kamuning Road', 'Kamuning Road & Judge Jimenez Street'],
  ['J. Elizalde/President\'s Ave', 'J. President\'s Ave/Elizalde'],

  // "at" / "in front of" / "near" — same physical stop
  ['National Road/Luzon Street (in front of Ayala Malls South Mall)', 'National Road/Luzon Street (at Ayala Malls South Mall)'],
  ['Investment Drive/Alabang-Zapote Road (in front of Honda Alabang)', 'Investment Drive/Alabang-Zapote Road (at Honda Alabang)'],
  ['Civic Drive/Centennial Lane (in front of Asian Hospital)', 'Civic Drive/Centennial Lane (near Asian Hospital)'],
  ['Civic Drive/Centennial Lane (at Civic Prime)', 'Civic Drive/Centennial Lane (near Civic Prime)'],
  ['Investment Drive (at Parktrade Centre)', 'Investment Drive (near Parktrade Centre)'],

  // Nearside — same stop, less specific name preferred
  ['Taft Avenue at LRT Gil Puyat Station', 'Taft Avenue at LRT Gil Puyat Station Nearside'],
  ['Gil Puyat Avenue/Chino Roces Avenue', 'Gil Puyat Avenue/Chino Roces Avenue nearside'],
  ['Tandang Sora Avenue & Congresional Avenue', 'Tandang Sora Avenue & Congresional Avenue Nearside'],

  // Same intersection, different token order that canonical key missed
  ['Nicanor Reyes Street at Recto Avenue', 'Recto Avenue/Nicanor Reyes (Morayta) Street'],

  // Terminal name variants
  ['Allen Port', 'Port of Allen'],
  ['FTI Integrated Transport Terminal', 'FTI Integrated Transport Terminal (Closed)'],
  ['San Jose North Bus Terminal', 'San Jose North Bound Terminal'],
  ['North Port Passenger Terminal Complex', 'North Port Passenger Terminal'],
  ['Tacurong City Integrated Public Terminal', 'tacurong city public terminal'],
  ['Cebu North Bus Terminal (SM City)', 'Cebu North Bus Terminal'],
  ['Cabanatuan City Central Transport Terminal', 'Cabanatuan City Central Terminal'],
  ['New Laoag-Pagudpud Bus Terminal', 'Laoag-Pagudpud Bus Terminal'],
]

// SKIP (look similar but are NOT the same):
// - Hulo-Poblacion vs Poblacion-Hulo — opposite river banks
// - Bagumbayan-Santolan vs Santolan-Bagumbayan — opposite river banks
// - Digos City Bus Terminal vs New vs Satellite — different terminals
// - Quirino Ave at East Zamora vs West Zamora — different sides
// - Magsungay vs Mansilingan Central Market — different barangays
// - Gil Puyat Ave/Dian St vs /Bautista St — different cross-streets
// - Dagat-Dagatan/Alamang vs /Pusit — different streets
// - Timog/Scout Tobias vs /Scout Tuason — different streets

let merged = 0
for (const [keepName, delName] of PAIRS) {
  const { rows: ks } = await client.query(`SELECT id, name, type FROM terminals WHERE name = $1`, [keepName])
  const { rows: ds } = await client.query(`SELECT id, name, type FROM terminals WHERE name = $1`, [delName])

  if (!ks.length || !ds.length) {
    // Try case-insensitive
    const { rows: ks2 } = await client.query(`SELECT id, name, type FROM terminals WHERE name ILIKE $1`, [keepName])
    const { rows: ds2 } = await client.query(`SELECT id, name, type FROM terminals WHERE name ILIKE $1`, [delName])
    if (!ks2.length) { console.log(`NOT FOUND keep: "${keepName}"`); continue }
    if (!ds2.length) { console.log(`NOT FOUND del:  "${delName}"`); continue }
    ks.push(...ks2); ds.push(...ds2)
  }

  if (ks.length > 1 || ds.length > 1) { console.log(`AMBIGUOUS: "${keepName}" (${ks.length}) / "${delName}" (${ds.length})`); continue }

  const k = ks[0], d = ds[0]
  const { rows: [kc] } = await client.query(`SELECT COUNT(*) n FROM connections WHERE from_id=$1 OR to_id=$1`, [k.id])
  const { rows: [dc] } = await client.query(`SELECT COUNT(*) n FROM connections WHERE from_id=$1 OR to_id=$1`, [d.id])

  // If the "delete" has more connections, swap
  let keep = k, del_ = d
  if (parseInt(dc.n) > parseInt(kc.n)) { keep = d; del_ = k }

  console.log(`MERGE [${keep.type}] KEEP "${keep.name}" (${Math.max(parseInt(kc.n),parseInt(dc.n))}c) | DELETE "${del_.name}"`)
  if (!DRY_RUN) {
    await client.query(`UPDATE connections SET from_id=$1 WHERE from_id=$2 AND to_id!=$1`, [keep.id, del_.id])
    await client.query(`UPDATE connections SET to_id=$1 WHERE to_id=$2 AND from_id!=$1`, [keep.id, del_.id])
    await client.query(`DELETE FROM connections WHERE from_id=to_id`)
    await client.query(`DELETE FROM terminals WHERE id=$1`, [del_.id])
    merged++
  }
}

await client.end()
console.log(`\n${DRY_RUN ? 'DRY RUN' : `Merged: ${merged}`}`)
