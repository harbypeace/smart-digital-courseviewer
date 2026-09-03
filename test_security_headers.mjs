const base = process.env.AUTH_BASE || 'http://localhost:8789';

async function request(path, init = {}) {
  return fetch(`${base}${path}`, init);
}

const protectedResponse = await request('/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=test');
if (protectedResponse.status !== 401) throw new Error(`Expected 401 for missing auth, got ${protectedResponse.status}`);
for (const [header, expected] of [
  ['referrer-policy', 'no-referrer'],
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'SAMEORIGIN'],
  ['permissions-policy', 'camera=(), geolocation=(), microphone=()'],
]) {
  const actual = protectedResponse.headers.get(header);
  if (actual !== expected) throw new Error(`Expected ${header}=${expected}, got ${actual}`);
}

const allowed = await request('/api/classroom-data', {
  method: 'OPTIONS',
  headers: { Origin: 'http://localhost:5173' },
});
if (allowed.status !== 204 || allowed.headers.get('access-control-allow-origin') !== 'http://localhost:5173') {
  throw new Error('Allowlisted preflight did not receive the configured origin');
}

const denied = await request('/api/classroom-data', {
  method: 'OPTIONS',
  headers: { Origin: 'https://evil.example' },
});
if (denied.status !== 204 || denied.headers.get('access-control-allow-origin') !== 'null') {
  throw new Error('Disallowed preflight did not receive a null origin');
}

console.log('PASS security headers and CORS allowlist checks');
