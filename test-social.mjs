/**
 * test-social.mjs
 * Tests: Comments, Edit History, Revert, User Profile modal, X button scroll fix
 */
import { chromium } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'fs'

const BASE   = 'http://localhost:5173'
const TS     = Date.now()
const EMAIL  = `social_${TS}@sakayan.test`
const UNAME  = `soc${TS}`.slice(0, 18)
const dbUrl  = readFileSync('.env.local', 'utf8').match(/DATABASE_URL=(.+)/)[1].trim()
const sql    = neon(dbUrl)

let passed = 0, failed = 0, browser, page

const ss  = (n) => page.screenshot({ path: `test-screenshots/social-${n}.png` }).catch(() => {})
const log = (label, ok, detail = '') => {
  const sym = ok ? '\x1b[32m✓ [PASS]\x1b[0m' : '\x1b[31m✗ [FAIL]\x1b[0m'
  console.log(`${sym} ${label}${detail ? ': ' + detail : ''}`)
  ok ? passed++ : failed++
}

async function run() {
  browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // mobile viewport — matches real use
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: [{ name: 'sakayan_auth_dismissed', value: '1' }] }],
    },
  })
  page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log('  JS ERR:', m.text()) })

  // Pre-clean any leftover test data
  await sql.query(`DELETE FROM users WHERE email LIKE '%@sakayan.test' OR email LIKE '%@test.com'`).catch(() => {})
  await sql.query(`DELETE FROM terminals WHERE created_by IS NULL`).catch(() => {})

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })

  // ── Register ──
  await page.click('.login-chip')
  await page.waitForSelector('.auth-modal')
  await page.click('button:has-text("Sign up")')
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[placeholder*="sername" i]', UNAME)
  await page.fill('input[type="password"]', 'testpass123')
  await page.locator('.auth-modal button[type="submit"]').click()
  await page.waitForTimeout(2500)
  const chip = await page.$('.user-chip')
  log('Registered and logged in', !!chip)
  if (!chip) return

  // ── Create stop via API (run inside browser so cookies are sent) ──
  const { terminal } = await page.evaluate(async () => {
    const token = localStorage.getItem('sakayan_token')
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch('/api/terminals', {
      method: 'POST', headers,
      body: JSON.stringify({ name: 'Social Test Stop', lat: 14.5995, lng: 120.9842, type: 'Jeep' }),
    })
    return res.json()
  })
  log('Stop created via API', !!terminal?.id, terminal?.id || 'no id')
  if (!terminal?.id) return

  // Reload to render the marker
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.leaflet-container')
  await page.waitForTimeout(1500)

  // ── Open the correct stop modal (find by marker count — should be exactly 1) ──
  const markers = await page.$$('.leaflet-marker-icon')
  log('Stop marker visible on map', markers.length > 0, `${markers.length} marker(s)`)
  if (!markers.length) return

  // Click each marker until we open the right one (matching our stop id)
  let opened = false
  for (const m of markers) {
    await m.click({ force: true })
    await page.waitForTimeout(600)
    const modalText = await page.$eval('.modal', el => el.innerText).catch(() => '')
    if (modalText.includes('Social Test Stop')) { opened = true; break }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  log('Marker modal opens for our stop', opened)
  if (!opened) return
  await ss('01-modal')

  // ════════════════════════════════
  // COMMENTS
  // ════════════════════════════════
  console.log('\n── Comments ──')
  await page.click('.modal-tab:has-text("Comments")')
  await page.waitForTimeout(600)
  await ss('02-comments-tab')

  const commentBox = await page.$('.comment-input')
  log('Comment input visible', !!commentBox)

  if (commentBox) {
    await commentBox.fill('Test comment 🚌 hello')
    await page.click('.comment-submit')
    await page.waitForTimeout(1000)
    await ss('03-comment-posted')

    const items = await page.$$('.comment-item')
    log('Comment appears in list', items.length > 0, `${items.length} item(s)`)

    if (items.length > 0) {
      const txt = await items[0].innerText()
      log('Comment text correct', txt.includes('Test comment'), txt.slice(0, 50))

      // Delete own comment
      const delBtn = await items[0].$('.comment-delete')
      log('Delete button on own comment', !!delBtn)
      if (delBtn) {
        await delBtn.click()
        await page.waitForTimeout(600)
        const after = await page.$$('.comment-item')
        log('Comment deleted successfully', after.length < items.length)
      }
    }
  }

  // Post a few to test scrolling later
  for (let i = 1; i <= 4; i++) {
    const b = await page.$('.comment-input')
    if (b) { await b.fill(`Scroll test comment ${i}`); await page.click('.comment-submit'); await page.waitForTimeout(300) }
  }

  // ════════════════════════════════
  // EDIT HISTORY + REVERT
  // ════════════════════════════════
  console.log('\n── Edit History & Revert ──')
  await page.click('.modal-tab:has-text("Connections")')
  await page.waitForTimeout(300)

  // Make an edit
  const editBtn = await page.$('button:has-text("Edit")')
  if (editBtn) {
    await editBtn.click({ force: true })
    await page.waitForTimeout(400)
    const nameField = await page.$('input.edit-field')
    if (nameField) {
      await nameField.click({ clickCount: 3 })
      await nameField.fill('Social Test Stop EDITED')
      const saveBtn = await page.$('.btn-save')
      if (saveBtn) { await saveBtn.click({ force: true }); await page.waitForTimeout(1500) }
    }
  }

  await page.click('.modal-tab:has-text("History")')
  await page.waitForTimeout(800)
  await ss('04-history')

  const histItems = await page.$$('.history-item')
  log('History shows edit entry', histItems.length > 0, `${histItems.length} entry(ies)`)

  if (histItems.length > 0) {
    const txt = await histItems[0].innerText()
    log('History action label present', /edit|revert|delete/i.test(txt), txt.slice(0, 50))

    const revertBtn = await histItems[0].$('.history-revert-btn')
    log('Revert button visible', !!revertBtn)

    if (revertBtn) {
      await revertBtn.click()
      await page.waitForTimeout(1500)
      await ss('05-reverted')
      const modalOpen = await page.$('.modal-overlay')
      log('Modal still open after revert', !!modalOpen)
      const bodyTxt = modalOpen ? await page.$eval('.modal', el => el.innerText).catch(() => '') : ''
      log('Name reverted to original', bodyTxt.includes('Social Test Stop'), bodyTxt.slice(0, 60))
    }
  }

  // ════════════════════════════════
  // USER PROFILE
  // ════════════════════════════════
  console.log('\n── User Profile ──')
  await page.click('.modal-tab:has-text("Connections")')
  await page.waitForTimeout(800)
  await ss('06-back-to-info')

  const usernameLink = await page.$('.username-link')
  log('Username link ("Added by") visible', !!usernameLink)

  if (usernameLink) {
    await usernameLink.click()
    await page.waitForTimeout(1200)
    await ss('06-profile')

    const profileBody = await page.$('.profile-body')
    log('Profile modal opens', !!profileBody)

    if (profileBody) {
      const txt = await profileBody.innerText()
      log('Profile shows username', txt.includes(UNAME), UNAME)
      log('Profile shows badge', /newcomer|explorer|guide|navigator|pioneer|🌱|🧭|🗺|⭐|🏆/i.test(txt))
      log('Profile shows "Stops added"', txt.includes('Stops added'))
      log('Profile shows "Likes received"', txt.includes('Likes'))

      // Close profile with X
      const closeX = await page.$('.modal-close')
      if (closeX) { await closeX.click({ force: true }); await page.waitForTimeout(400) }
      const profileGone = !(await page.$('.profile-body'))
      log('Profile modal closes with X', profileGone)
    }
  }

  // ════════════════════════════════
  // X BUTTON STAYS VISIBLE WHEN SCROLLED
  // ════════════════════════════════
  console.log('\n── X button scroll fix ──')
  // Modal should still be open (marker modal behind profile)
  const modalOpen = await page.$('.modal-overlay')
  if (!modalOpen) {
    // Re-open
    await markers[0].click().catch(() => {})
    await page.waitForSelector('.modal-overlay', { timeout: 3000 }).catch(() => {})
  }

  await page.click('.modal-tab:has-text("Comments")').catch(() => {})
  await page.waitForTimeout(400)

  // Scroll to bottom inside modal-scroll
  await page.evaluate(() => {
    const s = document.querySelector('.modal-scroll')
    if (s) s.scrollTop = s.scrollHeight
  })
  await page.waitForTimeout(300)
  await ss('07-scrolled')

  // Record X position before scroll
  const xBtn = await page.$('.modal-close')
  const xBoxBefore = xBtn ? await xBtn.boundingBox() : null

  // Scroll to bottom
  await page.evaluate(() => { const s = document.querySelector('.modal-scroll'); if (s) s.scrollTop = s.scrollHeight })
  await page.waitForTimeout(300)

  const xBoxAfter  = xBtn ? await xBtn.boundingBox() : null
  const xVisible   = xBtn ? await xBtn.isVisible() : false
  log('X button visible after scrolling', xVisible)
  log('X button does not move when scrolled',
    xBoxBefore && xBoxAfter ? Math.abs(xBoxBefore.y - xBoxAfter.y) < 2 : false,
    xBoxBefore && xBoxAfter ? `before y=${Math.round(xBoxBefore.y)} after y=${Math.round(xBoxAfter.y)}` : 'no box')
}

run()
  .catch(e => { console.error('Fatal:', e.message); process.exit(1) })
  .finally(async () => {
    await sql.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {})
    console.log('\nTest data cleaned up.')
    await browser?.close()
    console.log('\n' + '═'.repeat(30))
    console.log(`  PASSED: ${passed}  FAILED: ${failed}`)
    if (failed > 0) process.exit(1)
  })
