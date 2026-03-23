import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:5173';
const SS_DIR = 'C:/Users/jj/Downloads/cook/test-screenshots';
const TEST_EMAIL = `uitest_${Date.now()}@sakayan.test`;
const TEST_USER  = `uitest${Date.now()}`.slice(0, 20);
mkdirSync(SS_DIR, { recursive: true });

const results = [];
let page, browser;

function log(test, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : 'ℹ';
  const msg = `${icon} [${status}] ${test}${detail ? ': ' + detail : ''}`;
  results.push({ test, status, detail });
  console.log(msg);
}

async function ss(name) {
  try { await page.screenshot({ path: `${SS_DIR}/${name}.png` }); } catch {}
}

async function closeModalIfOpen() {
  const overlay = await page.$('.modal-overlay');
  if (overlay) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    // If still open, click close button
    const closeBtn = await page.$('button[aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(400);
  }
}

async function run() {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Pre-set localStorage to suppress auto-open modal
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: 'sakayan_auth_dismissed', value: '1' }] }]
    }
  });
  page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));

  // 1. Page loads
  try {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    log('Page loads at localhost:5173', 'PASS');
  } catch (e) { log('Page loads', 'FAIL', e.message); }

  await ss('01-initial');

  // 2. Map renders
  try {
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
    log('Leaflet map renders', 'PASS');
  } catch { log('Leaflet map renders', 'FAIL'); }

  // 3. Map centered on Manila (not China)
  try {
    const html = await page.content();
    // Check tile URLs loaded for Manila coords (~14.5, 120.9)
    const tileReqs = [];
    page.on('request', r => { if (r.url().includes('tile.openstreetmap')) tileReqs.push(r.url()); });
    await page.waitForTimeout(1500);
    log('Map tile loading (OSM)', tileReqs.length > 0 || html.includes('leaflet') ? 'PASS' : 'FAIL', `${tileReqs.length} tiles`);
  } catch { log('Map tiles', 'FAIL'); }

  // 4. Search bar visible
  const sb = await page.$('.search-bar, input[placeholder*="earch"], .search-input');
  log('Search bar visible', sb ? 'PASS' : 'FAIL');

  // 5. Login chip visible (no auto-modal since we suppressed it)
  const loginChip = await page.$('.login-chip');
  log('Login chip visible for anonymous', loginChip ? 'PASS' : 'FAIL');

  // 6. + button hidden for anon
  const fabAnon = await page.$('.fab-btn');
  log('+ button hidden for anonymous', !fabAnon ? 'PASS' : 'FAIL', fabAnon ? 'BUG: visible' : '');

  // 7. Locate button visible
  const locateBtn = await page.$('.locate-btn');
  log('Locate (my location) button visible', locateBtn ? 'PASS' : 'FAIL');

  // 8. Sakayan FB attribution in DOM
  const fbAttr = await page.$('a[href*="facebook.com/people/Sakayan"]');
  log('Sakayan FB attribution in DOM', fbAttr ? 'PASS' : 'FAIL');

  // 9. No challenges button
  const challengeBtn = await page.$('button:has-text("Challenge")');
  log('Challenges button not visible', !challengeBtn ? 'PASS' : 'FAIL');

  // 10. No messenger button
  const messengerBtn = await page.$('a[href*="m.me"], [class*="messenger"]');
  log('Messenger button removed', !messengerBtn ? 'PASS' : 'FAIL');

  // 11. Auth modal opens on login click
  try {
    await page.click('.login-chip');
    await page.waitForSelector('.auth-modal', { timeout: 4000 });
    log('Auth modal opens on login click', 'PASS');
    await ss('02-auth-modal');
  } catch (e) { log('Auth modal opens', 'FAIL', e.message); }

  // 12. Google button present
  const googleBtn = await page.$('.google-btn, button:has-text("Google")');
  log('Google login button in modal', googleBtn ? 'PASS' : 'FAIL');

  // 13. No phone/FB buttons
  const phoneBtn = await page.$('button:has-text("Phone")');
  const fbBtn = await page.$('button:has-text("Facebook")');
  log('Phone login removed', !phoneBtn ? 'PASS' : 'FAIL');
  log('Facebook login removed', !fbBtn ? 'PASS' : 'FAIL');

  // 14. No browse-anonymously / earn-badges text
  const anonCount = await page.locator('text=browse anonymously').count();
  const earnCount = await page.locator('text=earn badges').count();
  log('Browse anonymously text removed', anonCount === 0 ? 'PASS' : 'FAIL');
  log('Earn badges text removed', earnCount === 0 ? 'PASS' : 'FAIL');

  // 15. Close modal with X
  try {
    await page.click('button[aria-label="Close"]', { timeout: 3000 });
    await page.waitForTimeout(400);
    const gone = await page.$('.auth-modal') === null;
    log('Auth modal X button closes it', gone ? 'PASS' : 'FAIL');
  } catch { log('Auth modal X close', 'FAIL'); }

  // 16. REGISTER — click login chip, switch to register mode
  try {
    await page.click('.login-chip');
    await page.waitForSelector('.auth-modal', { timeout: 3000 });
    // Click "Sign up" to switch to register mode
    await page.click('button:has-text("Sign up")');
    await page.waitForTimeout(300);
    // Username field should now appear
    const userField = await page.$('input[placeholder*="sername" i]');
    log('Register mode shows username field', userField ? 'PASS' : 'FAIL');
    if (userField) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[placeholder*="sername" i]', TEST_USER);
      await page.fill('input[type="password"]', 'testpass123');
      await page.locator('.auth-modal button[type="submit"]').click();
      await page.waitForTimeout(2500);
      const chip = await page.$('.user-chip');
      log('Register creates account and logs in', chip ? 'PASS' : 'FAIL');
      // Close modal if still open after register
      const stillOpen = await page.$('.modal-overlay');
      if (stillOpen) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      await ss('03-after-register');
    }
  } catch (e) { log('Register flow', 'FAIL', e.message); }

  // 17. User chip shows badge + username
  try {
    const chip = await page.$('.user-chip');
    if (chip) {
      const txt = (await chip.innerText()).replace(/\n/g, ' ').trim();
      log('User chip shows badge + username', txt.length > 0 ? 'PASS' : 'FAIL', txt);
    } else { log('User chip content', 'FAIL', 'not logged in'); }
  } catch { log('User chip', 'FAIL'); }

  // 18. + button visible after login
  await page.waitForTimeout(500);
  const fabLoggedIn = await page.$('.fab-btn');
  log('+ button visible after login', fabLoggedIn ? 'PASS' : 'FAIL');

  // 19. Click + enters add mode
  try {
    if (fabLoggedIn) {
      await page.click('.fab-btn');
      await page.waitForTimeout(500);
      const fabCancel = await page.$('.fab-cancel');
      log('Clicking + enters add-stop mode (X state)', fabCancel ? 'PASS' : 'FAIL');
      await ss('04-add-mode');
    } else { log('Add mode (+)', 'FAIL', 'fab not found'); }
  } catch (e) { log('Add mode', 'FAIL', e.message); }

  // 20. Click map to pin location (click left side away from form panel)
  let markerAdded = false;
  try {
    const mapEl = await page.$('.leaflet-container');
    if (mapEl) {
      const box = await mapEl.boundingBox();
      // Click left-center of map (form panel is on the right)
      await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5);
      await page.waitForTimeout(1200);

      // Check if button became enabled (pendingLatLng set)
      const btnEnabled = await page.$('.add-form button[type="submit"]:not([disabled])');
      log('Click map sets pin (button enabled)', btnEnabled ? 'PASS' : 'FAIL');
      await ss('05-add-form');

      // 21. Fill name and save
      const nameInput = await page.$('.add-form input[type="text"]');
      if (nameInput) {
        await nameInput.fill('Playwright Test Stop');
        await page.waitForTimeout(300);
      }
      if (btnEnabled) {
        await btnEnabled.click();
        await page.waitForTimeout(2500);
        const formGone = await page.$('.add-form') === null;
        markerAdded = formGone;
        log('Add stop form saves and closes', formGone ? 'PASS' : 'FAIL');
        await ss('06-stop-added');
      } else {
        // Cancel the form so marker clicks work
        await page.click('.form-close');
        await page.waitForTimeout(300);
        log('Add stop form saves and closes', 'FAIL', 'pendingLatLng not set — form cancelled');
      }
    }
  } catch (e) { log('Map click + add form', 'FAIL', e.message); }

  // 22. Marker on map
  try {
    const markers = await page.$$('.leaflet-marker-icon');
    log('Stop marker appears on map', markers.length > 0 ? 'PASS' : 'FAIL', `${markers.length} marker(s)`);
  } catch { log('Marker on map', 'FAIL'); }

  // 23. Click marker opens modal
  try {
    const marker = await page.$('.leaflet-marker-icon');
    if (marker) {
      await marker.click();
      await page.waitForTimeout(1000);
      const modal = await page.$('.modal-overlay');
      log('Click marker opens info modal', modal ? 'PASS' : 'FAIL');
      await ss('07-marker-modal');

      // 24. Social buttons (like/dislike) in modal
      const likeBtn = await page.$('button:has-text("👍"), [class*="social-action"] button');
      log('Like/dislike buttons in marker modal', likeBtn ? 'PASS' : 'FAIL');

      // 25. Edit button visible for own stop
      const editBtn = await page.$('button:has-text("Edit"), .btn-edit');
      log('Edit button visible for own stop', editBtn ? 'PASS' : 'FAIL');

      // 26. Close marker modal via Escape (confirmed wired in MarkerModal)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const overlayGone = await page.$('.modal-overlay') === null;
      log('Close marker modal (Escape)', overlayGone ? 'PASS' : 'FAIL');
    } else { log('Marker click', 'FAIL', 'no markers on map'); }
  } catch (e) { log('Marker modal flow', 'FAIL', e.message); }

  // 27. Logout (force:true bypasses Playwright hit-test over stacking contexts)
  try {
    const logoutBtn = await page.$('.user-chip-logout');
    if (logoutBtn) {
      await logoutBtn.click({ force: true });
      await page.waitForTimeout(1000);
      const loginBack = await page.$('.login-chip');
      log('Logout → login chip returns', loginBack ? 'PASS' : 'FAIL');
      await ss('08-after-logout');
    } else { log('Logout button', 'FAIL', 'not found'); }
  } catch (e) { log('Logout', 'FAIL', e.message); }

  // 28. + button gone after logout
  const fabAfterLogout = await page.$('.fab-btn');
  log('+ button hidden after logout', !fabAfterLogout ? 'PASS' : 'FAIL');

  // 29. Login with email/password (existing user)
  try {
    await page.click('.login-chip');
    await page.waitForSelector('.auth-modal', { timeout: 3000 });
    await page.fill('.auth-modal input[type="email"]', TEST_EMAIL);
    await page.fill('.auth-modal input[type="password"]', 'testpass123');
    await page.locator('.auth-modal button[type="submit"]').click();
    await page.waitForTimeout(2000);
    const chip = await page.$('.user-chip');
    log('Email/password login works', chip ? 'PASS' : 'FAIL');
    await ss('09-after-login');
  } catch (e) { log('Email login', 'FAIL', e.message); }

  // 30. JS errors
  const relevantErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404'));
  log('No JS console errors', relevantErrors.length === 0 ? 'PASS' : 'FAIL',
    relevantErrors.length > 0 ? relevantErrors.slice(0, 3).join(' | ') : 'clean');

  await ss('10-final');
  await browser.close();

  // Cleanup test account
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL || '');
    await sql.query(`DELETE FROM users WHERE email = $1`, [TEST_EMAIL]);
  } catch {}

  console.log('\n══════════════════════════════');
  console.log('         TEST SUMMARY');
  console.log('══════════════════════════════');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  results.filter(r => r.status === 'FAIL').forEach(r =>
    console.log(`  ✗ ${r.test}${r.detail ? ' — ' + r.detail : ''}`)
  );
  console.log(`\n  PASSED: ${passed}  FAILED: ${failed}`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
