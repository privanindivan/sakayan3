/**
 * Enrich Sakayan terminals with Google Maps data via Apify (batched).
 * Extracts: category, address, hours, phone, website, description, photos.
 * Uploads photos to Cloudinary, saves details + images to Supabase DB.
 *
 * Usage:
 *   node scripts/apify_enrich_terminals.js [--limit 500] [--batch 80]
 *
 * Progress saved to scripts/apify_progress.json — safe to resume.
 */

require('dotenv').config({ path: '.env.local' });
const { ApifyClient } = require('apify-client');
const { Pool }        = require('pg');
const cloudinary      = require('cloudinary').v2;
const fs              = require('fs');
const path            = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const ACTOR_ID      = 'compass/crawler-google-places';
const PROGRESS_FILE = path.join(__dirname, 'apify_progress.json');
const MAX_PHOTOS    = 4;

const args      = process.argv.slice(2);
const limitIdx  = args.indexOf('--limit');
const batchIdx  = args.indexOf('--batch');
const LIMIT     = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 500;
const BATCH     = batchIdx !== -1 ? parseInt(args[batchIdx + 1]) : 80;

// ── Init ──────────────────────────────────────────────────────────────────────
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const pool  = new Pool({
  connectionString: (process.env.DATABASE_URL || '').replace(':5432/', ':6543/'),
  ssl: { rejectUnauthorized: false },
});
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Progress ──────────────────────────────────────────────────────────────────
function loadProgress() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
}

// ── Build startUrl for each terminal ─────────────────────────────────────────
// Encodes terminal DB id in the URL hash so we can match results back
function buildSearchUrl(terminal) {
  const q = encodeURIComponent(terminal.name);
  return {
    url: `https://www.google.com/maps/search/${q}/@${terminal.lat},${terminal.lng},14z?hl=en`,
    userData: { terminalId: terminal.id, terminalName: terminal.name },
  };
}

// ── Run one Apify batch ───────────────────────────────────────────────────────
async function runBatch(terminals) {
  const startUrls = terminals.map(buildSearchUrl);

  console.log(`  → Submitting ${terminals.length} URLs to Apify...`);
  const run = await apify.actor(ACTOR_ID).call(
    {
      startUrls,
      maxCrawledPlacesPerSearch: 1,
      includeOpeningHours: true,
      scrapeImages: false,
      maxImages: 0,
      maxReviews: 0,
      language: 'en',
    },
    { waitSecs: 600, memory: 1024 }
  );

  const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: terminals.length * 2 });
  return items || [];
}

// ── Match Apify result to terminal by search URL coords/name ──────────────────
function matchResult(item, terminalsMap) {
  // Apify returns searchPageUrl like: ...maps/search/NAME/@LAT,LNG,...
  // Try matching by the encoded name in the URL
  const url = item.searchPageUrl || '';
  for (const [id, t] of terminalsMap) {
    const encoded = encodeURIComponent(t.name).toLowerCase();
    if (url.toLowerCase().includes(encoded.substring(0, 20))) return t;
  }
  // Fallback: match by proximity to result coordinates
  if (item.location?.lat && item.location?.lng) {
    let closest = null, minDist = 0.05; // ~5km threshold
    for (const [id, t] of terminalsMap) {
      const d = Math.abs(t.lat - item.location.lat) + Math.abs(t.lng - item.location.lng);
      if (d < minDist) { minDist = d; closest = t; }
    }
    return closest;
  }
  return null;
}

// ── Build details string from Apify result ────────────────────────────────────
function buildDetails(item) {
  const parts = [
    item.categoryName || null,
    item.address      || null,
    item.phone        ? 'Phone: ' + item.phone : null,
    item.website      ? 'Web: '   + item.website : null,
    item.openingHours?.length
      ? item.openingHours.map(h => `${h.day}: ${h.hours}`).join(', ')
      : null,
    item.description  || null,
  ].filter(Boolean);
  return parts.join(' | ') || null;
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadPhoto(url) {
  try {
    const res = await cloudinary.uploader.upload(url, {
      folder: 'sakayan/terminals',
      fetch_format: 'auto',
      quality: 'auto',
    });
    return res.secure_url;
  } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const done = loadProgress();

  const { rows: allTerminals } = await pool.query(`
    SELECT id, name, lat, lng, type
    FROM terminals
    WHERE type IN ('Bus','Train','Ferry','Jeep','UV')
    AND (details IS NULL OR details = '')
    ORDER BY CASE type
      WHEN 'Train' THEN 1 WHEN 'Bus' THEN 2
      WHEN 'Ferry' THEN 3 WHEN 'Jeep' THEN 4 ELSE 5
    END, name
    LIMIT $1
  `, [LIMIT * 4]);

  const toProcess = allTerminals.filter(t => !done.has(t.id)).slice(0, LIMIT);
  console.log(`\n📍 ${toProcess.length} terminals to enrich (${done.size} already done)\n`);

  let enriched = 0, skipped = 0, errors = 0;
  const batches = [];
  for (let i = 0; i < toProcess.length; i += BATCH) {
    batches.push(toProcess.slice(i, i + BATCH));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`\n🔄 Batch ${bi + 1}/${batches.length} (${batch.length} terminals)`);

    const terminalsMap = new Map(batch.map(t => [t.id, t]));

    let results = [];
    try {
      results = await runBatch(batch);
      console.log(`  ← Got ${results.length} results from Apify`);
    } catch (e) {
      console.error(`  ✗ Batch failed: ${e.message}`);
      errors += batch.length;
      continue;
    }

    // Process each result
    const matched = new Set();
    for (const item of results) {
      const terminal = matchResult(item, terminalsMap);
      if (!terminal || matched.has(terminal.id)) continue;
      matched.add(terminal.id);

      const details = buildDetails(item);
      const imageUrls = (item.imageUrls || []).slice(0, MAX_PHOTOS);

      // Upload photos to Cloudinary
      const uploaded = [];
      for (const url of imageUrls) {
        const cu = await uploadPhoto(url);
        if (cu) uploaded.push(cu);
      }

      try {
        await pool.query(
          `UPDATE terminals
           SET details    = COALESCE(NULLIF($1,''), details),
               images     = CASE WHEN array_length($2::text[],1) > 0 THEN $2::text[] ELSE images END,
               updated_at = NOW()
           WHERE id = $3`,
          [details, uploaded, terminal.id]
        );
        console.log(`  ✓ [${terminal.type}] ${terminal.name} — ${details ? details.substring(0,60)+'…' : 'no details'} | ${uploaded.length} photos`);
        enriched++;
      } catch (e) {
        console.log(`  ✗ DB update failed for ${terminal.name}: ${e.message}`);
        errors++;
      }

      done.add(terminal.id);
    }

    // Mark unmatched terminals as done (not found)
    for (const t of batch) {
      if (!matched.has(t.id)) {
        console.log(`  ⚠ [${t.type}] ${t.name} — not found in Google Maps`);
        skipped++;
        done.add(t.id);
      }
    }

    saveProgress(done);
    console.log(`  Progress: enriched=${enriched} skipped=${skipped} errors=${errors}`);
  }

  await pool.end();
  console.log(`\n✅ Done — enriched: ${enriched}, skipped: ${skipped}, errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
