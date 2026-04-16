/**
 * Nationwide Philippines Cab terminal scraper
 * Sources:
 *   1. OSM Overpass — amenity=taxi nodes (named taxi stands)
 *   2. Google Maps text search — "multicab terminal [city]", "taxi terminal [city]"
 * Deduplicates against existing DB (150m proximity threshold)
 * Inserts new terminals with type = 'Cab'
 */

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env.local' });

const { Pool } = require('pg');
const DB_URL = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

const STATE_FILE = 'scripts/scrape-cab-state.json';
const DEDUP_DIST = 0.0015; // ~150m

// ── All Philippine regional bounding boxes (south,west,north,east) ──────────
const PH_REGIONS = [
  { name: 'Ilocos Norte + Sur', bbox: '17.3,119.8,18.7,121.0' },
  { name: 'Cagayan + Isabela', bbox: '16.5,121.0,18.7,122.5' },
  { name: 'Mountain Province + Ifugao + Benguet', bbox: '16.3,120.4,17.3,121.3' },
  { name: 'La Union + Pangasinan', bbox: '15.6,119.7,16.7,120.8' },
  { name: 'Tarlac + Nueva Ecija + Aurora', bbox: '15.0,120.6,16.3,122.0' },
  { name: 'Pampanga + Zambales + Bataan', bbox: '14.6,119.9,15.5,120.9' },
  { name: 'Bulacan', bbox: '14.7,120.7,15.2,121.2' },
  { name: 'Metro Manila NCR', bbox: '14.35,120.88,14.82,121.15' },
  { name: 'Rizal', bbox: '14.35,121.1,14.9,121.6' },
  { name: 'Cavite', bbox: '14.0,120.75,14.45,121.0' },
  { name: 'Laguna', bbox: '13.9,121.0,14.45,121.7' },
  { name: 'Batangas', bbox: '13.5,120.7,14.15,121.3' },
  { name: 'Quezon Province', bbox: '13.5,121.4,14.8,122.4' },
  { name: 'Marinduque + Romblon', bbox: '12.5,121.8,13.6,122.7' },
  { name: 'Occidental Mindoro', bbox: '12.2,120.5,13.5,121.1' },
  { name: 'Oriental Mindoro', bbox: '12.2,121.0,13.5,121.7' },
  { name: 'Palawan', bbox: '8.3,117.0,12.5,119.5' },
  { name: 'Camarines Norte + Sur', bbox: '13.5,122.5,14.3,124.0' },
  { name: 'Albay + Sorsogon', bbox: '12.5,123.3,13.5,124.2' },
  { name: 'Catanduanes', bbox: '13.5,124.1,14.0,124.5' },
  { name: 'Masbate', bbox: '11.8,123.4,12.5,124.0' },
  { name: 'Aklan + Capiz + Antique', bbox: '11.0,121.8,12.0,122.8' },
  { name: 'Iloilo', bbox: '10.4,122.2,11.2,122.8' },
  { name: 'Negros Occidental', bbox: '9.8,122.3,11.1,123.3' },
  { name: 'Negros Oriental', bbox: '9.0,122.8,10.7,123.6' },
  { name: 'Cebu', bbox: '9.8,123.3,11.3,124.1' },
  { name: 'Bohol', bbox: '9.5,123.7,10.3,124.6' },
  { name: 'Siquijor', bbox: '9.1,123.4,9.3,123.6' },
  { name: 'Leyte + Biliran', bbox: '10.1,124.2,11.8,125.1' },
  { name: 'Eastern + Western + Northern Samar', bbox: '11.0,124.0,12.6,125.7' },
  { name: 'Zamboanga del Norte + del Sur', bbox: '7.0,121.8,8.5,123.5' },
  { name: 'Misamis Occidental + Oriental', bbox: '7.8,123.2,9.0,124.8' },
  { name: 'Cagayan de Oro + Iligan', bbox: '8.0,124.0,8.7,124.8' },
  { name: 'Lanao del Norte + Sur', bbox: '7.5,123.8,8.5,124.5' },
  { name: 'Bukidnon', bbox: '7.5,124.5,8.5,125.5' },
  { name: 'Davao City + del Norte', bbox: '7.0,125.3,7.7,126.0' },
  { name: 'Davao del Sur + Sarangani', bbox: '5.9,124.8,6.8,125.5' },
  { name: 'Davao Oriental', bbox: '6.5,126.0,7.8,126.7' },
  { name: 'North + South Cotabato', bbox: '6.5,124.5,7.5,125.5' },
  { name: 'General Santos City', bbox: '6.0,125.0,6.3,125.3' },
  { name: 'Agusan del Norte + Sur', bbox: '8.0,125.5,9.0,126.3' },
  { name: 'Surigao del Norte + Sur', bbox: '7.9,125.3,10.0,126.7' },
  { name: 'Maguindanao + Cotabato City', bbox: '6.8,124.0,7.4,124.6' },
  { name: 'Basilan + Sulu + Tawi-Tawi', bbox: '4.5,119.0,6.7,122.5' },
];

