const https = require('https');

const testUrls = [
  'https://lesson-viewer.abduh-merzah.workers.dev/api/health',
  'https://lesson-viewer.abduh-merzah.workers.dev/printed-pages?subject=bio10p1&unit=u1&lesson=l1&total=5',
  'https://lesson-viewer.abduh-merzah.workers.dev/pages/bioearth10/bioearth10_u1/bioearth10_l1/page-1-w900.webp'
];

for (const u of testUrls) {
  https.get(u, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('----------------------------------------');
      console.log('Testing URL:', u);
      console.log('Status Code:', res.statusCode);
      console.log('Content-Type:', res.headers['content-type']);
      console.log('Response Length:', body.length);
      console.log('Preview:', body.slice(0, 180));
    });
  }).on('error', (err) => {
    console.error('Error reaching worker:', u, err.message);
  });
}
