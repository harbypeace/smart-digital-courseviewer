const https = require('https');

const endpoints = [
  {
    name: '1. Worker Health on abduh-merzah.workers.dev',
    url: 'https://lesson-viewer.abduh-merzah.workers.dev/api/health',
  },
  {
    name: '2. Direct Private R2 Image Proxy via Worker Binding',
    url: 'https://lesson-viewer.abduh-merzah.workers.dev/pages/adb10p1/u1/l1/page-11-w900.webp',
  },
  {
    name: '3. Direct Private R2 Classroom JSON via Worker Binding',
    url: 'https://lesson-viewer.abduh-merzah.workers.dev/classroom/adb10p1/u1/l1/1v_nRmh_wh/classdata.json',
  },
  {
    name: '4. Printed Pages Full Responsive Webpage View',
    url: 'https://lesson-viewer.abduh-merzah.workers.dev/printed-pages?subject=adb10p1&unit=u1&lesson=l1&total=3',
  }
];

function testAll() {
  console.log('Testing live endpoints on https://lesson-viewer.abduh-merzah.workers.dev ...\n');
  endpoints.forEach(ep => {
    https.get(ep.url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        console.log(`[Status ${res.statusCode}] ${ep.name}`);
        console.log(`  URL: ${ep.url}`);
        console.log(`  Content-Type: ${res.headers['content-type']}`);
        console.log(`  Body Size: ${body.length} bytes\n`);
      });
    }).on('error', e => console.error(`Error on ${ep.name}:`, e.message));
  });
}

testAll();
