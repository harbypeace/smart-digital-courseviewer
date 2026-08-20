const https = require('https');

const candidates = [
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/bio10p1/bio10_u1/bio10_u1l1/page-1-w900.webp',
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/bio10p1/u1/l1/page-1-w900.webp',
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/hadith11/u1/l1/page-1-w900.webp',
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/math10p1/u1/l1/page-1-w900.webp',
];

for (const u of candidates) {
  https.get(u, res => {
    console.log(`[Status ${res.statusCode}] ${u}`);
  }).on('error', e => console.error(`Error on ${u}: ${e.message}`));
}
