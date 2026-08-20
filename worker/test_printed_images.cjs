const https = require('https');

const imageBuckets = [
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev',
  'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev'
];

const paths = [
  'bio10p1/bio10p1_u1/bio10p1_l1/page-1-w900.webp',
  'bioearth10/bioearth10_u1/bioearth10_l1/page-1-w900.webp',
  'hadith11/hadith11_u1/hadith11_l1/page-1-w900.webp'
];

async function check() {
  for (const b of imageBuckets) {
    for (const p of paths) {
      const u = `${b}/${p}`;
      https.get(u, res => {
        console.log(`[${res.statusCode}] ${u} (Content-Type: ${res.headers['content-type'] || 'none'})`);
      }).on('error', e => console.error(`Error on ${u}: ${e.message}`));
    }
  }
}

check();
