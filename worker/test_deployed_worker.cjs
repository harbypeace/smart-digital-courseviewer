const https = require('https');

const urls = [
  'https://lesson-viewer.lms-yemen-class.workers.dev/api/health',
  'https://lesson-viewer.lms-yemen-class.workers.dev/printed-pages?subject=bio10p1&unit=u1&lesson=l1&total=3',
];

for (const u of urls) {
  https.get(u, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log('URL:', u);
      console.log('Status:', res.statusCode);
      console.log('Content-Type:', res.headers['content-type']);
      console.log('Sample:', body.slice(0, 200));
      console.log('--------------------------------------------------');
    });
  }).on('error', e => console.error('Error:', e.message));
}
