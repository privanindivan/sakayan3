/**
 * Scrape Google Maps for terminal details + photos, upload to Cloudinary, update DB.
 * Usage: node scripts/scrape_gmaps_enrichment.js [--limit 50] [--type Bus]
 *
 * Skips terminals that already have images.
 * Saves progress to scripts/enrichment_progress.json so you can resume.
 */

require('dotenv').config({ path: '.env.local' });
const { chromium } = require('playwright');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const DB_URL = (process.env.DATABASE_URL || '').replace(':5432/', ':6543/');
const PROGRESS_FILE = path.join(__dirname, 'enrichment_progress.json');
const DELAY_MS = 2500;          // between terminals
const MAX_PHOTOS = 4;            // max photos to upload per terminal
const HEADLESS = true;

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const typeIdx  = args.indexOf('--type');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : 100;
const TYPE_FILTER = typeIdx !== -1 ? args[typeIdx + 1] : null;
const RETRY_NO_PHOTOS = args.includes('--retry-no-photos'); // retry processed terminals that got 0 photos

// ── Init ──────────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

function loadProgress() {
  try { return new Set(JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))); }
  catch { return new Set(); }
}
function saveProgress(done) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify([...done]));
}

// ── Google Maps scraper ───────────────────────────────────────────────────────
async function scrapePlace(page, terminal) {
  const { name, lat, lng } = terminal;

  // Intercept photo URLs from network requests
  const capturedPhotoUrls = new Set();
  const onRequest = (request) => {
    const url = request.url();
    // Capture any lh3.googleusercontent.com photo URLs (gps-cs-s/, geougc-cs/, photo/ paths)
    if (
      (url.includes('lh3.googleusercontent.com') || url.includes('lh5.googleusercontent.com')) &&
      !url.includes('photo_base64') &&
      !url.includes('/avatar') &&
      !url.includes('/userpic') &&
      !url.match(/\/a\/[A-Za-z0-9_-]{5,}=s\d{1,3}/) &&
      url.length > 80
    ) {
      capturedPhotoUrls.add(url);
    }
  };
  page.on('request', onRequest);

  // Navigate to search near coords
  const url = `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},15z?hl=en`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(1500);

  // If landed on a list, click the first result
  const firstResultLink = await page.$('a.hfpxzc');
  if (firstResultLink) {
    try {
      await firstResultLink.click({ timeout: 5000 });
    } catch {
      // If not clickable (hidden/blocked), try force click
      try { await firstResultLink.click({ force: true, timeout: 3000 }); } catch {}
    }
    await page.waitForTimeout(2000);
  }

  // Check if we have a place panel
  const panelTitle = await page.$('h1.DUwDvf, h1.fontHeadlineLarge');
  if (!panelTitle) return null;

  // ── Extract details text ──
  const details = await page.evaluate(() => {
    const parts = [];

    // Category (e.g. "Bus terminal")
    const cat = document.querySelector('button.DkEaL');
    if (cat) parts.push(cat.textContent.trim());

    // Address
    const addr = document.querySelector('button[data-item-id="address"] .Io6YTe');
    if (addr) parts.push(addr.textContent.trim());

    // Hours summary
    const hours = document.querySelector('.t39EBf .OqCZI');
    if (hours) parts.push(hours.textContent.trim());

    // Phone
    const phone = document.querySelector('button[data-item-id^="phone"] .Io6YTe');
    if (phone) parts.push('Phone: ' + phone.textContent.trim());

    // Editorial / description
    const editorial = document.querySelector('.PYvSYb, .HlvSq');
    if (editorial) parts.push(editorial.textContent.trim());

    const NOISE = ['You\'ve reached the end of the list', 'Suggest an edit', 'Add a photo', 'Send to your phone'];
    return parts
      .filter(Boolean)
      .filter(p => !NOISE.some(n => p.includes(n)))
      .join(' | ') || null;
  });

  // ── Extract schedule from opening hours ──
  const schedule = await page.evaluate(() => {
    // Try to get full hours by clicking the hours row to expand it
    const hoursBtn = document.querySelector('[data-item-id="oh"] button, .t39EBf button, [jsaction*="pane.openhours"]');
    if (hoursBtn) hoursBtn.click();

    // Wait a tick for DOM update then read expanded hours table
    const rows = [...document.querySelectorAll('.t39EBf .OqCZI, .y0skZc .OqCZI, [data-hide-tooltip-on-mouse-out] .OqCZI')];
    // Parse "Open ⋅ 5 AM–10 PM" or "5 AM–10 PM" style
    for (const row of rows) {
      const text = row.textContent.trim();
      const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
      if (!m) continue;
      const to24 = (h, min, ap) => {
        h = parseInt(h); min = parseInt(min || 0);
        if (ap.toUpperCase() === 'AM') return `${String(h === 12 ? 0 : h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
        return `${String(h === 12 ? 12 : h + 12).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
      };
      return { days: 'Daily', start: to24(m[1], m[2], m[3]), end: to24(m[4], m[5], m[6]) };
    }
    return null;
  });

  // ── Click main place photo to open gallery and load more photo requests ──
  const photoBtn = await page.$('button[aria-label^="Photo of"], button[aria-label="Photos"], button[aria-label="See photos"]');
  if (photoBtn) {
    try {
      await photoBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2500);
      // Cycle through a few photos to trigger loading of more URLs
      for (let i = 0; i < 4; i++) {
        const next = await page.$('button[aria-label="Next Photo"], button[aria-label="Next photo"]');
        if (next) { try { await next.click({ timeout: 3000 }); } catch {} await page.waitForTimeout(600); }
      }
    } catch {}
  } else {
    // Fallback: scroll the main panel to trigger lazy-load of any thumbnails
    await page.evaluate(() => {
      const panel = document.querySelector('.m6QErb, .DxyBCb, [role="main"]');
      if (panel) panel.scrollTop += 600;
    });
    await page.waitForTimeout(1000);
  }

  // Remove request listener — we have all intercepted URLs now
  page.off('request', onRequest);

  // Use network-intercepted URLs as primary source (more reliable than DOM for lazy-loaded GMaps photos)
  const photoUrls = [...capturedPhotoUrls].slice(0, 8);

  return { details, photoUrls, schedule };
}

