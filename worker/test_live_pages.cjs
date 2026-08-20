const https = require('https');

const playerUrl = 'https://classroom-player.pages.dev';

https.get(playerUrl, (res) => {
  let body = '';
  res.on('data', (d) => (body += d));
  res.on('end', () => {
    console.log('Classroom Player Pages URL:', playerUrl);
    console.log('Status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('HTML preview:', body.slice(0, 250));
  });
}).on('error', (err) => console.error('Error testing player:', err.message));
