require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { Pool } = require('pg');

const TOKEN = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN || process.env.VITE_MAPILLARY_TOKEN;
const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 5 });

const TILE_DEG = 0.09;
const LIMIT = 500;
const CONCURRENCY = 5;
const RETRY_DELAY_MS = 2000;

// Define tiles explicitly for the two gap regions
// Central Manila gap: lat 14.49–14.65, lng 120.92–121.02
// col 1343: lng = 1343*0.09 = 120.87 → 120.96
// col 1344: lng = 1344*0.09 = 120.96 → 121.05
// row 160: lat = 160*0.09 = 14.40 → 14.49
// row 161: lat = 161*0.09 = 14.49 → 14.58
// row 162: lat = 162*0.09 = 14.58 → 14.67
// South Manila gap: lat 14.35–14.50, lng 120.92–121.02
// row 159: lat = 159*0.09 = 14.31 → 14.40

function makeTile(col, row) {
  const w = +(col * TILE_DEG).toFixed(6);
  const s = +(row * TILE_DEG).toFixed(6);
  const e = +((col + 1) * TILE_DEG).toFixed(6);
  const n = +((row + 1) * TILE_DEG).toFixed(6);
  return { w, s, e, n, col, row };
}

const tiles = [];
// Central Manila gap: cols 1343-1344, rows 160-162
for (let col = 1343; col <= 1344; col++) {
  for (let row = 160; row <= 162; row++) {
    tiles.push({ ...makeTile(col, row), region: 'central' });
  }
}
// South Manila gap: cols 1343-1344, rows 159-160
for (let col = 1343; col <= 1344; col++) {
  for (let row = 159; row <= 160; row++) {
    // row 160 already covered above but include anyway; ON CONFLICT handles duplicates
    tiles.push({ ...makeTile(col, row), region: 'south' });
  }
}

// Deduplicate by tile key
const seen = new Set();
const uniqueTiles = tiles.filter(t => {
  const k = `${t.w},${t.s},${t.e},${t.n}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`Target tiles: ${uniqueTiles.length}`);
uniqueTiles.forEach(t => {
  console.log(`  [${t.region}] col=${t.col} row=${t.row} bbox=${t.w},${t.s} → ${t.e},${t.n}`);
});

async function fetchTile(t, attempt = 1) {
  const key = `${t.w},${t.s},${t.e},${t.n}`;
  const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry&bbox=${key}&limit=${LIMIT}`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (res.status === 429) {
      console.log(`\n  Rate limited on ${key}, waiting ${RETRY_DELAY_MS * attempt}ms...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      if (attempt < 4) return fetchTile(t, attempt + 1);
      return null;
    }
    if (!res.ok) {
      console.log(`\n  HTTP ${res.status} for ${key}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return fetchTile(t, attempt + 1);
    }
    console.log(`\n  Error on ${key}: ${err.message}`);
    return null;
  }
}

async function run() {
  // Get pre-fetch count
  const before = await pool.query('SELECT COUNT(*) FROM mapillary_images');
  const beforeCount = parseInt(before.rows[0].count, 10);
  console.log(`\nImages in DB before: ${beforeCount}`);

  // Check which tiles are already fully fetched
  let alreadyFetched;
  try {
    const fetched = await pool.query('SELECT tile_key FROM mapillary_fetched_tiles');
    alreadyFetched = new Set(fetched.rows.map(x => x.tile_key));
  } catch {
    alreadyFetched = new Set();
    console.log('Note: mapillary_fetched_tiles table not accessible, will fetch all tiles');
  }

  const pending = uniqueTiles.filter(t => !alreadyFetched.has(`${t.w},${t.s},${t.e},${t.n}`));
  const skipped = uniqueTiles.length - pending.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} already-fetched tiles, processing ${pending.length} tiles\n`);
  } else {
    console.log(`Processing all ${pending.length} tiles (none previously fetched)\n`);
  }

  const results = [];
  let done = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async t => {
      const key = `${t.w},${t.s},${t.e},${t.n}`;
      const data = await fetchTile(t);
      let inserted = 0;
      let fetched_count = 0;

      if (data && !data.error && Array.isArray(data.data) && data.data.length > 0) {
        fetched_count = data.data.length;
        const imgs = data.data
          .filter(img => img.geometry && img.geometry.coordinates)
          .map(img => ({
            id: img.id,
            lat: img.geometry.coordinates[1],
            lng: img.geometry.coordinates[0],
          }));

        if (imgs.length > 0) {
          const vals = imgs.flatMap(img => [img.id, img.lat, img.lng]);
          const ph = imgs.map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`).join(', ');
          try {
            const res = await pool.query(
              `INSERT INTO mapillary_images (id, lat, lng) VALUES ${ph} ON CONFLICT (id) DO NOTHING`,
              vals
            );
            inserted = res.rowCount || 0;
          } catch (dbErr) {
            console.log(`\n  DB error for ${key}: ${dbErr.message}`);
          }
        }
      }

      // Mark tile as fetched
      try {
        await pool.query(
          'INSERT INTO mapillary_fetched_tiles (tile_key) VALUES ($1) ON CONFLICT DO NOTHING',
          [key]
        );
      } catch {}

      return { tile: t, key, fetched_count, inserted };
    }));

    done += batch.length;
    for (const r of batchResults) {
      results.push(r);
      const symbol = r.fetched_count >= LIMIT ? '+' : r.fetched_count > 0 ? '.' : '_';
      console.log(`  ${symbol} [${r.tile.region}] col=${r.tile.col} row=${r.tile.row} → fetched=${r.fetched_count} inserted=${r.inserted} | bbox=${r.key}`);
    }
  }

  // Summary
  const after = await pool.query('SELECT COUNT(*) FROM mapillary_images');
  const afterCount = parseInt(after.rows[0].count, 10);
  const totalInserted = afterCount - beforeCount;

  console.log('\n========== RESULTS ==========');
  console.log(`Tiles processed: ${results.length} (${skipped} skipped as already fetched)`);
  console.log(`Images fetched from API: ${results.reduce((s, r) => s + r.fetched_count, 0)}`);
  console.log(`New images inserted: ${totalInserted}`);
  console.log(`Total images in DB: ${afterCount}`);
  console.log('\nPer-tile breakdown:');
  for (const r of results) {
    console.log(`  [${r.tile.region}] col=${r.tile.col} row=${r.tile.row} (${r.key}): fetched=${r.fetched_count}, inserted=${r.inserted}`);
  }

  pool.end();
}

run().catch(e => {
  console.error('Fatal error:', e);
  pool.end();
  process.exit(1);
});
