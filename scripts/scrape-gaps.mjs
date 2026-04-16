/**
 * Gap-fill scraper — Jeep, UV, Tricycle types
 * Sources:
 *   1. OSM Overpass — all 44 PH regions, with retry + longer delays
 *   2. Google Maps — targeted queries per type per city
 * Deduplicates against existing DB (150m threshold)
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const DB_URL = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const STATE_FILE = 'scripts/scrape-gaps-state.json';
const DEDUP_DEG  = 0.0015; // ~150m

const PH_REGIONS = [
  { name: 'Ilocos Norte + Sur',                   bbox: '17.3,119.8,18.7,121.0' },
  { name: 'Cagayan + Isabela',                    bbox: '16.5,121.0,18.7,122.5' },
  { name: 'Mountain Province + Ifugao + Benguet', bbox: '16.3,120.4,17.3,121.3' },
  { name: 'La Union + Pangasinan',                bbox: '15.6,119.7,16.7,120.8' },
  { name: 'Tarlac + Nueva Ecija + Aurora',        bbox: '15.0,120.6,16.3,122.0' },
  { name: 'Pampanga + Zambales + Bataan',         bbox: '14.6,119.9,15.5,120.9' },
  { name: 'Bulacan',                              bbox: '14.7,120.7,15.2,121.2' },
  { name: 'Metro Manila NCR',                     bbox: '14.35,120.88,14.82,121.15' },
  { name: 'Rizal',                                bbox: '14.35,121.1,14.9,121.6' },
  { name: 'Cavite',                               bbox: '14.0,120.75,14.45,121.0' },
  { name: 'Laguna',                               bbox: '13.9,121.0,14.45,121.7' },
  { name: 'Batangas',                             bbox: '13.5,120.7,14.15,121.3' },
  { name: 'Quezon Province',                      bbox: '13.5,121.4,14.8,122.4' },
  { name: 'Marinduque + Romblon',                 bbox: '12.5,121.8,13.6,122.7' },
  { name: 'Occidental Mindoro',                   bbox: '12.2,120.5,13.5,121.1' },
  { name: 'Oriental Mindoro',                     bbox: '12.2,121.0,13.5,121.7' },
  { name: 'Palawan',                              bbox: '8.3,117.0,12.5,119.5' },
  { name: 'Camarines Norte + Sur',                bbox: '13.5,122.5,14.3,124.0' },
  { name: 'Albay + Sorsogon',                     bbox: '12.5,123.3,13.5,124.2' },
  { name: 'Catanduanes',                          bbox: '13.5,124.1,14.0,124.5' },
  { name: 'Masbate',                              bbox: '11.8,123.4,12.5,124.0' },
  { name: 'Aklan + Capiz + Antique',              bbox: '11.0,121.8,12.0,122.8' },
  { name: 'Iloilo',                               bbox: '10.4,122.2,11.2,122.8' },
  { name: 'Guimaras',                             bbox: '10.5,122.5,10.8,122.8' },
  { name: 'Negros Occidental',                    bbox: '9.8,122.3,11.1,123.3' },
  { name: 'Negros Oriental',                      bbox: '9.0,122.8,10.7,123.6' },
  { name: 'Cebu',                                 bbox: '9.8,123.3,11.3,124.1' },
  { name: 'Bohol',                                bbox: '9.5,123.7,10.3,124.6' },
  { name: 'Siquijor',                             bbox: '9.1,123.4,9.3,123.6' },
  { name: 'Leyte + Biliran',                      bbox: '10.1,124.2,11.8,125.1' },
  { name: 'Eastern Samar',                        bbox: '11.0,125.1,12.1,125.7' },
  { name: 'Western + Northern Samar',             bbox: '11.2,124.0,12.6,125.1' },
  { name: 'Zamboanga del Norte + del Sur',        bbox: '7.0,121.8,8.5,123.5' },
  { name: 'Misamis Occidental + Oriental',        bbox: '7.8,123.2,9.0,124.8' },
  { name: 'Cagayan de Oro + Iligan',              bbox: '8.0,124.0,8.7,124.8' },
  { name: 'Lanao del Norte + Sur',                bbox: '7.5,123.8,8.5,124.5' },
  { name: 'Bukidnon',                             bbox: '7.5,124.5,8.5,125.5' },
  { name: 'Davao City + del Norte',               bbox: '7.0,125.3,7.7,126.0' },
  { name: 'Davao del Sur + Sarangani',            bbox: '5.9,124.8,6.8,125.5' },
  { name: 'Davao Oriental',                       bbox: '6.5,126.0,7.8,126.7' },
  { name: 'North + South Cotabato',               bbox: '6.5,124.5,7.5,125.5' },
  { name: 'General Santos City',                  bbox: '6.0,125.0,6.3,125.3' },
  { name: 'Agusan del Norte + Sur',               bbox: '8.0,125.5,9.0,126.3' },
  { name: 'Surigao del Norte + Sur',              bbox: '7.9,125.3,10.0,126.7' },
  { name: 'Maguindanao + Cotabato City',          bbox: '6.8,124.0,7.4,124.6' },
  { name: 'Basilan + Sulu + Tawi-Tawi',           bbox: '4.5,119.0,6.7,122.5' },
];

// OSM tags specifically for Jeep, UV, Tricycle — NOT bus_station/ferry (already covered)
const OSM_QUERY = (bbox) => `
[out:json][timeout:30];
(
  node["amenity"="bus_station"]["name"~"[Jj]eep|[Tt]erminal|[Ss]tation|[Hh]ub"](${bbox});
  node["public_transport"="stop_area"]["name"~"[Jj]eepney|[Tt]ricycle|[Uu][Vv]|[Vv]an"](${bbox});
  node["highway"="bus_stop"]["name"~"[Jj]eep|[Tt]ricycle|[Uu][Vv][- ][Ee]x|[Vv]an [Ff]or [Hh]ire"](${bbox});
  node["amenity"="taxi"]["name"~"[Jj]eep|[Tt]ricycle|[Ss]idet?car|[Kk]uliglig|[Ss]kylab|motorela|trisikad"](${bbox});
  node["public_transport"="platform"]["name"~"[Jj]eepney|[Tt]ricycle|[Uu][Vv]"](${bbox});
);
out body;
`;

// Map OSM node to our type
function mapType(tags = {}) {
  const all = [tags.name, tags.amenity, tags.public_transport, tags.highway].join(' ').toLowerCase();
  if (/tricycle|toda|trisikad|kuliglig|motorela|skylab|sidecar/.test(all)) return 'Tricycle';
  if (/uv.?ex|fx.?van|van.?for.?hire|uv.?term/.test(all)) return 'UV';
  return 'Jeep'; // default for jeepney/terminal hits
}

// Google Maps queries for gap types
const GMAPS_QUERIES = [
  // Jeep — provincial jeepney terminals not yet in DB
  'jeepney terminal Laoag Ilocos Norte Philippines',
  'jeepney terminal Vigan Ilocos Sur Philippines',
  'jeepney terminal Tuguegarao Cagayan Philippines',
  'jeepney terminal Bontoc Mountain Province Philippines',
  'jeepney terminal Dagupan Pangasinan Philippines',
  'jeepney terminal San Carlos Pangasinan Philippines',
  'jeepney terminal Urdaneta Pangasinan Philippines',
  'jeepney terminal Cabanatuan Nueva Ecija Philippines',
  'jeepney terminal Balanga Bataan Philippines',
  'jeepney terminal Olongapo Zambales Philippines',
  'jeepney terminal Meycauayan Bulacan Philippines',
  'jeepney terminal Malolos Bulacan Philippines',
  'jeepney terminal Marilao Bulacan Philippines',
  'jeepney terminal Antipolo Rizal Philippines',
  'jeepney terminal Taytay Rizal Philippines',
  'jeepney terminal Angono Rizal Philippines',
  'jeepney terminal Dasmariñas Cavite Philippines',
  'jeepney terminal Imus Cavite Philippines',
  'jeepney terminal Bacoor Cavite Philippines',
  'jeepney terminal Sta. Rosa Laguna Philippines',
  'jeepney terminal Calamba Laguna Philippines',
  'jeepney terminal San Pedro Laguna Philippines',
  'jeepney terminal Lipa City Batangas Philippines',
  'jeepney terminal Batangas City Philippines',
  'jeepney terminal Lucena City Quezon Philippines',
  'jeepney terminal Calapan Oriental Mindoro Philippines',
  'jeepney terminal Puerto Princesa Palawan Philippines',
  'jeepney terminal Naga City Camarines Sur Philippines',
  'jeepney terminal Legazpi City Albay Philippines',
  'jeepney terminal Sorsogon City Philippines',
  'jeepney terminal Kalibo Aklan Philippines',
  'jeepney terminal Iloilo City Philippines',
  'jeepney terminal Bacolod City Philippines',
  'jeepney terminal Dumaguete Philippines',
  'jeepney terminal Cebu City Philippines',
  'jeepney terminal Mandaue Cebu Philippines',
  'jeepney terminal Lapu-Lapu Cebu Philippines',
  'jeepney terminal Tagbilaran Bohol Philippines',
  'jeepney terminal Tacloban Leyte Philippines',
  'jeepney terminal Ormoc Leyte Philippines',
  'jeepney terminal Cagayan de Oro Philippines',
  'jeepney terminal Iligan City Philippines',
  'jeepney terminal Davao City Philippines',
  'jeepney terminal General Santos Philippines',
  'jeepney terminal Cotabato City Philippines',
  'jeepney terminal Zamboanga City Philippines',
  'jeepney terminal Butuan City Philippines',
  'jeepney terminal Surigao City Philippines',
  // UV Express
  'UV Express terminal Cubao Quezon City Philippines',
  'UV Express terminal Alabang Muntinlupa Philippines',
  'UV Express terminal Pasay Philippines',
  'UV Express terminal Paranaque Philippines',
  'UV Express terminal Sta. Rosa Laguna Philippines',
  'UV Express terminal Calamba Laguna Philippines',
  'UV Express terminal Lipa Batangas Philippines',
  'UV Express terminal Cabanatuan Nueva Ecija Philippines',
  'UV Express terminal San Fernando Pampanga Philippines',
  'UV Express terminal Malolos Bulacan Philippines',
  'FX terminal Cubao Philippines',
  'FX van terminal Pasay Philippines',
  'van terminal Baguio City Philippines',
  'van terminal Dagupan Pangasinan Philippines',
  // Tricycle
  'tricycle terminal Dagupan Pangasinan Philippines',
  'tricycle terminal Cabanatuan Nueva Ecija Philippines',
  'tricycle terminal Naga City Philippines',
  'tricycle terminal Legazpi Albay Philippines',
  'tricycle terminal Iloilo City Philippines',
  'tricycle terminal Cebu City Philippines',
  'tricycle terminal Tacloban Leyte Philippines',
  'tricycle terminal Cagayan de Oro Philippines',
  'tricycle terminal Davao City Philippines',
  'tricycle terminal General Santos Philippines',
  'tricycle terminal Zamboanga City Philippines',
  'tricycle terminal Butuan City Philippines',
];

// ── OSM fetch with retry ───────────────────────────────────────────────────────
async function fetchOSM(region, retries = 3) {
  const [s, w, n, e] = region.bbox.split(',');
  const bbox = `${s},${w},${n},${e}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(OSM_QUERY(bbox)),
        signal: AbortSignal.timeout(35000),
      });
      if (res.status === 429) {
        const wait = attempt * 15000;
        process.stdout.write(` [rate-limited, wait ${wait/1000}s]`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (res.status === 504) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 5000)); continue; }
        return [];
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.elements || [])
        .filter(el => el.tags?.name)
        .map(el => ({
          name: el.tags.name.trim(),
          lat: el.lat,
          lng: el.lon,
          type: mapType(el.tags),
        }));
    } catch (e) {
      if (attempt === retries) return [];
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return [];
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function isDup(lat, lng, name) {
  const r = await pool.query(
    `SELECT 1 FROM terminals WHERE ABS(lat-$1)<$3 AND ABS(lng-$2)<$3 LIMIT 1`,
    [lat, lng, DEDUP_DEG]
  );
  if (r.rows.length) return true;
  const r2 = await pool.query(
    `SELECT 1 FROM terminals WHERE LOWER(TRIM(name))=LOWER(TRIM($1)) AND ABS(lat-$2)<0.005 AND ABS(lng-$3)<0.005 LIMIT 1`,
    [name, lat, lng]
  );
  return r2.rows.length > 0;
}

async function insert(name, lat, lng, type) {
  if (await isDup(lat, lng, name)) return false;
  await pool.query(
    `INSERT INTO terminals (id,name,type,lat,lng,created_at,updated_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,NOW(),NOW())`,
    [name, type, lat, lng]
  );
  return true;
}

// ── Google Maps scraper ────────────────────────────────────────────────────────
function typeFromQuery(query) {
  const q = query.toLowerCase();
  if (/tricycle/.test(q)) return 'Tricycle';
  if (/uv|fx|van/.test(q)) return 'UV';
  return 'Jeep';
}

async function scrapeGMaps(page, query) {
  const type = typeFromQuery(query);
  try {
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );
    await page.waitForTimeout(2000);

    // Scroll to load more results
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (feed) feed.scrollBy(0, 600);
      });
      await page.waitForTimeout(400);
    }

    const items = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('a.hfpxzc[aria-label]')) {
        const name = el.getAttribute('aria-label')?.trim();
        const href = el.href || '';
        const m = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (name && m) out.push({ name, lat: parseFloat(m[1]), lng: parseFloat(m[2]) });
      }
      return out;
    });

    return items.slice(0, 12).map(i => ({ ...i, type }));
  } catch {
    return [];
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const state = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { doneOSM: [], doneGMaps: [] };

  let inserted = 0, skipped = 0;

  // ── Phase 1: OSM ──
  console.log('🗺️  Phase 1: OSM — Jeep / UV / Tricycle nodes across all PH regions\n');
  for (const region of PH_REGIONS) {
    if (state.doneOSM.includes(region.name)) {
      console.log(`  [skip] ${region.name}`);
      continue;
    }
    process.stdout.write(`  ${region.name}... `);
    const nodes = await fetchOSM(region);
    let ins = 0;
    for (const n of nodes) {
      const ok = await insert(n.name, n.lat, n.lng, n.type);
      if (ok) ins++; else skipped++;
    }
    inserted += ins;
    const byType = Object.fromEntries(['Jeep','UV','Tricycle'].map(t=>[t,nodes.filter(n=>n.type===t).length]));
    console.log(`${nodes.length} found → ${ins} new ${JSON.stringify(byType)}`);
    state.doneOSM.push(region.name);
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    await new Promise(r => setTimeout(r, 4000)); // 4s between OSM calls to avoid 429
  }

  // ── Phase 2: Google Maps ──
  console.log('\n🗺️  Phase 2: Google Maps — Jeep / UV / Tricycle terminals per city\n');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  for (const query of GMAPS_QUERIES) {
    if (state.doneGMaps.includes(query)) {
      console.log(`  [skip] ${query}`);
      continue;
    }
    process.stdout.write(`  "${query}"... `);
    const results = await scrapeGMaps(page, query);
    let ins = 0;
    for (const r of results) {
      const ok = await insert(r.name, r.lat, r.lng, r.type);
      if (ok) ins++; else skipped++;
    }
    inserted += ins;
    console.log(`${results.length} found → ${ins} new`);
    state.doneGMaps.push(query);
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    await new Promise(r => setTimeout(r, 500));
  }

  await browser.close();
  await pool.end();

  console.log(`\n✅ Done — ${inserted} inserted, ${skipped} skipped (duplicates)`);

  const p2 = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  const r = await p2.query(`SELECT type, COUNT(*) FROM terminals WHERE type IN ('Jeep','UV','Tricycle') GROUP BY type ORDER BY type`);
  console.log('\nFinal counts:');
  r.rows.forEach(row => console.log(` ${row.type}: ${row.count}`));
  await p2.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
