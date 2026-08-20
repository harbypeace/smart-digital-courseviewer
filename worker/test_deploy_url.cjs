const https = require('https');

const u = 'https://fb40d8c6.classroom-player.pages.dev';

https.get(u, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => {
    console.log('Testing specific deploy URL:', u);
    console.log('Status:', res.statusCode);
    console.log('Sample:', body.slice(0, 200));
  });
}).on('error', (err) => console.error('Error on specific deploy URL:', err.message));