// Google Maps search queries specifically for cab/multicab/taxi terminals
const GMAPS_CAB_QUERIES = [
  // Metro Manila
  'multicab terminal Manila Philippines',
  'taxi terminal EDSA Manila Philippines',
  'cab terminal Quezon City Philippines',
  'taxi terminal Makati Philippines',
  'cab stand Pasay Manila Philippines',
  // Luzon
  'multicab terminal Baguio City Philippines',
  'taxi terminal Dagupan Pangasinan Philippines',
  'cab terminal San Fernando Pampanga Philippines',
  'taxi terminal Laoag Ilocos Norte Philippines',
  'cab terminal Vigan Ilocos Sur Philippines',
  // Visayas
  'multicab terminal Cebu City Philippines',
  'multicab terminal Lapu-Lapu City Cebu Philippines',
  'multicab terminal Mandaue Cebu Philippines',
  'multicab terminal Iloilo City Philippines',
  'multicab terminal Bacolod City Negros Occidental Philippines',
  'multicab terminal Dumaguete Negros Oriental Philippines',
  'multicab terminal Tagbilaran Bohol Philippines',
  'multicab terminal Ormoc Leyte Philippines',
  'multicab terminal Tacloban Leyte Philippines',
  'multicab terminal Calbayog Samar Philippines',
  // Mindanao — multicab is most common here
  'multicab terminal Davao City Philippines',
  'multicab terminal General Santos City Philippines',
  'multicab terminal Cagayan de Oro Philippines',
  'multicab terminal Iligan City Philippines',
  'multicab terminal Zamboanga City Philippines',
  'multicab terminal Pagadian City Philippines',
  'multicab terminal Digos City Philippines',
  'multicab terminal Koronadal City Philippines',
  'multicab terminal Cotabato City Philippines',
  'multicab terminal Midsayap Cotabato Philippines',
  'multicab terminal Kidapawan Philippines',
  'multicab terminal Butuan City Agusan Philippines',
  'multicab terminal Surigao City Philippines',
  'multicab terminal Dipolog Zamboanga del Norte Philippines',
  'multicab terminal Ozamiz City Philippines',
  'multicab terminal Cagayan de Oro Divisoria Philippines',
  'taxi terminal Davao City Philippines',
  'taxi terminal Cagayan de Oro Philippines',
  'taxi terminal General Santos Philippines',
];

