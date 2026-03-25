const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  console.log('=== TEST 1: Desktop dot check (1280x720) ===');

  // Load the page
  await page.goto('https://sakayan.netlify.app', { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for map to appear
  await page.waitForSelector('.leaflet-container', { timeout: 30000 });
  console.log('Map loaded.');

  // Wait for green dots to appear
  try {
    await page.waitForFunction(() => {
      const paths = document.querySelectorAll('path[fill="#22C55E"]');
      return paths.length > 0;
    }, { timeout: 20000 });
    console.log('Green dots appeared.');
  } catch (e) {
    console.log('Timeout waiting for green dots. Continuing...');
  }

  // Hide login modal (fixed/absolute elements with zIndex > 1000 not inside .leaflet-container)
  await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      const style = window.getComputedStyle(el);
      const pos = style.position;
      const zIdx = parseInt(style.zIndex, 10);
      if ((pos === 'fixed' || pos === 'absolute') && zIdx > 1000) {
        // Check it's not inside leaflet-container
        if (!el.closest('.leaflet-container')) {
          el.style.display = 'none';
        }
      }
    });
  });
  console.log('Login modal hidden (if present).');

  // Count green CircleMarker paths
  const dotCounts = await page.evaluate(() => {
    const paths = document.querySelectorAll('path[fill="#22C55E"]');
    let total = paths.length;
    let valid = 0;
    paths.forEach(p => {
      const d = p.getAttribute('d');
      if (d && d !== 'M0 0') valid++;
    });
    return { total, valid };
  });
  console.log(`Total green paths (fill="#22C55E"): ${dotCounts.total}`);
  console.log(`Valid green paths (d !== "M0 0"): ${dotCounts.valid}`);

  // Take screenshot
  await page.screenshot({ path: '/tmp/dots_green_desktop.png', fullPage: false });
  console.log('Screenshot saved to /tmp/dots_green_desktop.png');

  console.log('\n=== TEST 2: Thumbnail check (1280x720) ===');

  // Reload to get fresh state
  await page.goto('https://sakayan.netlify.app', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30000 });

  // Wait for green dots
  try {
    await page.waitForFunction(() => {
      const paths = document.querySelectorAll('path[fill="#22C55E"]');
      return Array.from(paths).some(p => p.getAttribute('d') && p.getAttribute('d') !== 'M0 0');
    }, { timeout: 20000 });
  } catch (e) {
    console.log('Timeout waiting for valid green dots.');
  }

  // Hide modal again
  await page.evaluate(() => {
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      const style = window.getComputedStyle(el);
      const pos = style.position;
      const zIdx = parseInt(style.zIndex, 10);
      if ((pos === 'fixed' || pos === 'absolute') && zIdx > 1000) {
        if (!el.closest('.leaflet-container')) {
          el.style.display = 'none';
        }
      }
    });
  });

  // Get the first valid green dot bounding box center
  const dotInfo = await page.evaluate(() => {
    const paths = document.querySelectorAll('path[fill="#22C55E"]');
    for (const p of paths) {
      const d = p.getAttribute('d');
      if (d && d !== 'M0 0') {
        const rect = p.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          d: d.substring(0, 50)
        };
      }
    }
    return null;
  });

  if (!dotInfo) {
    console.log('ERROR: No valid green dot found to click!');
  } else {
    console.log(`Clicking green dot at (${dotInfo.x.toFixed(1)}, ${dotInfo.y.toFixed(1)}), size: ${dotInfo.width.toFixed(1)}x${dotInfo.height.toFixed(1)}`);
    console.log(`  d attr preview: ${dotInfo.d}`);

    await page.mouse.click(dotInfo.x, dotInfo.y);
    console.log('Clicked dot.');

    // Wait up to 5 seconds for the street view panel to appear
    let panelFound = false;
    let panelSelector = null;
    const panelSelectors = [
      '[class*="streetview"]',
      '[class*="StreetView"]',
      '[class*="panel"]',
      '[class*="Panel"]',
      '[class*="sidebar"]',
      '[class*="Sidebar"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '[class*="viewer"]',
      '[class*="Viewer"]',
      '.leaflet-popup',
    ];

    try {
      // Wait for any panel-like element to appear or change
      await page.waitForFunction(() => {
        // Look for img tags that might be street view thumbnails
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          if (img.src && img.src.includes('mapillary')) return true;
        }
        // Also check for panels
        const panels = document.querySelectorAll('[class*="panel"], [class*="Panel"], [class*="viewer"], [class*="Viewer"], [class*="sidebar"], .leaflet-popup');
        return panels.length > 0;
      }, { timeout: 5000 });
      panelFound = true;
      console.log('Street view panel or mapillary img appeared!');
    } catch (e) {
      console.log('No mapillary img or panel appeared within 5 seconds.');
    }

    // Check what appeared after click
    const panelInfo = await page.evaluate(() => {
      // Check for street view panel
      const result = {
        hasPanel: false,
        panelSelector: null,
        hasImg: false,
        imgSrc: null,
        isLoading: false,
        bodyText: null
      };

      // Look for any visible panels
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        const cls = el.className || '';
        if (typeof cls === 'string' && (
          cls.toLowerCase().includes('panel') ||
          cls.toLowerCase().includes('viewer') ||
          cls.toLowerCase().includes('sidebar') ||
          cls.toLowerCase().includes('streetview') ||
          cls.toLowerCase().includes('street-view')
        )) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 50) {
            result.hasPanel = true;
            result.panelSelector = el.tagName + (el.className ? '.' + el.className.split(' ').join('.') : '');
            // Check for imgs inside
            const imgs = el.querySelectorAll('img');
            if (imgs.length > 0) {
              result.hasImg = true;
              result.imgSrc = imgs[0].src;
            }
            // Check text content
            const text = el.textContent || '';
            if (text.includes('Loading')) result.isLoading = true;
            result.bodyText = text.substring(0, 200);
            break;
          }
        }
      }

      // Also check for leaflet popups
      if (!result.hasPanel) {
        const popup = document.querySelector('.leaflet-popup');
        if (popup) {
          result.hasPanel = true;
          result.panelSelector = '.leaflet-popup';
          const imgs = popup.querySelectorAll('img');
          if (imgs.length > 0) {
            result.hasImg = true;
            result.imgSrc = imgs[0].src;
          }
          result.bodyText = (popup.textContent || '').substring(0, 200);
        }
      }

      // Check all imgs for mapillary
      const allImgs = document.querySelectorAll('img');
      for (const img of allImgs) {
        if (img.src && img.src.includes('mapillary')) {
          result.hasImg = true;
          result.imgSrc = img.src;
        }
      }

      return result;
    });

    console.log(`Panel found: ${panelInfo.hasPanel}`);
    if (panelInfo.panelSelector) console.log(`Panel selector: ${panelInfo.panelSelector}`);
    console.log(`Has img tag: ${panelInfo.hasImg}`);
    if (panelInfo.imgSrc) console.log(`Img src: ${panelInfo.imgSrc}`);
    console.log(`Shows "Loading": ${panelInfo.isLoading}`);
    if (panelInfo.bodyText) console.log(`Panel text (first 200): ${panelInfo.bodyText}`);
  }

  // Test /api/mapillary/thumb endpoint
  console.log('\nTesting /api/mapillary/thumb endpoint...');
  const thumbResult = await page.evaluate(async () => {
    try {
      const testId = '306933860709518';
      const url = `/api/mapillary/thumb?id=${testId}`;
      const resp = await fetch(url);
      const status = resp.status;
      const contentType = resp.headers.get('content-type') || '';
      let body = '';
      try {
        body = await resp.text();
      } catch (e) {
        body = '[could not read body]';
      }
      return { status, contentType, body: body.substring(0, 500), url };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(`Thumb endpoint URL: ${thumbResult.url}`);
  console.log(`Status: ${thumbResult.status}`);
  console.log(`Content-Type: ${thumbResult.contentType}`);
  console.log(`Body (first 500): ${thumbResult.body}`);

  // Take screenshot
  await page.screenshot({ path: '/tmp/thumb_test.png', fullPage: false });
  console.log('\nScreenshot saved to /tmp/thumb_test.png');

  await browser.close();
  console.log('\nDone.');
})().catch(err => {
  console.error('FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
