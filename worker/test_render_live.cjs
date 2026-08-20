const https = require('https');

const testCases = [
  // ── 1. Clean Printed Images (u1/l1) ──
  {
    category: '🖼️ Clean Page Image (u1/l1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/page-11-w900.webp',
    expectedType: 'image/webp',
  },
  {
    category: '🖼️ Clean Page Image (u1/l1 - Bio)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/bio10p1/u1/l1/page-1-w900.webp',
    expectedType: 'image/webp',
  },
  {
    category: '🖼️ Clean Page Image (u1/l1 - Math)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/math10p1/u1/l1/page-1-w900.webp',
    expectedType: 'image/webp',
  },

  // ── 2. Course Covers & Thumbnails ──
  {
    category: '🎨 Course Thumbnail (adb10p1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/thumbnails/adb10p1.webp',
    expectedType: 'image/webp',
  },
  {
    category: '🎨 Course Thumbnail (bio10p1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/thumbnails/bio10p1.webp',
    expectedType: 'image/webp',
  },
  {
    category: '🎨 Course Thumbnail (ar7p1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/thumbnails/ar7p1.webp',
    expectedType: 'image/webp',
  },

  // ── 3. Classroom JSON Data Direct Streams ──
  {
    category: '🏫 Classroom Data (adb10p1 u1 l1)',
    url: 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json',
    expectedType: 'application/json',
  },
  {
    category: '🏫 Classroom Data (ar6p1 u1 l1)',
    url: 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/ar6p1/u1/l1/z4_lqVb4_r/classdata.json',
    expectedType: 'application/json',
  },
  {
    category: '🏫 Classroom Export (adb10p1 u1 l1)',
    url: 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/adb10p1/u1/l1/1v_nRmh_wh/export.json',
    expectedType: 'application/json',
  },
];

async function runLiveTests() {
  console.log('🧪 Running Live Render Tests for Images, Thumbnails & Classrooms...\n');

  for (const item of testCases) {
    await new Promise((resolve) => {
      https.get(item.url, (res) => {
        let size = 0;
        res.on('data', chunk => size += chunk.length);
        res.on('end', () => {
          const isOk = res.statusCode === 200;
          const contentType = res.headers['content-type'] || '';
          console.log(`${isOk ? '✅' : '❌'} ${item.category}`);
          console.log(`   URL:    ${item.url}`);
          console.log(`   Status: ${res.statusCode} | Type: ${contentType} | Size: ${(size / 1024).toFixed(1)} KB\n`);
          resolve();
        });
      }).on('error', (err) => {
        console.log(`❌ ${item.category} (Error: ${err.message})\n`);
        resolve();
      });
    });
  }
}

runLiveTests();