// ── OSM fetch ─────────────────────────────────────────────────────────────────
async function fetchOSM(bbox) {
  const [s, w, n, e] = bbox.split(',');
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="taxi"]["name"](${s},${w},${n},${e});
      node["amenity"="taxi_stand"]["name"](${s},${w},${n},${e});
      node["public_transport"="stop_position"]["name"~"[Cc]ab|[Tt]axi|[Mm]ulticab|[Mm]ulti-cab",i](${s},${w},${n},${e});
      node["amenity"="bus_station"]["name"~"[Cc]ab|[Tt]axi|[Mm]ulticab",i](${s},${w},${n},${e});
    );
    out body;
  `;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`OSM HTTP ${res.status}`);
  const json = await res.json();
  return (json.elements || []).map(el => ({
    name: el.tags?.name || el.tags?.['name:en'] || null,
    lat: el.lat,
    lng: el.lon,
  })).filter(t => t.name && t.name.length > 2);
}

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function isDuplicate(lat, lng, name) {
  const res = await pool.query(`
    SELECT id FROM terminals
    WHERE ABS(lat - $1) < $3 AND ABS(lng - $2) < $3
    LIMIT 1
  `, [lat, lng, DEDUP_DIST]);
  if (res.rows.length > 0) return true;

  // Also check same name within wider radius (500m)
  const res2 = await pool.query(`
    SELECT id FROM terminals
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
      AND ABS(lat - $2) < 0.005 AND ABS(lng - $3) < 0.005
    LIMIT 1
  `, [name, lat, lng]);
  return res2.rows.length > 0;
}

async function insertTerminal(name, lat, lng) {
  const dup = await isDuplicate(lat, lng, name);
  if (dup) return false;
  await pool.query(`
    INSERT INTO terminals (id, name, type, lat, lng, created_at, updated_at)
    VALUES (gen_random_uuid(), $1, 'Cab', $2, $3, NOW(), NOW())
  `, [name, lat, lng]);
  return true;
}

// ── Google Maps scraper ────────────────────────────────────────────────────────
async function scrapeGMaps(page, query) {
  const results = [];
  try {
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);

    // Check if we landed on a single place (not a list)
    const singlePlace = await page.$('h1.DUwDvf, h1.fontHeadlineLarge');
    if (singlePlace) {
      const data = await page.evaluate(() => {
        const h1 = document.querySelector('h1.DUwDvf, h1.fontHeadlineLarge');
        const m = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (!h1 || !m) return null;
        return { name: h1.textContent.trim(), lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
      });
      if (data) results.push(data);
      return results;
    }

    // Extract all results from the search list directly (no click-back needed)
    const items = await page.evaluate(() => {
      const out = [];
      // Each result card has aria-label with name, and data inside
      for (const el of document.querySelectorAll('a.hfpxzc[aria-label]')) {
        const name = el.getAttribute('aria-label');
        // Try to get coords from the href
        const href = el.href || '';
        const m = href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (name && m) {
          out.push({ name: name.trim(), lat: parseFloat(m[1]), lng: parseFloat(m[2]) });
        }
      }
      return out;
    });

    // Accept all results from cab/multicab/taxi searches — the query is the filter
    results.push(...items.slice(0, 10));
  } catch (e) {
    console.error(`  GMaps error for "${query}": ${e.message.split('\n')[0]}`);
  }
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const state = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { doneOSM: [], doneGMaps: [] };

  let totalInserted = 0;
  let totalSkipped = 0;

  console.log('🚕 Phase 1: OSM Overpass — taxi/cab nodes nationwide...\n');

  for (const region of PH_REGIONS) {
    if (state.doneOSM.includes(region.name)) {
      process.stdout.write(`  [skip] ${region.name}\n`);
      continue;
    }
    process.stdout.write(`  ${region.name}... `);
    try {
      const nodes = await fetchOSM(region.bbox);
      let inserted = 0;
      for (const node of nodes) {
        const ok = await insertTerminal(node.name, node.lat, node.lng);
        if (ok) inserted++;
        else totalSkipped++;
      }
      totalInserted += inserted;
      console.log(`${nodes.length} found, ${inserted} new`);
      state.doneOSM.push(region.name);
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
      console.log(`ERROR: ${e.message.split('\n')[0]}`);
    }
    await new Promise(r => setTimeout(r, 1000)); // rate limit
  }

  console.log('\n🚕 Phase 2: Google Maps — multicab/taxi terminal searches...\n');

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  for (const query of GMAPS_CAB_QUERIES) {
    if (state.doneGMaps.includes(query)) {
      process.stdout.write(`  [skip] ${query}\n`);
      continue;
    }
    process.stdout.write(`  "${query}"... `);
    const results = await scrapeGMaps(page, query);
    let inserted = 0;
    for (const r of results) {
      const ok = await insertTerminal(r.name, r.lat, r.lng);
      if (ok) inserted++;
      else totalSkipped++;
    }
    totalInserted += inserted;
    console.log(`${results.length} matched, ${inserted} new`);
    state.doneGMaps.push(query);
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    await new Promise(r => setTimeout(r, 500));
  }

  await browser.close();
  await pool.end();

  console.log(`\n✅ Done — ${totalInserted} new Cab terminals inserted, ${totalSkipped} duplicates skipped`);

  // Show final count
  const { Pool: P2 } = require('pg');
  const p2 = new P2({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  const r = await p2.query("SELECT COUNT(*) FROM terminals WHERE type = 'Cab'");
  console.log(`📊 Total Cab terminals in DB: ${r.rows[0].count}`);
  await p2.end();
}

main().catch(e => { console.error(e); process.exit(1); });
