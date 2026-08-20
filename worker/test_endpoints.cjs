const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:8787${path}`, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        console.log(`\n========================================`);
        console.log(`URL:    ${path}`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`CORS:   ${res.headers['access-control-allow-origin']}`);
        console.log(`Type:   ${res.headers['content-type']}`);
        console.log(`Body Sample (first 200 chars):`);
        console.log(body.slice(0, 200));
        console.log(`========================================`);
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Testing Worker Endpoints:');
  try {
    // 1. Health check
    await get('/api/health');

    // 2. Classroom listing
    await get('/classroom/bio10p1/u1/l1');

    // 3. Direct classdata.json fetch (for iframe or player)
    await get('/classroom/bio10p1/u1/l1/KbOpmXdyXa/classdata.json');

    // 4. HTML lesson
    await get('/html/hadith11/hadith11_u1l1.html');

  } catch (err) {
    console.error('Test Failed:', err.message);
  }
}

main();
