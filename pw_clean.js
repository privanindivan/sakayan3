const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await page.addInitScript(() => { localStorage.clear() })
  await page.goto('https://sakayan.netlify.app', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(15000)
  // Close modal by clicking the X
  const closeBtn = page.locator('button').filter({ hasText: /×|✕|close/i }).first()
  const xBtn = page.locator('[class*="close"], [aria-label*="close"]').first()
  try { await closeBtn.click({ timeout: 1000 }) } catch {}
  try { await xBtn.click({ timeout: 1000 }) } catch {}
  // Also try clicking outside the modal
  await page.mouse.click(195, 50)
  await page.waitForTimeout(1000)
  const dots = await page.locator('path[stroke="#ffffff"]').count()
  console.log('Dots:', dots)
  await page.screenshot({ path: 'pw_clean.png' })
  await browser.close()
})()
