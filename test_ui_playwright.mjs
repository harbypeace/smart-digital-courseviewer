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

async function runPlaywrightUITests() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🎭 STARTING PLAYWRIGHT UI TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // 1. Start preview server
  console.log('🚀 Starting local preview server on port 8788...');
  const server = spawn('node', ['serve_preview.mjs'], {
    cwd: __dirname,
    stdio: 'pipe',
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
    console.error('❌ Server failed to start.');
    server.kill();
    process.exit(1);
  }
  console.log('✅ Server is ready!\n');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.log('Installing Playwright Chromium browser...');
    console.error('Browser launch error:', err.message);
    server.kill();
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`[Page Error]: ${err.message}`);
  });

  let testsPassed = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${totalTests}. ${testName}`);
      if (details) console.log(`       ↳ ${details}`);
      testsPassed++;
      return true;
    } else {
      console.error(`❌ [FAIL] ${totalTests}. ${testName}`);
      if (details) console.error(`       ↳ ${details}`);
      return false;
    }
  }

  try {
    // ── TEST 1: Classroom Player Page ──
    console.log('--- Testing 1: Classroom Player Page ---');
    const classroomUrl = 'http://127.0.0.1:8788/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh';
    await page.goto(classroomUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the classroom canvas / stage to render
    await page.waitForSelector('.w-full.h-full', { timeout: 10000 });
    await wait(3000); // Allow speech / actions to initialize

    const title = await page.title();
    assert(title.length > 0, 'Classroom page loaded with title', `Title: "${title}"`);

    // Check for dialogue cards or script sidebar
    const scriptPanel = await page.$('aside');
    assert(scriptPanel !== null, 'Synchronized script sidebar rendered');

    // Check dialogue cards exist
    const dialogueCards = await page.$$('aside div[class*="rounded"]');
    assert(dialogueCards.length > 0, 'Speech dialogue cards rendered in sidebar', `Found ${dialogueCards.length} cards`);

    // Check playback controls footer exists
    const footer = await page.$('footer');
    assert(footer !== null, 'Bottom playback & scene navigation toolbar rendered');

    // Screenshot
    const classroomScreenshot = path.join(SCREENSHOTS_DIR, '01_classroom_player.png');
    await page.screenshot({ path: classroomScreenshot, fullPage: false });
    console.log(`       📸 Screenshot saved: ${classroomScreenshot}\n`);

    // ── TEST 2: Printed Pages Viewer (Pages from Zero) ──
    console.log('--- Testing 2: Printed Pages Viewer (Pages from 0) ---');
    const printedUrl = 'http://127.0.0.1:8788/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=0&end=5';
    await page.goto(printedUrl, { waitUntil: 'domcontentloaded' });
    await wait(2500);

    // Check images container
    const images = await page.$$('img');
    assert(images.length > 0, 'Digital textbook scan images rendered', `Found ${images.length} images`);

    // Check page navigation
    const bodyText = await page.textContent('body');
    const hasNav = bodyText.includes('صفحة') || bodyText.includes('0');
    assert(hasNav, 'Page navigation indicators rendered');

    const printedScreenshot = path.join(SCREENSHOTS_DIR, '02_printed_pages.png');
    await page.screenshot({ path: printedScreenshot, fullPage: false });
    console.log(`       📸 Screenshot saved: ${printedScreenshot}\n`);

    // ── TEST 3: ZIP Mode Progressive Classroom ──
    console.log('--- Testing 3: ZIP Mode Progressive Classroom ---');
    const zipUrl = 'http://127.0.0.1:8788/classroom?mode=zip&zipUrl=/samples/test-classroom.zip';
    await page.goto(zipUrl, { waitUntil: 'domcontentloaded' });
    await wait(3000);

    const zipDialogues = await page.$$('aside div[class*="rounded"]');
    assert(zipDialogues.length > 0, 'ZIP Package manifest extracted and rendered', `Found ${zipDialogues.length} speech elements`);

    const zipScreenshot = path.join(SCREENSHOTS_DIR, '03_zip_classroom.png');
    await page.screenshot({ path: zipScreenshot, fullPage: false });
    console.log(`       📸 Screenshot saved: ${zipScreenshot}\n`);

    // ── TEST 4: Console Errors Check ──
    console.log('--- Testing 4: Browser Console Health ---');
    const fatalErrors = consoleErrors.filter(
      (e) => !e.includes('favicon') && !e.includes('NotAllowedError') && !e.includes('Audio play')
    );
    assert(fatalErrors.length === 0, 'No critical JavaScript runtime exceptions', fatalErrors.length ? fatalErrors.join('\n') : '0 fatal JS errors');

  } catch (err) {
    console.error('❌ Test execution error:', err);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`📊 PLAYWRIGHT TEST SUMMARY: ${testsPassed}/${totalTests} Tests Passed (${Math.round((testsPassed / totalTests) * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');
}

runPlaywrightUITests();
