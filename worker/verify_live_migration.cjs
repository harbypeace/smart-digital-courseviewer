const https = require('https');

// Sample newly migrated clean short key (u1/l1)
const testCleanUrl = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u10/l10p1_c1l1/page-11-w900.webp';
const testFirstCleanUrl = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/page-11-w900.webp';

function probe(u) {
  https.get(u, res => {
    console.log(`Probe [${res.statusCode}] ${u}`);
    console.log(`  Content-Type: ${res.headers['content-type']}`);
    console.log(`  Content-Length: ${res.headers['content-length']}`);
  }).on('error', e => console.error('Error:', e.message));
}

probe(testFirstCleanUrl);
