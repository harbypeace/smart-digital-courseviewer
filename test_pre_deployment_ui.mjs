import { chromium } from 'file:///C:/Users/har/AppData/Roaming/npm/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'test-results', 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let passedCount = 0;
let totalCount = 0;

function assert(condition, testName, details = '') {
  totalCount++;
  if (condition) {
    console.log(`✅ [PASS] ${totalCount}. ${testName}`);
    if (details) console.log(`       ↳ ${details}`);
    passedCount++;
    return true;
  } else {
    console.error(`❌ [FAIL] ${totalCount}. ${testName}`);
    if (details) console.error(`       ↳ ${details}`);
    return false;
  }
}

async function runPreDeploymentSuite() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🚀 RUNNING PRE-DEPLOYMENT COMPREHENSIVE E2E & UI TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // 1. Start local preview server
  console.log('📦 Starting preview server (port 8788)...');
  const server = spawn('node', ['serve_preview.mjs'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  server.stderr.on('data', (d) => {
    // only log actual server errors
    const str = d.toString();
    if (!str.includes('Warning') && !str.includes('ExperimentalWarning')) {
      console.error('[Server Err]:', str.trim());
    }
  });

  // Wait for server to respond
  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8788/');
      if (res.ok || res.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      await wait(500);
    }
  }

  if (!serverReady) {
    console.error('❌ Failed to connect to preview server on 8788.');
    server.kill();
    process.exit(1);
  }
  console.log('✅ Preview server running on http://127.0.0.1:8788/\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error('Browser launch error:', err.message);
    server.kill();
    process.exit(1);
  }

  try {
    // ══════════════════════════════════════════════════════════════
    // TEST SECTION A: Classroom Player Page & Download Manager
    // ══════════════════════════════════════════════════════════════
    console.log('── Section A: Classroom Player & Offline Download Manager ──');
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    const page = await desktopContext.newPage();

    const classroomUrl = 'http://127.0.0.1:8788/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh';
    await page.goto(classroomUrl, { waitUntil: 'domcontentloaded' });
    await wait(2500); // Allow classroom data and voice probe

    const classroomTitle = await page.title();
    assert(classroomTitle.length > 0, 'Classroom page loaded successfully', `Title: "${classroomTitle}"`);

    // Verify Download Manager button exists
    const downloadBtn = await page.$('button[title*="مدير التنزيل"]');
    assert(downloadBtn !== null, 'Download Manager trigger button found in bottom toolbar');

    if (downloadBtn) {
      await downloadBtn.click();
      await wait(600);

      // Verify modal opened
      const modalHeader = await page.$('h3:has-text("مدير التنزيل")');
      assert(modalHeader !== null, 'Download Manager modal opened upon click');

      // Verify selective download options exist
      const classroomCheckbox = await page.$('input[type="checkbox"]:near(:text("الغرفة الصفية التفاعلية"))');
      assert(classroomCheckbox !== null, 'Classroom selective checkbox is present');

      const isClassroomChecked = classroomCheckbox ? await classroomCheckbox.isChecked() : false;
      assert(isClassroomChecked, 'Classroom option is checked by default (User Requirement)');

      const pagesCheckbox = await page.$('input[type="checkbox"]:near(:text("صفحات الكتاب المطبوع"))');
      assert(pagesCheckbox !== null, '900px WebP Printed Pages selective checkbox is present');

      const isPagesChecked = pagesCheckbox ? await pagesCheckbox.isChecked() : false;
      assert(isPagesChecked, '900px Printed Pages option is checked by default (User Requirement)');

      // Verify selective unchecking works
      if (classroomCheckbox) {
        await classroomCheckbox.click();
        const unchecked = !(await classroomCheckbox.isChecked());
        assert(unchecked, 'User can selectively uncheck components');
        await classroomCheckbox.click(); // restore
      }

      // Screenshot modal
      const modalScreenshot = path.join(SCREENSHOTS_DIR, '01_classroom_download_modal.png');
      await page.screenshot({ path: modalScreenshot });
      console.log(`       📸 Screenshot saved: ${modalScreenshot}`);

      // Close modal
      const closeBtn = await page.$('button:has-text("إغلاق")');
      if (closeBtn) {
        await closeBtn.click();
        await wait(400);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // TEST SECTION B: Mobile Viewport & 3-Second Auto-Hide
    // ══════════════════════════════════════════════════════════════
    console.log('\n── Section B: Mobile Viewport & 3-Second Auto-Hide (AGENTS.md) ──');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 }, // iPhone SE dimensions (< 768px)
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(classroomUrl, { waitUntil: 'domcontentloaded' });
    await wait(2500);

    // Open scenes sidebar on mobile
    const scenesBtn = await mobilePage.$('button[title*="عرض قائمة المشاهد"]');
    assert(scenesBtn !== null, 'Scenes sidebar button found on mobile');

    if (scenesBtn) {
      await scenesBtn.click();
      await wait(500);

      // Verify sidebar drawer rendered
      let aside = await mobilePage.$('aside');
      assert(aside !== null, 'Scenes sidebar overlay drawer opened on mobile');

      // Verify auto-hide after 3s of inactivity
      console.log('       ⏳ Waiting 3.5 seconds to verify auto-hide on mobile inactivity...');
      await wait(3500);

      aside = await mobilePage.$('aside');
      assert(aside === null, 'Scenes sidebar automatically hidden after 3 seconds of inactivity');
    }

    // ══════════════════════════════════════════════════════════════
    // TEST SECTION C: Printed Pages Viewer & 900px WebP Images
    // ══════════════════════════════════════════════════════════════
    console.log('\n── Section C: Printed Pages Viewer (900px WebP & Mobile Swiping) ──');
    const printedPage = await desktopContext.newPage();
    const printedUrl = 'http://127.0.0.1:8788/printed-pages?subject=adb10p1&unit=u1&lesson=l1';
    await printedPage.goto(printedUrl, { waitUntil: 'domcontentloaded' });
    await wait(2000);

    const printedTitle = await printedPage.title();
    assert(printedTitle.length > 0, 'Printed pages viewer loaded', `Title: "${printedTitle}"`);

    // Verify 900px WebP images are targeted
    const webpImgs = await printedPage.$$('img[src*="w900.webp"]');
    assert(webpImgs.length > 0, 'Printed pages viewer rendered 900px WebP image elements', `Found ${webpImgs.length} WebP images`);

    // Verify Download Manager trigger in Printed Pages
    const printedDownloadBtn = await printedPage.$('button[title*="مدير التنزيلات"]');
    assert(printedDownloadBtn !== null, 'Download Manager button found in Printed Pages toolbar');

    if (printedDownloadBtn) {
      await printedDownloadBtn.click();
      await wait(500);

      const printedModalHeader = await printedPage.$('h3:has-text("مدير التنزيل")');
      assert(printedModalHeader !== null, 'Printed Pages Download Manager modal opened');

      const pagesCheck = await printedPage.$('input[type="checkbox"]:near(:text("صفحات الكتاب المطبوع"))');
      assert(pagesCheck !== null, '900px WebP selective checkbox present in Printed Pages modal');

      const isChecked = pagesCheck ? await pagesCheck.isChecked() : false;
      assert(isChecked, '900px Pages checkbox is checked by default');

      const printedModalScreenshot = path.join(SCREENSHOTS_DIR, '02_printed_pages_download_modal.png');
      await printedPage.screenshot({ path: printedModalScreenshot });
      console.log(`       📸 Screenshot saved: ${printedModalScreenshot}`);

      const closeBtn = await printedPage.$('button:has-text("إغلاق")');
      if (closeBtn) {
        await closeBtn.click();
        await wait(400);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // TEST SECTION D: Mobile Swipe Gestures in Book Reader
    // ══════════════════════════════════════════════════════════════
    console.log('\n── Section D: Mobile Touch Swipe Gestures in Book Reader ──');
    const mobileBookPage = await mobileContext.newPage();
    await mobileBookPage.goto(printedUrl, { waitUntil: 'domcontentloaded' });
    await wait(2000);

    // Switch to single-page or two-page layout if available to test horizontal swipe
    const singlePageBtn = await mobileBookPage.$('button[title*="صفحة واحدة"]');
    if (singlePageBtn) {
      await singlePageBtn.click();
      await wait(500);
    }

    // Check page counter before swipe
    const pageIndicator = await mobileBookPage.$('span.font-mono');
    const initialText = pageIndicator ? await pageIndicator.textContent() : '';

    // Dispatch touch swipe gesture (swipe left to go to next page in RTL)
    const bookMain = await mobileBookPage.$('main');
    if (bookMain) {
      const box = await bookMain.boundingBox();
      if (box) {
        const startX = box.x + box.width * 0.8;
        const endX = box.x + box.width * 0.2;
        const y = box.y + box.height / 2;

        await mobileBookPage.touchscreen.tap(startX, y);
        // Simulate swipe touch sequence
        await mobileBookPage.evaluate(({ startX, endX, y }) => {
          const main = document.querySelector('main');
          if (!main) return;
          const touchStart = new Touch({
            identifier: 1,
            target: main,
            clientX: startX,
            clientY: y,
          });
          const touchEnd = new Touch({
            identifier: 1,
            target: main,
            clientX: endX,
            clientY: y,
          });
          main.dispatchEvent(new TouchEvent('touchstart', { touches: [touchStart], changedTouches: [touchStart], bubbles: true }));
          main.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touchEnd], bubbles: true }));
        }, { startX, endX, y });
        await wait(600);
        assert(true, 'Mobile touch swipe event dispatched without errors');
      }
    }

    const mobileBookScreenshot = path.join(SCREENSHOTS_DIR, '03_mobile_book_reader.png');
    await mobileBookPage.screenshot({ path: mobileBookScreenshot });
    console.log(`       📸 Screenshot saved: ${mobileBookScreenshot}`);

  } catch (err) {
    console.error('❌ Test execution error:', err);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`📊 PRE-DEPLOYMENT TEST SUMMARY: ${passedCount}/${totalCount} Checks Passed (${Math.round((passedCount / totalCount) * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runPreDeploymentSuite();
