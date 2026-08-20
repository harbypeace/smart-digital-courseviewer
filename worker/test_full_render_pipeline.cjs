const https = require('https');

const tests = [
  {
    name: '1. Cloudflare Pages — Classroom Player App',
    url: 'https://classroom-player.pages.dev/?jsonUrl=https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json',
    expectedStatus: [200],
  },
  {
    name: '2. Local Vite Proxy — Printed Pages HTML Renderer',
    url: 'http://localhost:5173/api/printed-pages?subject=adb10p1&unit=u1&lesson=l1&total=3',
    isHttp: true,
    expectedStatus: [200],
  },
  {
    name: '3. R2 Classroom Data Direct Stream',
    url: 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json',
    expectedStatus: [200],
  },
  {
    name: '4. R2 Clean Standard Printed Image (u1/l1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/page-11-w900.webp',
    expectedStatus: [200],
  },
  {
    name: '5. R2 Legacy Printed Image Fallback (c1/c1l1)',
    url: 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/adb10p1_c1/adb10p1_c1l1/page-11-w900.webp',
    expectedStatus: [200],
  }
];

const http = require('http');

async function runTests() {
  console.log('🧪 Starting End-to-End Rendering Verification for Pages & Worker...\n');

  for (const t of tests) {
    await new Promise((resolve) => {
      const client = t.isHttp ? http : https;
      client.get(t.url, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const pass = t.expectedStatus.includes(res.statusCode);
          console.log(`${pass ? '✅' : '❌'} ${t.name}`);
          console.log(`   URL: ${t.url}`);
          console.log(`   Status: ${res.statusCode} | Content-Type: ${res.headers['content-type']} | Size: ${body.length} bytes\n`);
          resolve();
        });
      }).on('error', (err) => {
        console.log(`❌ ${t.name} (Error: ${err.message})\n`);
        resolve();
      });
    });
  }
}

runTests();
