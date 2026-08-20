const https = require('https');

const u = 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/classrooms/bio10p1/u1/l1/KbOpmXdyXa/classdata.json';

https.get(u, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('URL:', u);
    console.log('Status:', res.statusCode);
    console.log('Type:', res.headers['content-type']);
    console.log('Sample:', data.slice(0, 200));
  });
}).on('error', e => console.error('Error:', e.message));
