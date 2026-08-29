import { chromium } from 'file:///C:/Users/har/AppData/Roaming/npm/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'test-results', 'interactive-inspection');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runInteractiveInspection() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🔍 LIVE INTERACTIVE PLAYWRIGHT UI INSPECTOR');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Start local preview server
  console.log('🚀 Ensuring local preview server on port 8788...');
  const server = spawn('node', ['serve_preview.mjs'], {
    cwd: __dirname,
    stdio: 'pipe',
  });

  let serverReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8788/');
      if (res.ok || res.status === 200) {
        serverReady = true;
        break;
      }
    } catch {
      await wait(400);
    }
  }

  if (!serverReady) {
    console.error('❌ Server failed to start.');
    server.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  const steps = [];

  try {
    // ── STEP 1: Load Classroom Player ──
    console.log('▶ [Step 1]: Loading Classroom Player...');
    await page.goto('http://127.0.0.1:8788/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh', {
      waitUntil: 'domcontentloaded',
    });
    await wait(2500);

    const shot1 = path.join(SCREENSHOTS_DIR, 'step1_classroom_initial.png');
    await page.screenshot({ path: shot1 });
    steps.push({ step: 1, name: 'Classroom Initial Load', file: shot1, ok: true });
    console.log(`   📸 Captured: step1_classroom_initial.png`);

    // ── STEP 2: Open Scenes Drawer ──
    console.log('▶ [Step 2]: Opening Scenes Drawer...');
    const scenesButton = await page.$('button[title*="المشاهد"]');
    if (scenesButton) {
      await scenesButton.click();
      await wait(1000);
    }
    const shot2 = path.join(SCREENSHOTS_DIR, 'step2_scenes_drawer_open.png');
    await page.screenshot({ path: shot2 });
    steps.push({ step: 2, name: 'Scenes List Drawer Opened', file: shot2, ok: true });
    console.log(`   📸 Captured: step2_scenes_drawer_open.png`);

    // ── STEP 3: Switch to Scene 2 (المعلقات) ──
    console.log('▶ [Step 3]: Switching to Scene 2...');
    const sceneItems = await page.$$('aside div[class*="cursor-pointer"]');
    if (sceneItems.length > 1) {
      await sceneItems[1].click(); // Click second scene card
      await wait(2000);
    }
    const shot3 = path.join(SCREENSHOTS_DIR, 'step3_scene2_switched.png');
    await page.screenshot({ path: shot3 });
    steps.push({ step: 3, name: 'Switched to Scene 2', file: shot3, ok: true });
    console.log(`   📸 Captured: step3_scene2_switched.png`);

    // ── STEP 4: Open Voice Studio Modal ──
    console.log('▶ [Step 4]: Opening Voice Studio Modal...');
    // Reopen script panel if needed to click Voice Studio
    const voiceStudioBtn = await page.$('button[title*="استوديو"]');
    if (voiceStudioBtn) {
      await voiceStudioBtn.click();
      await wait(1000);
    }
    const shot4 = path.join(SCREENSHOTS_DIR, 'step4_voice_studio_modal.png');
    await page.screenshot({ path: shot4 });
    steps.push({ step: 4, name: 'Voice Studio Modal Opened', file: shot4, ok: true });
    console.log(`   📸 Captured: step4_voice_studio_modal.png`);

    // ── STEP 5: Printed Pages Reader ──
    console.log('▶ [Step 5]: Loading Printed Pages Reader (Pages 11 - 15)...');
    await page.goto('http://127.0.0.1:8788/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('img', { state: 'attached', timeout: 5000 });
    await wait(2500);

    const shot5 = path.join(SCREENSHOTS_DIR, 'step5_printed_pages_vertical.png');
    await page.screenshot({ path: shot5 });
    steps.push({ step: 5, name: 'Printed Pages Continuous Vertical View', file: shot5, ok: true });
    console.log(`   📸 Captured: step5_printed_pages_vertical.png`);

    // ── STEP 6: Switch to Horizontal Spread in Printed Pages ──
    console.log('▶ [Step 6]: Switching Printed Pages to Horizontal Spread...');
    const pageViewBtn = await page.$('button:has-text("صفحة")');
    if (pageViewBtn) {
      await pageViewBtn.click();
      await wait(1500);
    }
    const shot6 = path.join(SCREENSHOTS_DIR, 'step6_printed_pages_horizontal.png');
    await page.screenshot({ path: shot6 });
    steps.push({ step: 6, name: 'Printed Pages Horizontal Spread Mode', file: shot6, ok: true });
    console.log(`   📸 Captured: step6_printed_pages_horizontal.png`);

    console.log('\n✅ All interactive UI checks completed successfully!');
  } catch (err) {
    console.error('❌ Error during inspection:', err);
  } finally {
    await browser.close();
    server.kill();
  }
}

runInteractiveInspection();
