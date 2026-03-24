// Finds tiles in Metro Manila that our DB has 0 images for but Mapillary has images,
// removes them from fetched_tiles, and re-fetches them.
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const TOKEN = process.env.VITE_MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });
const TILE_DEG = 0.09, LIMIT = 500, CONCURRENCY = 5;

// Metro Manila + surrounding (wider than before)
const REGION = { west: 120.78, east: 121.32, south: 14.30, north: 14.85 };

const tiles = [];
for (let lng = REGION.west; lng < REGION.east; lng += TILE_DEG)
  for (let lat = REGION.south; lat < REGION.north; lat += TILE_DEG)
    tiles.push({
      w: +lng.toFixed(6), s: +lat.toFixed(6),
      e: +(lng + TILE_DEG).toFixed(6), n: +(lat + TILE_DEG).toFixed(6),
    });

async function run() {
  // Find tiles already in fetched_tiles
  const fetched = await pool.query('SELECT tile_key FROM mapillary_fetched_tiles')
    .then(r => new Set(r.rows.map(x => x.tile_key)));

  // Find tiles in fetched_tiles that have 0 images in our DB
  const fetchedTiles = tiles.filter(t => fetched.has(`${t.w},${t.s},${t.e},${t.n}`));
  console.log(`Checking ${fetchedTiles.length} previously-fetched Metro Manila tiles for zero-coverage...`);

  const toRefetch = [];
  for (let i = 0; i < fetchedTiles.length; i += 20) {
    const batch = fetchedTiles.slice(i, i + 20);
    await Promise.all(batch.map(async t => {
      const key = `${t.w},${t.s},${t.e},${t.n}`;
      const count = await pool.query(
        'SELECT COUNT(*) FROM mapillary_images WHERE lng>=$1 AND lng<=$2 AND lat>=$3 AND lat<=$4',
        [t.w, t.e, t.s, t.n]
      ).then(r => parseInt(r.rows[0].count));
      if (count === 0) toRefetch.push(t);
    }));
  }
  console.log(`Found ${toRefetch.length} tiles with 0 images in DB. Checking Mapillary for them...`);

  // Among those, find which ones actually have images on Mapillary
  const needFetch = [];
  for (let i = 0; i < toRefetch.length; i += CONCURRENCY) {
    const batch = toRefetch.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async t => {
      const key = `${t.w},${t.s},${t.e},${t.n}`;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10000);
        const r = await fetch(
          `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id&bbox=${key}&limit=1`,
          { signal: ctrl.signal }
        );
        clearTimeout(to);
        const d = await r.json();
        if (!d.error && d.data?.length > 0) needFetch.push(t);
      } catch {}
    }));
  }
  console.log(`${needFetch.length} tiles have Mapillary images but 0 in our DB — re-fetching...`);

  // Remove them from fetched_tiles and re-fetch
  let added = 0;
  for (let i = 0; i < needFetch.length; i += CONCURRENCY) {
    const batch = needFetch.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async t => {
      const key = `${t.w},${t.s},${t.e},${t.n}`;
      try {
        await pool.query('DELETE FROM mapillary_fetched_tiles WHERE tile_key=$1', [key]);
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 15000);
        const r = await fetch(
          `https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry&bbox=${key}&limit=${LIMIT}`,
          { signal: ctrl.signal }
        );
        clearTimeout(to);
        const d = await r.json();
        if (!d.error && d.data?.length > 0) {
          const imgs = d.data.map(img => ({
            id: img.id,
            lat: img.geometry.coordinates[1],
            lng: img.geometry.coordinates[0],
          }));
          const vals = imgs.flatMap(i => [i.id, i.lat, i.lng]);
          const ph = imgs.map((_, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(',');
          await pool.query(
            `INSERT INTO mapillary_images (id,lat,lng) VALUES ${ph} ON CONFLICT (id) DO NOTHING`,
            vals
          );
          added += imgs.length;
          process.stdout.write(imgs.length >= LIMIT ? '+' : '.');
        }
        await pool.query(
          'INSERT INTO mapillary_fetched_tiles (tile_key) VALUES ($1) ON CONFLICT DO NOTHING',
          [key]
        );
      } catch { process.stdout.write('x'); }
    }));
  }

  const total = await pool.query('SELECT COUNT(*) FROM mapillary_images').then(r => r.rows[0].count);
  console.log(`\nAdded ~${added} images. Total: ${total}`);
  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
