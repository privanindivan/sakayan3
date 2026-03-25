const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  await page.addInitScript(() => { localStorage.clear() })

  const apiCalls = []
  page.on('response', async r => {
    if (r.url().includes('/api/mapillary')) {
      try {
        const d = await r.json()
        apiCalls.push({ status: r.status(), count: d.data?.length, bbox: r.url().split('bbox=')[1]?.substring(0,30) })
      } catch {}
    }
  })

  const errors = []
  page.on('pageerror', e => errors.push(e.message.substring(0,100)))

  await page.goto('https://sakayan.netlify.app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('Page loaded, waiting 15s for tiles...')
  await page.waitForTimeout(15000)

  const dotCount = await page.locator('path[stroke="#ffffff"]').count()
  console.log('Dots visible:', dotCount)
  console.log('API calls:', apiCalls.length)
  apiCalls.forEach(c => console.log('  ', c.status, c.count, 'imgs |', c.bbox))
  console.log('Page errors:', errors)

  // Also check zoom level from map
  const zoom = await page.evaluate(() => {
    // Try to get leaflet map zoom
    const mapEl = document.querySelector('.leaflet-container')
    if (mapEl && mapEl._leaflet_map) return mapEl._leaflet_map.getZoom()
    return 'no map'
  })
  console.log('Map zoom:', zoom)

  await page.screenshot({ path: 'pw_dots2.png' })
  await browser.close()
})()
