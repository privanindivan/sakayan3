/**
 * test-streetview.mjs
 * Tests: Mapillary grey dots, thumbnail panel, full-screen viewer, Google Maps link, close.
 * Uses route interception + window.__leafletMap for reliable headless testing.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'

const MOCK_LAT = 14.5547
const MOCK_LNG = 121.0244
const MOCK_ID  = 'test_mapillary_img'
const MOCK_THUMB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/240px-PNG_transparency_demonstration_1.png'

const MOCK_RESPONSE = {
  data: [{
    id: MOCK_ID,
    geometry: { type: 'Point', coordinates: [MOCK_LNG, MOCK_LAT] },
    thumb_256_url: MOCK_THUMB,
  }]
}

let passed = 0, failed = 0, browser, page

const ss  = (n) => page.screenshot({ path: `test-screenshots/sv-${n}.png` }).catch(() => {})
const log = (label, ok, detail = '') => {
  const sym = ok ? '\x1b[32m✓ [PASS]\x1b[0m' : '\x1b[31m✗ [FAIL]\x1b[0m'
  console.log(`${sym} ${label}${detail ? ': ' + detail : ''}`)
  ok ? passed++ : failed++
}

async function run() {
  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: 'sakayan_auth_dismissed', value: '1' }] }],
    },
  })
  page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log('  JS ERR:', m.text()) })

  // Intercept Mapillary API — return one mock image at map centre
  let apiCallCount = 0
  await page.route('**graph.mapillary.com**', async route => {
    apiCallCount++
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RESPONSE),
    })
  })

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  await page.waitForTimeout(1500)

  // ── Zoom in — triggers Mapillary fetch via zoomend event ──
  console.log('\n── Mapillary API + dots ──')

  log('Leaflet map exposed on window', !!(await page.evaluate(() => window.__leafletMap)))

  await page.evaluate(({ lat, lng }) => window.__leafletMap?.setView([lat, lng], 17), { lat: MOCK_LAT, lng: MOCK_LNG })
  await page.waitForTimeout(2500)
  await ss('01-zoomed-in')

  log('Mapillary API called on zoom-in', apiCallCount > 0, `${apiCallCount} call(s)`)

  // CircleMarkers in Leaflet render as <path> with class mapillary-dot
  const dots = await page.$$('.mapillary-dot')
  log('Mapillary dot(s) rendered on map', dots.length > 0, `${dots.length} dot(s)`)

  // ── Click dot → thumbnail panel ──
  console.log('\n── Thumbnail panel ──')
  let panelOpened = false

  for (const dot of dots.slice(0, 5)) {
    await dot.click({ force: true }).catch(() => {})
    await page.waitForTimeout(700)
    const panel = await page.$('.sv-panel')
    if (panel) { panelOpened = true; break }
  }
  log('Thumbnail panel appears after clicking dot', panelOpened)
  await ss('02-panel')

  if (panelOpened) {
    const thumb = await page.$('.sv-thumb')
    log('Thumbnail image element exists', !!thumb)

    // Panel is image-only (label removed by design)
    const hasInfoSection = !!(await page.$('.sv-panel-info'))
    log('Panel is image-only (no label text)', !hasInfoSection)

    // ── Expand to full screen ──
    console.log('\n── Full-screen viewer ──')
    await page.click('.sv-panel')
    await page.waitForTimeout(800)
    await ss('03-fullscreen')

    const iframe = await page.$('.sv-iframe')
    log('Full-screen iframe visible', !!iframe)

    if (iframe) {
      const src = await iframe.getAttribute('src')
      log('Iframe src contains Mapillary image ID', src?.includes(MOCK_ID), src?.slice(0, 80))
    }

    const gmapsLink = await page.$('.sv-gmaps-btn')
    log('Google Maps Street View link present', !!gmapsLink)

    if (gmapsLink) {
      const href = await gmapsLink.getAttribute('href')
      log('Link has correct cbll coordinates',
        href?.includes(`cbll=${MOCK_LAT},${MOCK_LNG}`),
        href || 'no href'
      )
    }

    // ── Close full screen → back to thumbnail panel ──
    const closeBtn = await page.$('.sv-fullscreen-close')
    if (closeBtn) {
      await closeBtn.click()
      await page.waitForTimeout(400)
      const panelBack = await page.$('.sv-panel')
      log('Full-screen ✕ collapses back to panel', !!panelBack)
    }
    await ss('04-back-to-panel')

    // ── Close panel with X button ──
    const xBtn = await page.$('.sv-panel-close')
    if (xBtn) {
      await xBtn.click({ force: true })
      await page.waitForTimeout(300)
      const panelGone = !(await page.$('.sv-panel'))
      log('Panel ✕ closes panel completely', panelGone)
    }
    await ss('05-closed')
  }

  // ── Zoom out — dots should disappear ──
  console.log('\n── Zoom-out hides dots ──')
  const countBefore = apiCallCount
  await page.evaluate(() => window.__leafletMap?.setView([14.5995, 120.9842], 12))
  await page.waitForTimeout(2000)
  await ss('06-zoomed-out')

  const dotsAfter = await page.$$('.mapillary-dot')
  log('Dots hidden at zoom 12', dotsAfter.length === 0, `${dotsAfter.length} dot(s) remain`)

  // API should have been called again on zoomend (but returned empty due to zoom < 14 guard)
  // Actually it won't call API at zoom 12 — the guard blocks it. Verify no new call.
  log('API not called when zoomed below min zoom', apiCallCount === countBefore, `total calls: ${apiCallCount}`)
}

run()
  .catch(e => { console.error('Fatal:', e.message); process.exit(1) })
  .finally(async () => {
    await browser?.close()
    console.log('\n' + '═'.repeat(30))
    console.log(`  PASSED: ${passed}  FAILED: ${failed}`)
    if (failed > 0) process.exit(1)
  })
