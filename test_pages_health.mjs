const base = process.env.AUTH_BASE || 'http://localhost:8789';

const response = await fetch(`${base}/api/health`);
if (response.status !== 200) throw new Error(`Expected GET /api/health to return 200, got ${response.status}`);
if (response.headers.get('cache-control') !== 'no-store') throw new Error('Health response must be no-store');
const payload = await response.json();
if (payload.status !== 'ok' || payload.service !== 'courseviewer-pages') {
  throw new Error(`Unexpected health response: ${JSON.stringify(payload)}`);
}
if ('JWT_SECRET' in payload || 'bucket' in payload || 'bucketName' in payload) {
  throw new Error('Health response exposed sensitive storage or secret fields');
}

const head = await fetch(`${base}/api/health`, { method: 'HEAD' });
if (head.status !== 200 || (await head.text()) !== '') throw new Error('HEAD /api/health did not return an empty 200 response');

const method = await fetch(`${base}/api/health`, { method: 'PUT' });
if (method.status !== 405) throw new Error(`Expected PUT /api/health to return 405, got ${method.status}`);

console.log('PASS Pages health endpoint checks');
