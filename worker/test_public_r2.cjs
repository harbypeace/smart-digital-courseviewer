const https = require('https');

const urls = [
  // 1. Direct classroom JSON check on public R2 domain
  'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/classrooms/bio10p1/u1/l1/KbOpmXdyXa/classdata.json',
  'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/hadith11/hadith11_u1l1.html',
];

for (const u of urls) {
  https.get(u, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      console.log('Testing URL:', u);
      console.log('Status:', res.statusCode);
      console.log('Type:', res.headers['content-type']);
      console.log('Body length:', data.length);
      console.log('Sample:', data.slice(0, 150));
      console.log('--------------------------------------------------');
    });
  }).on('error', e => console.error('Error:', e.message));
}
