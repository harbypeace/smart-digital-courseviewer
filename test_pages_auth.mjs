import { createJwt } from './src/lib/jwt-auth.js';

const base = process.env.AUTH_BASE || 'http://localhost:8789';
const secret = 'local-courseviewer-test-secret';
const allowedToken = await createJwt({ sub: 'student-test', role: 'student', allowedCourses: ['adb10p1'] }, secret, 3600);

async function check(name, path, expected, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.text();
  const ok = expected.includes(response.status);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${response.status} (expected ${expected.join('/')}) ${body.slice(0, 120).replace(/\s+/g, ' ')}`);
  if (!ok) process.exitCode = 1;
}

await check('public printed pages exemption', '/printed-pages?subject=adb10p1', [200]);
await check('missing token rejected', '/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=test', [401]);
await check('allowed subject reaches resolver', '/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=test', [404], { headers: { Authorization: `Bearer ${allowedToken}` } });
await check('forbidden subject rejected', '/api/classroom-data?subject=phy12p1&unit=u1&lesson=l1&id=test', [403], { headers: { Authorization: `Bearer ${allowedToken}` } });
await check('private proxy missing token rejected', '/api/courses/classrooms/adb10p1/u1/l1/test/classdata.json', [401]);
await check('private proxy malformed path rejected after auth', '/api/courses/adb10p1/%E0%A4%A/secrets.json', [400], { headers: { Authorization: `Bearer ${allowedToken}` } });
