const { chromium } = require('playwright');

const BASE = 'https://sakayan.netlify.app';
const results = [];

function pass(name, detail = '') { results.push({ status: 'PASS', name, detail }); console.log(`PASS: ${name}${detail ? ' - ' + detail : ''}`); }
function fail(name, detail = '') { results.push({ status: 'FAIL', name, detail }); console.log(`FAIL: ${name}${detail ? ' - ' + detail : ''}`); }

async function dismissModal(page) {
  try {
    const closeBtn = page.locator('[aria-label="Close"]').first();
    const visible = await closeBtn.isVisible().catch(() => false);
    if (visible) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  } catch (_) {}
}

async function run() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  // 1. Page loads
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  const title = await page.title();
  title ? pass('Page loads', title) : fail('Page loads');

  // 2. Map renders
  await page.waitForSelector('.leaflet-container', { timeout: 15000 }).then(() => pass('Map renders')).catch(() => fail('Map renders'));

  // 3. Pins visible
  await page.waitForTimeout(4000);
  const pinCount = await page.locator('.leaflet-marker-icon').count();
  pinCount > 100 ? pass('Terminals visible on map', pinCount + ' markers') : fail('Terminals visible on map', 'only ' + pinCount + ' markers');

  // 4. Search bar
  const searchVisible = await page.locator('input').first().isVisible().catch(() => false);
  searchVisible ? pass('Search input visible') : fail('Search input visible');

  // Dismiss auth modal that auto-opens after data load
  await dismissModal(page);

  // 5. Click pin, modal opens
  try {
    const firstPin = page.locator('.leaflet-marker-icon').first();
    await firstPin.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1500);
    const modalVisible = await page.locator('[class*="modal"]').first().isVisible().catch(() => false);
    modalVisible ? pass('Terminal modal opens on pin click') : fail('Terminal modal opens on pin click');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch(e) {
    fail('Terminal modal opens on pin click', e.message);
  }

  // 6. Login button
  const loginBtn = page.locator('button').filter({ hasText: /log.?in|sign.?in/i }).first();
  const loginBtnVisible = await loginBtn.isVisible().catch(() => false);
  loginBtnVisible ? pass('Login button visible') : fail('Login button visible');

  if (loginBtnVisible) {
    await loginBtn.click();
    await page.waitForTimeout(1000);
    const authModal = await page.locator('[class*="auth"]').first().isVisible().catch(() => false);
    authModal ? pass('Auth modal opens') : fail('Auth modal opens');
    const googleBtn = await page.locator('button').filter({ hasText: /google/i }).first().isVisible().catch(() => false);
    googleBtn ? pass('Google login button present') : fail('Google login button present');
    const emailField = await page.locator('input[type="email"]').first().isVisible().catch(() => false);
    emailField ? pass('Email/password fields visible') : fail('Email/password fields visible');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 7. Register + login via cookie
  const ts = Date.now();
  const testEmail = 'playwright' + ts + '@test.com';
  const testUser = 'pw' + ts;

  const regRes = await page.evaluate(async function(args) {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: args.email, password: 'Test1234!', username: args.username })
    });
    return { status: r.status, data: await r.json() };
  }, { email: testEmail, username: testUser });
  regRes.status === 200 ? pass('Register new user', testUser) : fail('Register new user', JSON.stringify(regRes.data));

  const loginRes = await page.evaluate(async function(args) {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: args.email, password: 'Test1234!' })
    });
    return { status: r.status, data: await r.json() };
  }, { email: testEmail });
  const userId = loginRes.data && loginRes.data.user ? loginRes.data.user.id : null;
  loginRes.status === 200 ? pass('Login sets cookie', 'userId: ' + userId) : fail('Login sets cookie', JSON.stringify(loginRes.data));

  // 8. /me works with cookie
  const meRes = await page.evaluate(async function() {
    const r = await fetch('/api/auth/me');
    return await r.json();
  });
  meRes.user ? pass('/api/auth/me returns user via cookie', meRes.user.username) : fail('/api/auth/me returns user via cookie', JSON.stringify(meRes));

  // 9. Add terminal with cookie auth
  const addTermRes = await page.evaluate(async function() {
    const r = await fetch('/api/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'PW Test Terminal', lat: 14.5995, lng: 120.9842, type: 'Jeep', details: 'Playwright test' })
    });
    return { status: r.status, data: await r.json() };
  });
  const termId = addTermRes.data && addTermRes.data.terminal ? addTermRes.data.terminal.id : null;
  addTermRes.status === 201 ? pass('Add terminal (cookie auth)', 'id: ' + termId) : fail('Add terminal (cookie auth)', JSON.stringify(addTermRes.data));

  // 10. Vote on terminal
  let myVote = null;
  if (termId) {
    const voteRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'terminal', entity_id: id, vote_type: 'like' })
      });
      return { status: r.status, data: await r.json() };
    }, termId);
    voteRes.status === 200 ? pass('Vote on terminal') : fail('Vote on terminal', JSON.stringify(voteRes.data));

    // 11. my_vote populated on GET (middleware fix)
    const mvRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/terminals/' + id);
      return await r.json();
    }, termId);
    myVote = mvRes.terminal ? mvRes.terminal.my_vote : null;
    myVote === 'like' ? pass('my_vote populated on GET for cookie user') : fail('my_vote populated on GET for cookie user', 'got: ' + myVote);
  }

  // 12. Comment
  if (termId) {
    const commentRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/terminals/' + id + '/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Playwright test comment' })
      });
      return { status: r.status, data: await r.json() };
    }, termId);
    (commentRes.status === 200 || commentRes.status === 201) ? pass('Post comment on terminal') : fail('Post comment on terminal', JSON.stringify(commentRes.data));

    const getComments = await page.evaluate(async function(id) {
      const r = await fetch('/api/terminals/' + id + '/comments');
      return await r.json();
    }, termId);
    getComments.comments && getComments.comments.length > 0 ? pass('GET comments returns posted comment') : fail('GET comments returns posted comment');
  }

  // 13. Connection
  const allTerms = await page.evaluate(async function() {
    const r = await fetch('/api/terminals?bbox=14.59,120.98,14.61,121.00');
    return await r.json();
  });
  const terms = allTerms.terminals || [];
  let connId = null;
  if (terms.length >= 2) {
    const connRes = await page.evaluate(async function(args) {
      const r = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: args.fromId, toId: args.toId, color: '#FF0000', fare: 15, geometry: [[14.5995, 120.9842], [14.6000, 120.9850]] })
      });
      return { status: r.status, data: await r.json() };
    }, { fromId: terms[0].id, toId: terms[1].id });
    connId = connRes.data && connRes.data.connection ? connRes.data.connection.id : null;
    connRes.status === 201 ? pass('Create connection', 'id: ' + connId) : fail('Create connection', JSON.stringify(connRes.data));

    if (connId) {
      const getConn = await page.evaluate(async function(id) {
        const r = await fetch('/api/connections/' + id);
        return { status: r.status, data: await r.json() };
      }, connId);
      getConn.status === 200 ? pass('GET connection by id') : fail('GET connection by id', JSON.stringify(getConn.data));

      const cvRes = await page.evaluate(async function(id) {
        const r = await fetch('/api/votes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity_type: 'connection', entity_id: id, vote_type: 'like' })
        });
        return { status: r.status, data: await r.json() };
      }, connId);
      cvRes.status === 200 ? pass('Vote on connection') : fail('Vote on connection', JSON.stringify(cvRes.data));
    }
  } else {
    fail('Create connection', 'Not enough terminals in bbox');
  }

  // 14. Search
  const searchRes = await page.evaluate(async function() {
    const r = await fetch('/api/search?q=Manila');
    return await r.json();
  });
  searchRes.results && searchRes.results.length > 0 ? pass('Search API returns results', searchRes.results.length + ' results') : fail('Search API returns results');

  // 15. Upload endpoint
  const uploadRes = await page.evaluate(async function() {
    const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    return r.status;
  });
  uploadRes !== 404 ? pass('Upload endpoint exists', 'status ' + uploadRes) : fail('Upload endpoint exists');

  // 16. User profile
  if (userId) {
    const profRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/users/' + id);
      return { status: r.status, data: await r.json() };
    }, userId);
    profRes.status === 200 && profRes.data.user ? pass('User profile endpoint', 'badge: ' + profRes.data.user.badge) : fail('User profile endpoint', JSON.stringify(profRes.data));
  }

  // 17. Terminal edit history
  if (termId) {
    const histRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/terminals/' + id + '/history');
      return { status: r.status, data: await r.json() };
    }, termId);
    histRes.status === 200 ? pass('Terminal history endpoint') : fail('Terminal history endpoint');
  }

  // 18. Points awarded after adding terminal
  if (userId) {
    const pointsRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/users/' + id);
      return await r.json();
    }, userId);
    const points = pointsRes.user ? pointsRes.user.points : null;
    points !== null && points >= 5 ? pass('Points awarded for terminal creation', points + ' points') : fail('Points awarded for terminal creation', 'points: ' + points);
  }

  // 19. Cleanup test data BEFORE rate limit stress test (so DELETE isn't blocked)
  if (connId) {
    await page.evaluate(async function(id) {
      await fetch('/api/connections/' + id, { method: 'DELETE' });
    }, connId);
  }
  if (termId) {
    const delRes = await page.evaluate(async function(id) {
      const r = await fetch('/api/terminals/' + id, { method: 'DELETE' });
      return r.status;
    }, termId);
    delRes === 200 ? pass('Delete own terminal') : fail('Delete own terminal', 'status ' + delRes);
  }

  // 20. Rate limit check (spin up 35 fast writes, expect at least one 429)
  const rlRes = await page.evaluate(async function() {
    const statuses = [];
    for (let i = 0; i < 35; i++) {
      const r = await fetch('/api/terminals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'RL Test ' + i, lat: 14.5, lng: 120.9, type: 'Jeep' })
      });
      statuses.push(r.status);
    }
    return statuses;
  });
  const hit429 = rlRes.includes(429);
  hit429 ? pass('Rate limiter triggers at 30 writes/min') : fail('Rate limiter triggers at 30 writes/min', 'no 429 seen in 35 requests');

  // 21. Logout
  const logoutRes = await page.evaluate(async function() {
    const r = await fetch('/api/auth/logout', { method: 'POST' });
    return r.status;
  });
  logoutRes === 200 ? pass('Logout clears cookie') : fail('Logout clears cookie', 'status ' + logoutRes);
  const meAfterLogout = await page.evaluate(async function() {
    const r = await fetch('/api/auth/me');
    return await r.json();
  });
  !meAfterLogout.user ? pass('/me returns no user after logout') : fail('/me returns no user after logout', 'still got user: ' + (meAfterLogout.user && meAfterLogout.user.username));

  // 22. Status page
  await page.goto(BASE + '/status', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(5000); // wait for client-side /api/status fetch to resolve
  const statusText = await page.textContent('body').catch(() => '');
  statusText.includes('Supabase') && (statusText.includes('Operational') || statusText.includes('Degraded') || statusText.includes('systems'))
    ? pass('Status page renders') : fail('Status page renders', statusText.slice(0, 100));

  // 23. Privacy page
  await page.goto(BASE + '/privacy', { waitUntil: 'networkidle', timeout: 15000 });
  const privacyText = await page.textContent('body').catch(() => '');
  privacyText.includes('Privacy') ? pass('Privacy page renders') : fail('Privacy page renders');

  // 24. Mapillary proxy — server proxy returns street view data for Manila bbox
  const mlyRes = await page.evaluate(async function() {
    const r = await fetch('/api/mapillary?bbox=120.970,14.590,121.017,14.637');
    return await r.json();
  });
  mlyRes.data && mlyRes.data.length > 0
    ? pass('Mapillary proxy returns street view data', mlyRes.data.length + ' images')
    : fail('Mapillary proxy returns street view data', JSON.stringify(mlyRes).slice(0, 80));

  // 25. Console errors (exclude expected noise: rate-limit 429s, upload 500, network blocks)
  const criticalErrors = errors.filter(function(e) {
    return !e.includes('ERR_BLOCKED_BY_CLIENT')
      && !e.includes('favicon')
      && !e.includes('net::ERR')
      && !e.includes('Failed to load resource'); // HTTP errors from our own test API calls
  });
  criticalErrors.length === 0 ? pass('No critical browser console errors') : fail('Browser console errors', criticalErrors.slice(0,3).join(' | '));

  await browser.close();

  console.log('\n===========================================');
  console.log('SUMMARY');
  console.log('===========================================');
  const passed = results.filter(function(r) { return r.status === 'PASS'; }).length;
  const failed = results.filter(function(r) { return r.status === 'FAIL'; }).length;
  console.log('PASSED: ' + passed + '/' + results.length);
  console.log('FAILED: ' + failed + '/' + results.length);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(function(r) { return r.status === 'FAIL'; }).forEach(function(r) {
      console.log('  FAIL: ' + r.name + ': ' + r.detail);
    });
  }
}

run().catch(function(e) { console.error('Test runner crashed:', e.message); process.exit(1); });
