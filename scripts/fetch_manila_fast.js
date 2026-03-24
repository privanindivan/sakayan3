require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const TOKEN = process.env.VITE_MAPILLARY_TOKEN || process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
const dbUrl = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 3 });
const TILE_DEG = 0.09, LIMIT = 300, CONCURRENCY = 10;

// Target only main Philippine islands: Luzon, Metro Manila, Visayas, Mindanao
const REGIONS = [
  { west: 119.5, east: 127.0, south: 5.5, north: 21.5 },  // Skip the 116-119.5 western ocean
];

const tiles = [];
for (const r of REGIONS)
  for (let lng = r.west; lng < r.east; lng += TILE_DEG)
    for (let lat = r.south; lat < r.north; lat += TILE_DEG)
      tiles.push({ w: +lng.toFixed(6), s: +lat.toFixed(6), e: +(lng+TILE_DEG).toFixed(6), n: +(lat+TILE_DEG).toFixed(6) });

async function run() {
  const fetched = await pool.query('SELECT tile_key FROM mapillary_fetched_tiles').then(r => new Set(r.rows.map(x=>x.tile_key)));
  const pending = tiles.filter(t => !fetched.has(`${t.w},${t.s},${t.e},${t.n}`));
  console.log(`Fast-fill: ${pending.length} island tiles pending`);

  let done = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async t => {
      const key = `${t.w},${t.s},${t.e},${t.n}`;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 12000);
        const res = await fetch(`https://graph.mapillary.com/images?access_token=${TOKEN}&fields=id,geometry&bbox=${key}&limit=${LIMIT}`, { signal: ctrl.signal });
        clearTimeout(to);
        const data = await res.json();
        if (!data.error && data.data?.length > 0) {
          const imgs = data.data.map(img => ({ id: img.id, lat: img.geometry.coordinates[1], lng: img.geometry.coordinates[0] }));
          const vals = imgs.flatMap(i => [i.id, i.lat, i.lng]);
          const ph = imgs.map((_, i) => `($${i*3+1},$${i*3+2},$${i*3+3})`).join(',');
          await pool.query(`INSERT INTO mapillary_images (id,lat,lng) VALUES ${ph} ON CONFLICT (id) DO NOTHING`, vals);
          process.stdout.write(imgs.length >= LIMIT ? '+' : '.');
        } else { process.stdout.write('_'); }
        await pool.query('INSERT INTO mapillary_fetched_tiles (tile_key) VALUES ($1) ON CONFLICT DO NOTHING', [key]);
      } catch { process.stdout.write('x'); try { await pool.query('INSERT INTO mapillary_fetched_tiles (tile_key) VALUES ($1) ON CONFLICT DO NOTHING', [key]); } catch {} }
    }));
    done += batch.length;
    if (done % 300 === 0 || i + CONCURRENCY >= pending.length) {
      const c = await pool.query('SELECT COUNT(*) FROM mapillary_images');
      process.stdout.write(`\n[${((done/pending.length)*100).toFixed(1)}%] ${done}/${pending.length} — ${c.rows[0].count} images\n`);
    }
  }
  const f = await pool.query('SELECT COUNT(*) FROM mapillary_images');
  console.log(`Done! ${f.rows[0].count} images total`);
  pool.end();
}
run().catch(e => { console.error(e); pool.end(); });
