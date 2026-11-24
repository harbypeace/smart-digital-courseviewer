import { chromium } from 'file:///C:/Users/har/AppData/Roaming/npm/node_modules/playwright/index.mjs';
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

async function runLiveProductionTests() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🌍 TESTING LIVE CLOUDFLARE PAGES PRODUCTION DEPLOYMENT');
  console.log('   Target: https://courseviewer.lms-yemen.com');
  console.log('   Deployment Hash: https://39dd05c9.courseviewer-cf-pages.pages.dev');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Test 1: Health endpoint on live domain
  try {
    const healthRes = await fetch('https://courseviewer.lms-yemen.com/api/health');
    const healthJson = await healthRes.json();
    assert(healthRes.ok && healthJson.status === 'ok', 'Live /api/health endpoint reachable', JSON.stringify(healthJson));
  } catch (err) {
    assert(false, 'Live /api/health endpoint reachable', err.message);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await desktopContext.newPage();

    // ── SECTION 1: Live Classroom Player Page ──
    console.log('\n── 1. Live Classroom Player Page ──');
    const liveClassroomUrl = 'https://courseviewer.lms-yemen.com/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh';
    await page.goto(liveClassroomUrl, { waitUntil: 'domcontentloaded' });
    await wait(3000);

    const title = await page.title();
    assert(title.length > 0, 'Live Classroom Player page loaded with title', `Title: "${title}"`);

    const downloadBtn = await page.$('button[title*="مدير التنزيل"]');
    assert(downloadBtn !== null, 'Download Manager trigger button present in live production player');

    if (downloadBtn) {
      await downloadBtn.click();
      await wait(600);

      const modalHeader = await page.$('h3:has-text("مدير التنزيل")');
      assert(modalHeader !== null, 'Download Manager modal opened in live production');

      const classroomCheck = await page.$('input[type="checkbox"]:near(:text("الغرفة الصفية التفاعلية"))');
      assert(classroomCheck !== null, 'Classroom selective option checkbox present');

      const isClassroomChecked = classroomCheck ? await classroomCheck.isChecked() : false;
      assert(isClassroomChecked, 'Classroom option is checked by default');

      const pagesCheck = await page.$('input[type="checkbox"]:near(:text("صفحات الكتاب المطبوع"))');
      assert(pagesCheck !== null, '900px WebP Pages selective option checkbox present');

      const isPagesChecked = pagesCheck ? await pagesCheck.isChecked() : false;
      assert(isPagesChecked, '900px WebP Pages option is checked by default');

      const screenshot1 = path.join(SCREENSHOTS_DIR, 'live_prod_classroom_modal.png');
      await page.screenshot({ path: screenshot1 });
      console.log(`       📸 Screenshot saved: ${screenshot1}`);

      const closeBtn = await page.$('button:has-text("إغلاق")');
      if (closeBtn) await closeBtn.click();
    }

    // ── SECTION 2: Live Printed Pages Viewer ──
    console.log('\n── 2. Live Printed Pages Viewer ──');
    const printedPage = await desktopContext.newPage();
    const livePrintedUrl = 'https://courseviewer.lms-yemen.com/printed-pages?subject=adb10p1&unit=u1&lesson=l1';
    await printedPage.goto(livePrintedUrl, { waitUntil: 'domcontentloaded' });
    await wait(3000);

    const printedTitle = await printedPage.title();
    assert(printedTitle.length > 0, 'Live Printed Pages Viewer loaded with title', `Title: "${printedTitle}"`);

    const webpImgs = await printedPage.$$('img[src*="w900.webp"]');
    assert(webpImgs.length > 0, 'Live Printed Pages renders 900px WebP textbook images', `Found ${webpImgs.length} images`);

    const printedDownloadBtn = await printedPage.$('button[title*="مدير التنزيلات"]');
    assert(printedDownloadBtn !== null, 'Download Manager button present in live Printed Pages viewer');

    if (printedDownloadBtn) {
      await printedDownloadBtn.click();
      await wait(600);

      const printedModalHeader = await printedPage.$('h3:has-text("مدير التنزيل")');
      assert(printedModalHeader !== null, 'Download Manager modal opened in live Printed Pages');

      const pagesBox = await printedPage.$('input[type="checkbox"]:near(:text("صفحات الكتاب المطبوع"))');
      const isPagesBoxChecked = pagesBox ? await pagesBox.isChecked() : false;
      assert(isPagesBoxChecked, '900px Pages checkbox is checked by default in live Printed Pages modal');

      const screenshot2 = path.join(SCREENSHOTS_DIR, 'live_prod_printed_pages_modal.png');
      await printedPage.screenshot({ path: screenshot2 });
      console.log(`       📸 Screenshot saved: ${screenshot2}`);

      const closeBtn = await printedPage.$('button:has-text("إغلاق")');
      if (closeBtn) await closeBtn.click();
    }

    // ── SECTION 3: Live Mobile Viewport & Auto-Hide ──
    console.log('\n── 3. Live Mobile Viewport & 3s Inactivity Auto-Hide ──');
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(liveClassroomUrl, { waitUntil: 'domcontentloaded' });
    await wait(3000);

    const mobileScenesBtn = await mobilePage.$('button[title*="عرض قائمة المشاهد"]');
    assert(mobileScenesBtn !== null, 'Mobile scenes drawer button present on live production');

    if (mobileScenesBtn) {
      await mobileScenesBtn.click();
      await wait(500);

      let mobileAside = await mobilePage.$('aside');
      assert(mobileAside !== null, 'Mobile sidebar drawer opened on live production');

      console.log('       ⏳ Waiting 3.5 seconds to verify auto-hide on mobile inactivity...');
      await wait(3500);

      mobileAside = await mobilePage.$('aside');
      assert(mobileAside === null, 'Mobile sidebar drawer automatically hid after 3s of inactivity on live production');

      const screenshot3 = path.join(SCREENSHOTS_DIR, 'live_prod_mobile_classroom.png');
      await mobilePage.screenshot({ path: screenshot3 });
      console.log(`       📸 Screenshot saved: ${screenshot3}`);
    }

  } catch (err) {
    console.error('❌ Live production test error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`📊 LIVE PRODUCTION TEST SUMMARY: ${passedCount}/${totalCount} Checks Passed (${Math.round((passedCount / totalCount) * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runLiveProductionTests();
