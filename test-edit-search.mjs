import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { readFileSync } from 'fs';

const BASE = 'http://localhost:5173';
const SS = 'C:/Users/jj/Downloads/cook/test-screenshots';
mkdirSync(SS, { recursive: true });

// Read DB URL from .env.local
const envFile = readFileSync('C:/Users/jj/Downloads/cook/.env.local', 'utf8');
const DB_URL = envFile.match(/DATABASE_URL=(.+)/)[1].trim();

const TEST_EMAIL = `edittest_${Date.now()}@sakayan.test`;
const TEST_USER  = `edtest${Date.now()}`.slice(0, 18);

let page, browser;
const results = [];

function log(test, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : '✗';
  const msg = `${icon} [${status}] ${test}${detail ? ': ' + detail : ''}`;
  results.push({ test, status });
  console.log(msg);
}

async function ss(name) {
  try { await page.screenshot({ path: `${SS}/${name}.png` }); } catch {}
}

async function run() {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: 'sakayan_auth_dismissed', value: '1' }] }]
    }
  });
  page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('  JS ERR:', m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });

  // ── Register & login ──
  await page.click('.login-chip');
  await page.waitForSelector('.auth-modal', { timeout: 3000 });
  await page.click('button:has-text("Sign up")');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[placeholder*="sername" i]', TEST_USER);
  await page.fill('input[type="password"]', 'testpass123');
  await page.locator('.auth-modal button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const chip = await page.$('.user-chip');
  log('Registered and logged in', chip ? 'PASS' : 'FAIL');

  // ── Add Stop A ──
  await page.click('.fab-btn');
  await page.waitForTimeout(300);
  const mapEl = await page.$('.leaflet-container');
  const box = await mapEl.boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.45);
  await page.waitForSelector('.add-form input[type="text"]', { timeout: 8000 });
  const btnA = await page.$('.add-form button[type="submit"]:not([disabled])');
  await page.locator('.add-form input[type="text"]').click();
  await page.locator('.add-form input[type="text"]').fill('Stop Alpha');
  if (btnA) {
    await btnA.click(); await page.waitForTimeout(2000);
  } else {
    // Cancel the form so we can retry
    const closeBtn = await page.$('.form-close');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(300);
  }
  log('Added Stop A', btnA ? 'PASS' : 'FAIL');
  await ss('edit-01-stop-a-added');

  // ── Add Stop B (different map spot) ──
  await page.click('.fab-btn');
  await page.waitForTimeout(300);
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.35);
  await page.waitForSelector('.add-form input[type="text"]', { timeout: 8000 });
  const btnB = await page.$('.add-form button[type="submit"]:not([disabled])');
  await page.locator('.add-form input[type="text"]').click();
  await page.locator('.add-form input[type="text"]').fill('Stop Beta');
  if (btnB) { await btnB.click(); await page.waitForTimeout(2000); }
  log('Added Stop B', btnB ? 'PASS' : 'FAIL');
  await ss('edit-02-stop-b-added');

  // ── Click Stop A marker ──
  const markers = await page.$$('.leaflet-marker-icon');
  log('Two stop markers on map', markers.length >= 2 ? 'PASS' : 'FAIL', `${markers.length} markers`);

  if (markers.length > 0) {
    await markers[0].click();
    await page.waitForTimeout(800);
    const modal = await page.$('.modal-overlay');
    log('Click marker opens modal', modal ? 'PASS' : 'FAIL');
    await ss('edit-03-modal-open');

    // ── Edit button visible ──
    const editBtn = await page.$('button:has-text("Edit"), .btn-edit');
    log('Edit button visible for own stop', editBtn ? 'PASS' : 'FAIL');

    if (editBtn) {
      await editBtn.click({ force: true });
      await page.waitForTimeout(500);
      await ss('edit-04-edit-mode');

      // ── Edit fields appear ──
      const nameField = await page.$('input.edit-field, input[value="Stop Alpha"], input[value="Stop Beta"]');
      log('Name field editable in edit mode', nameField ? 'PASS' : 'FAIL');

      if (nameField) {
        const oldVal = await nameField.inputValue();
        await nameField.triple_click?.() || await nameField.click({ clickCount: 3 });
        await nameField.fill(oldVal + ' EDITED');
        await page.waitForTimeout(300);

        // Save edit
        const saveEdit = await page.$('button:has-text("Save"), .btn-save');
        if (saveEdit) {
          await saveEdit.click({ force: true });
          await page.waitForTimeout(2000);
          // Check modal shows updated name
          const modalText = await page.$('.modal');
          const txt = modalText ? await modalText.innerText() : '';
          const saved = txt.includes('EDITED');
          log('Edit saves and reflects in modal', saved ? 'PASS' : 'FAIL', saved ? '' : 'EDITED not in modal text');
          await ss('edit-05-after-edit');
        } else {
          log('Save edit button', 'FAIL', 'not found');
        }
      }
    }

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ── Search bar: type a stop name ──
  console.log('\n── Search bar test ──');
  try {
    const searchInput = await page.$('.search-bar input, input[placeholder*="earch"], .search-input');
    if (searchInput) {
      await searchInput.click();
      await searchInput.fill('Stop');
      await page.waitForTimeout(1500);
      await ss('edit-06-search-results');

      const suggestions = await page.$$('.search-result, .suggestion, [class*="result"], [class*="suggestion"]');
      log('Search shows stop suggestions', suggestions.length > 0 ? 'PASS' : 'FAIL', `${suggestions.length} results`);

      if (suggestions.length > 0) {
        const firstText = await suggestions[0].innerText();
        log('Search result text visible', firstText.length > 0 ? 'PASS' : 'FAIL', firstText.trim());
      }
    } else {
      log('Search input found', 'FAIL', 'input not found');
    }
  } catch (e) { log('Search bar test', 'FAIL', e.message); }

  // Close any open modal before from/to test
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.waitForSelector('.modal-overlay', { state: 'detached', timeout: 3000 }).catch(() => {});

  // ── FROM/TO routing search ──
  console.log('\n── From/To routing test ──');
  try {
    const searchBar = await page.$('.search-bar');
    if (searchBar) {
      // Look for From and To inputs
      const fromInput = await page.$('input[placeholder*="From"], .from-input input, input:first-of-type');
      const toInput   = await page.$('input[placeholder*="To"], .to-input input');

      if (fromInput) {
        await fromInput.click();
        await fromInput.fill('Stop Alpha');
        await page.waitForTimeout(1200);
        const fromResults = await page.$$('.search-result, [class*="result"]');
        log('From field shows results', fromResults.length > 0 ? 'PASS' : 'FAIL', `${fromResults.length} results`);

        if (fromResults.length > 0) {
          await fromResults[0].click();
          await page.waitForTimeout(800);
          log('From stop selected', 'PASS');
        }
      } else {
        log('From input found', 'FAIL');
      }

      if (toInput) {
        await toInput.click();
        await toInput.fill('Stop Beta');
        await page.waitForTimeout(1200);
        const toResults = await page.$$('.search-result, [class*="result"]');
        log('To field shows results', toResults.length > 0 ? 'PASS' : 'FAIL', `${toResults.length} results`);

        if (toResults.length > 0) {
          await toResults[0].click();
          await page.waitForTimeout(1500);
          const dirPanel = await page.$('.direction-panel, [class*="direction"], [class*="route"]');
          log('Direction panel appears after from+to selected', dirPanel ? 'PASS' : 'FAIL');
          await ss('edit-07-directions');
        }
      } else {
        log('To input found', 'FAIL');
      }
    }
  } catch (e) { log('From/To routing', 'FAIL', e.message); }

  await ss('edit-08-final');
  await browser.close();

  // Cleanup
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(DB_URL);
    await sql.query(`DELETE FROM terminals WHERE name IN ('Stop Alpha', 'Stop Alpha EDITED', 'Stop Beta')`);
    await sql.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
    console.log('\nTest data cleaned up.');
  } catch (e) { console.log('Cleanup error:', e.message); }

  console.log('\n══════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ✗ ${r.test}`));
  console.log(`\n  PASSED: ${passed}  FAILED: ${failed}`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
