const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, 'public', 'screenshots');
const BASE = 'http://localhost:3000';
const W = 540, H = 960;

const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1YTRhYWNiNy0zNGQ3LTQ1YmYtYTIwNS04MzU5ZDAwMjM5MDgiLCJyb2xlIjoidXNlciIsImlhdCI6MTc3NDU5ODA2MiwiZXhwIjoxNzc1MjAyODYyfQ.GfJ__kBhz2pAqnlOFMOGjka9aLeXE5S1r7mjcvbiZb4';

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('captured:', name);
}

async function setAuth(page) {
  await page.evaluate((t) => {
    localStorage.setItem('sakayan_token', t);
    localStorage.setItem('sakayan_auth_dismissed', '1');
  }, AUTH_TOKEN);
}

async function loadAt(page, lat, lng, zoom) {
  await page.evaluate((v) => localStorage.setItem('sakayan_map_view_v2', JSON.stringify(v)), { lat, lng, zoom });
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await setAuth(page);
  await page.waitForTimeout(3500);
}

async function hasGreenDots(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.leaflet-container canvas');
    if (!canvas) return false;
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 80 && d[i+1] > 160 && d[i+2] < 120 && d[i+3] > 200) return true;
    }
    return false;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: [`--window-size=${W},${H+80}`, '--disable-web-security', '--disable-site-isolation-trials'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  // ── 1. WIDE MAP ──
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await setAuth(page);
  await loadAt(page, 14.545, 121.015, 13);
  await shot(page, 'map-wide.png');

  // ── 2. ZOOMED PINS ──
  await loadAt(page, 14.555, 121.02, 15);
  await shot(page, 'map-zoomed-pins.png');

  // ── 3. TERMINAL MODAL — zoom 16, try clicking pins ──
  await loadAt(page, 14.558, 121.017, 16);
  const pins = page.locator('.leaflet-marker-icon');
  await page.waitForTimeout(1000);
  const pinCount = await pins.count();
  console.log('pins visible:', pinCount);
  let gotModal = false;
  for (let i = 0; i < Math.min(pinCount, 30); i++) {
    try {
      const box = await pins.nth(i).boundingBox();
      if (!box || box.y < 80 || box.y > H - 80) continue; // skip if behind top bar or out of view
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1800);
      const modal = await page.locator('[class*="modal"], [class*="Modal"], [class*="panel"], [class*="Panel"]').first().isVisible({ timeout: 1000 }).catch(() => false);
      if (modal) { await shot(page, 'modal-info.png'); gotModal = true; break; }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } catch (_) {}
  }
  if (!gotModal) {
    console.log('modal not found, saving current state');
    await shot(page, 'modal-info.png');
  }
  await page.keyboard.press('Escape');

  // ── 4. GREEN DOTS — Ortigas/Mandaluyong, zoom 14 ──
  await loadAt(page, 14.583, 121.058, 14);
  // Enable Street Photos
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Street Photos'));
    if (btn && !btn.className.includes('street-photos-on')) btn.click();
  });
  // Wait up to 15s for green dots
  let dotsReady = false;
  for (let t = 0; t < 15; t++) {
    await page.waitForTimeout(1000);
    dotsReady = await hasGreenDots(page);
    if (dotsReady) { console.log('green dots ready at', t+1, 's'); break; }
  }
  if (!dotsReady) console.log('WARNING: no green dots after 15s');
  await shot(page, 'map-streetview.png');

  // ── 5. STREET VIEW PANEL — click a dot ──
  if (dotsReady) {
    const dotCoords = await page.evaluate(() => {
      const canvas = document.querySelector('.leaflet-container canvas');
      if (!canvas) return null;
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = 150; y < canvas.height - 150; y += 4) {
        for (let x = 30; x < canvas.width - 30; x += 4) {
          const i = (y * canvas.width + x) * 4;
          if (d[i] < 80 && d[i+1] > 160 && d[i+2] < 120 && d[i+3] > 200) return { x, y };
        }
      }
      return null;
    });
    if (dotCoords) {
      await page.mouse.click(dotCoords.x, dotCoords.y);
      await page.waitForTimeout(5000);
      await shot(page, 'streetview-panel.png');
      await page.keyboard.press('Escape');
    } else {
      console.log('no clickable dot found');
      await shot(page, 'streetview-panel.png');
    }
  } else {
    await shot(page, 'streetview-panel.png');
  }

  // ── 6. MAP CONNECTIONS ──
  await loadAt(page, 14.545, 121.02, 14);
  await shot(page, 'map-connections.png');

  await browser.close();
  console.log('\nDone →', OUT);
})().catch(e => { console.error(e); process.exit(1); });