// ── Cloudinary upload ─────────────────────────────────────────────────────────
async function uploadPhoto(imageUrl) {
  try {
    const res = await cloudinary.uploader.upload(imageUrl, {
      folder: 'sakayan/terminals',
      resource_type: 'image',
      fetch_format: 'auto',
      quality: 'auto',
    });
    return res.secure_url;
  } catch (e) {
    // Try without the resolution suffix
    try {
      const clean = imageUrl.replace(/=s\d+.*$/, '').replace(/=w\d+.*$/, '');
      const res = await cloudinary.uploader.upload(clean, {
        folder: 'sakayan/terminals',
        resource_type: 'image',
      });
      return res.secure_url;
    } catch (e2) {
      return null;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const done = loadProgress();

  let typeWhere = TYPE_FILTER ? `AND type = '${TYPE_FILTER}'` : `AND type IN ('Bus','Train','Ferry','Jeep','UV','Cab','Tricycle')`;

  const { rows: terminals } = await pool.query(`
    SELECT id, name, lat, lng, type
    FROM terminals
    WHERE (images IS NULL OR array_length(images, 1) IS NULL OR array_length(images, 1) = 0)
    ${typeWhere}
    ORDER BY
      CASE type
        WHEN 'Train' THEN 1
        WHEN 'Bus' THEN 2
        WHEN 'Ferry' THEN 3
        WHEN 'Jeep' THEN 4
        ELSE 5
      END,
      name
    LIMIT ${LIMIT * 3}
  `);

  // In retry mode, re-process even previously done terminals (they have empty images)
  const toProcess = RETRY_NO_PHOTOS
    ? terminals.slice(0, LIMIT)
    : terminals.filter(t => !done.has(t.id)).slice(0, LIMIT);
  console.log(`\n📍 Processing ${toProcess.length} terminals (skipping ${done.size} already done)${RETRY_NO_PHOTOS ? ' [retry-no-photos]' : ''}\n`);

  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  let enriched = 0, skipped = 0, errors = 0;

  for (const terminal of toProcess) {
    process.stdout.write(`[${terminal.type}] ${terminal.name} ... `);
    try {
      const result = await scrapePlace(page, terminal);

      if (!result) {
        console.log('⚠ no place found');
        done.add(terminal.id);
        skipped++;
        saveProgress(done);
        await page.waitForTimeout(DELAY_MS);
        continue;
      }

      const { details, photoUrls, schedule } = result;

      // Upload photos to Cloudinary
      const uploaded = [];
      for (const url of photoUrls.slice(0, MAX_PHOTOS)) {
        const cloudUrl = await uploadPhoto(url);
        if (cloudUrl) uploaded.push(cloudUrl);
      }

      // Update DB — also save schedule if found and terminal has none yet
      await pool.query(
        `UPDATE terminals
         SET details    = COALESCE(NULLIF($1,''), details),
             images     = CASE WHEN array_length($2::text[], 1) > 0 THEN $2::text[] ELSE images END,
             schedule   = CASE WHEN schedule IS NULL AND $4::jsonb IS NOT NULL THEN $4::jsonb ELSE schedule END,
             updated_at = NOW()
         WHERE id = $3`,
        [details, uploaded, terminal.id, schedule ? JSON.stringify(schedule) : null]
      );

      console.log(`✓  details: ${details ? details.substring(0, 60) + '…' : 'none'} | photos: ${uploaded.length}${schedule ? ' | sched:' + schedule.start + '-' + schedule.end : ''}`);
      enriched++;
      done.add(terminal.id);
      saveProgress(done);
    } catch (e) {
      console.log(`✗  ${e.message}`);
      errors++;
    }

    await page.waitForTimeout(DELAY_MS);
  }

  await browser.close();
  await pool.end();

  console.log(`\n✅ Done — enriched: ${enriched}, skipped: ${skipped}, errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });
