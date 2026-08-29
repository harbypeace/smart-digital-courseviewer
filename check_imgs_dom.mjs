import { chromium } from 'file:///C:/Users/har/AppData/Roaming/npm/node_modules/playwright/index.mjs';

import { spawn } from 'child_process';

async function checkImgElements() {
  const server = spawn('node', ['serve_preview.mjs'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  
  await page.goto('http://127.0.0.1:8788/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15', {
    waitUntil: 'networkidle',
  });

  const imgs = await page.$$eval('img', (elements) =>
    elements.map((img) => ({
      src: img.src,
      currentSrc: img.currentSrc,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
      visibility: window.getComputedStyle(img).visibility,
      display: window.getComputedStyle(img).display,
    }))
  );

  console.log('Image elements in DOM:', JSON.stringify(imgs, null, 2));

  const bodyHtml = await page.$eval('body', el => el.innerHTML);
  console.log('Has error boxes?', bodyHtml.includes('لا توجد صورة'));

  await browser.close();
  server.kill();
}
checkImgElements();
