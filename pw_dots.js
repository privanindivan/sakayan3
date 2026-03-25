const { chromium } = require('playwright')

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  // Clear localStorage to ensure fresh default view
  await page.addInitScript(() => { localStorage.clear() })

  page.on('response', r => {
    if (r.url().includes('/api/mapillary')) {
      r.json().then(d => console.log('API tile returned', d.data?.length, 'images')).catch(()=>{})
    }
  })

  await page.goto('https://sakayan.netlify.app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  
  // Close any modal
  await page.keyboard.press('Escape')
  await page.waitForTimeout(10000)

  const dotCount = await page.locator('path[stroke="#ffffff"]').count()
  console.log('Total dots:', dotCount)

  // Get dot positions to confirm they're spread across map
  const dots = await page.locator('path[stroke="#ffffff"]').all()
  if (dots.length > 0) {
    const bbox = await dots[0].boundingBox()
    console.log('First dot bounding box:', JSON.stringify(bbox))
  }

  await page.screenshot({ path: 'pw_dots.png' })
  console.log('Saved pw_dots.png')
  await browser.close()
})()
