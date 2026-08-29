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
    const classroomUrl = 'https://courseviewer.lms-yemen.com/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh';
    await page.goto(classroomUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the classroom canvas / stage to render
    await page.waitForSelector('.w-full.h-full', { timeout: 15000 });
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
    const classroomScreenshot = path.join(SCREENSHOTS_DIR, '01_classroom_player_prod.png');
    await page.screenshot({ path: classroomScreenshot, fullPage: false });
    console.log(`       📸 Screenshot saved: ${classroomScreenshot}\n`);

  } catch (err) {
    console.error('❌ Test execution error:', err);
  } finally {
    await browser.close();
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log(`📊 PLAYWRIGHT TEST SUMMARY: ${testsPassed}/${totalTests} Tests Passed (${Math.round((testsPassed / totalTests) * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');
}

runPlaywrightUITests();
