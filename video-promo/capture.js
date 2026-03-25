const { chromium } = require('playwright');
const path = require('path');

const OUT = path.join(__dirname, 'public', 'screenshots');
const BASE = 'https://sakayan.netlify.app';

// Portrait mobile viewport — exact half of 1080×1920 for crisp scaling
const W = 540, H = 960;

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: W, height: H } });
  console.log('captured:', name);
}

async function dismiss(page) {
  try {
    const btn = page.locator('[aria-label="Close"]').first();
    if (await btn.isVisible()) await btn.click({ force: true });
    await page.waitForTimeout(500);
  } catch (_) {}
  // Also try clicking outside any overlay
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(300); } catch (_) {}
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: [`--window-size=${W},${H+80}`] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();

  // 1. Wide map overview (portrait)
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(6000);
  await dismiss(page);
  await shot(page, 'map-wide.png');

  // 2. Zoomed pins cluster
  const mapBox = await page.locator('.leaflet-container').boundingBox();
  const cx = mapBox ? mapBox.x + mapBox.width / 2 : W / 2;
  const cy = mapBox ? mapBox.y + mapBox.height / 2 : H / 2;
  for (let i = 0; i < 5; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(400); }
  await page.waitForTimeout(2000);
  await shot(page, 'map-zoomed-pins.png');

  // 3. Click a pin — terminal modal
  const pins = page.locator('.leaflet-marker-icon');
  const pinCount = await pins.count();
  let gotModal = false;
  for (let i = 0; i < Math.min(pinCount, 15); i++) {
    try {
      await pins.nth(i).click({ force: true, timeout: 3000 });
      await page.waitForTimeout(1500);
      const modal = await page.locator('[class*="modal"], [class*="panel"], [class*="drawer"]').first().isVisible().catch(() => false);
      if (modal) { await shot(page, 'modal-info.png'); gotModal = true; break; }
    } catch (_) {}
  }
  if (!gotModal) { await shot(page, 'modal-info.png'); } // fallback

  // 4. Street view dots — zoom in more until dots appear
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(600); }
  await page.waitForTimeout(8000); // wait for Mapillary dots to load
  await shot(page, 'map-streetview.png');

  // 5. Street view panel — click a dot
  const dots = page.locator('.mapillary-dot, circle[fill], [class*="mapillary"]');
  const dotCount = await dots.count();
  if (dotCount > 0) {
    try {
      await dots.nth(Math.floor(dotCount / 2)).click({ force: true, timeout: 3000 });
      await page.waitForTimeout(3000);
      await shot(page, 'streetview-panel.png');
      await page.keyboard.press('Escape');
    } catch (_) { await shot(page, 'streetview-panel.png'); }
  } else {
    await shot(page, 'streetview-panel.png');
  }

  // 6. Auth / register modal
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismiss(page);
  const loginBtn = page.locator('button').filter({ hasText: /log.?in|sign.?in/i }).first();
  if (await loginBtn.isVisible()) {
    await loginBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, 'auth-modal.png');
    await page.keyboard.press('Escape');
  } else {
    await shot(page, 'auth-modal.png');
  }

  // 7. Pin/terminal detail shot — reload at medium zoom, open a pin modal
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await dismiss(page);
  for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
  await shot(page, 'map-connections.png');

  await browser.close();
  console.log('\nAll screenshots captured in', OUT);
})().catch(e => { console.error(e.message); process.exit(1); });
