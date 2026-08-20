const https = require('https');

const sampleUrl = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/adb10p1_c1/adb10p1_c1l1/page-11-w900.webp';

https.get(sampleUrl, res => {
  console.log(`HTTP Status: ${res.statusCode}`);
  console.log(`Content-Type: ${res.headers['content-type']}`);
  console.log(`Content-Length: ${res.headers['content-length']} bytes`);
}).on('error', e => console.error('Error:', e.message));
