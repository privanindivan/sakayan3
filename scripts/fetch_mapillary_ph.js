/**
 * Fetches ALL Mapillary street-view dot locations for the Philippines
 * and stores them in mapillary_images (id, lat, lng).
 *
 * Run once:  node scripts/fetch_mapillary_ph.js
 * Resume:    safe to re-run — already-fetched tiles are skipped.
 */

require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const TOKEN = process.env.VITE_MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
if (!TOKEN) { console.error('No Mapillary token found in .env.local'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Philippines bounding box
const PH = { west: 116.0, east: 127.0, south: 4.5, north: 21.5 };
const TILE_DEG = 0.09;          // 0.09×0.09 = 0.0081 sq° — under Mapillary 0.010 limit
const CONCURRENCY = 20;         // parallel tile fetches
const LIMIT = 300;              // max images per tile

// Build full tile list
const tiles = [];
for (let lng = PH.west; lng < PH.east; lng += TILE_DEG)
  for (let lat = PH.south; lat < PH.north; lat += TILE_DEG)
    tiles.push({ w: +lng.toFixed(6), s: +lat.toFixed(6), e: +(lng + TILE_DEG).toFixed(6), n: +(lat + TILE_DEG).toFixed(6) });

console.log(`Total tiles to check: ${tiles.length}`);

// Load already-fetched tiles from DB (so we can resume)
async function loadFetched() {
  const res = await pool.query('SELECT tile_key FROM mapillary_fetched_tiles');
  return new Set(res.rows.map(r => r.tile_key));
}

// Ensure progress table exists
async function ensureProgressTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS mapillary_fetched_tiles (tile_key TEXT PRIMARY KEY)`);
}

async function fetchTile(tile) {
  const key = `${tile.w},${tile.s},${tile.e},${tile.n}`;
  const url = `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry&bbox=${tile.w},${tile.s},${tile.e},${tile.n}&limit=${LIMIT}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      process.stdout.write('E');
      return;
    }
    const images = (data.data || []).map(img => ({
      id: img.id,
      lat: img.geometry.coordinates[1],
      lng: img.geometry.coordinates[0],
    }));

    if (images.length > 0) {
      // Upsert all images
      const values = images.flatMap(i => [i.id, i.lat, i.lng]);
      const placeholders = images.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
      await pool.query(
        `INSERT INTO mapillary_images (id, lat, lng) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`,
        values
      );
      process.stdout.write(images.length >= LIMIT ? '+' : '.');
    } else {
      process.stdout.write('_');
    }

    // Mark tile as fetched
    await pool.query('INSERT INTO mapillary_fetched_tiles (tile_key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
  } catch (e) {
    process.stdout.write('x');
  }
}

async function run() {
  await ensureProgressTable();
  const fetched = await loadFetched();
  const pending = tiles.filter(t => !fetched.has(`${t.w},${t.s},${t.e},${t.n}`));
  console.log(`Pending: ${pending.length} tiles (${tiles.length - pending.length} already done)`);

  let done = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(fetchTile));
    done += batch.length;
    if (done % 500 === 0 || i + CONCURRENCY >= pending.length) {
      const pct = ((done / pending.length) * 100).toFixed(1);
      const count = await pool.query('SELECT COUNT(*) FROM mapillary_images');
      process.stdout.write(`\n[${pct}%] ${done}/${pending.length} tiles — ${count.rows[0].count} images stored\n`);
    }
  }

  const final = await pool.query('SELECT COUNT(*) FROM mapillary_images');
  console.log(`\nDone! Total Mapillary images stored: ${final.rows[0].count}`);
  await pool.end();
}

run().catch(e => { console.error(e); pool.end(); });
