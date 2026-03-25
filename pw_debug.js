const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  const apiCalls = []
  const jsErrors = []
  page.on('console', m => { if (m.type() === 'error') jsErrors.push(m.text().substring(0,120)) })
  page.on('response', r => {
    if (r.url().includes('/api/mapillary')) apiCalls.push({ status: r.status(), bbox: r.url().split('bbox=')[1] })
  })

  console.log('Loading https://sakayan.netlify.app ...')
  await page.goto('https://sakayan.netlify.app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(8000)

  const dotCount = await page.locator('path[stroke="#ffffff"]').count()
  const svgCount = await page.locator('svg.leaflet-zoom-animated').count()

  console.log('SVG layers:', svgCount)
  console.log('Dots (circle paths):', dotCount)
  console.log('API calls:', apiCalls.length)
  apiCalls.forEach(c => console.log('  ', c.status, c.bbox?.substring(0,30)))
  console.log('JS errors:', jsErrors.length)
  jsErrors.slice(0,3).forEach(e => console.log('  ', e))

  await page.screenshot({ path: 'pw_result.png' })
  console.log('Screenshot: pw_result.png')
  await browser.close()
})()
