import { createJwt, verifyJwt, extractJwtFromRequest, isCourseAuthorized } from './src/lib/jwt-auth.js';

const TEST_SECRET = 'super-secret-lms-jwt-key-2026-xyz!';

async function runJwtSecurityTests() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🔐 TESTING OPTION A: SIGNED JWT TOKENS & LMS ACCESS CONTROL');
  console.log('════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${total}. ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${total}. ${message}`);
    }
  }

  // ── Test 1: Generate Valid JWT Token ──
  const validPayload = {
    sub: 'student_9981',
    role: 'student',
    allowedCourses: ['adb10p1', 'bio10p1'],
  };
  const token = await createJwt(validPayload, TEST_SECRET, 3600);
  assert(typeof token === 'string' && token.split('.').length === 3, 'JWT Token generated with 3 parts (header.payload.signature)');

  // ── Test 2: Verify Valid JWT Token ──
  const verifyResult = await verifyJwt(token, TEST_SECRET);
  assert(verifyResult.valid === true && verifyResult.payload?.sub === 'student_9981', 'Valid JWT token verified successfully with payload');

  // ── Test 3: Reject Tampered JWT Signature ──
  const tamperedToken = token.slice(0, -5) + 'abcde';
  const tamperedResult = await verifyJwt(tamperedToken, TEST_SECRET);
  assert(tamperedResult.valid === false && tamperedResult.error?.includes('signature'), 'Tampered token signature correctly rejected');

  // ── Test 4: Reject Wrong Secret Key ──
  const wrongSecretResult = await verifyJwt(token, 'wrong-secret-key');
  assert(wrongSecretResult.valid === false, 'Token signed with different secret correctly rejected');

  // ── Test 5: Reject Expired Token ──
  const expiredPayload = {
    sub: 'student_expired',
    exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
  };
  const expiredToken = await createJwt(expiredPayload, TEST_SECRET);
  const expiredResult = await verifyJwt(expiredToken, TEST_SECRET);
  assert(expiredResult.valid === false && expiredResult.error?.includes('expired'), 'Expired token correctly rejected');

  // ── Test 6: Course-Level Authorization (Whitelisted Course) ──
  const allowed = isCourseAuthorized(validPayload, 'adb10p1');
  assert(allowed === true, 'Enrolled course "adb10p1" authorized for student');

  // ── Test 7: Course-Level Authorization (Unauthorized Course) ──
  const forbidden = isCourseAuthorized(validPayload, 'phy12');
  assert(forbidden === false, 'Un-enrolled course "phy12" correctly forbidden for student');

  // ── Test 8: Admin & Teacher Superuser Access ──
  const teacherPayload = { sub: 'teacher_1', role: 'teacher' };
  assert(isCourseAuthorized(teacherPayload, 'phy12') === true, 'Teacher role has universal access to all courses');

  // ── Test 9: Universal Wildcard Course Access ──
  const wildcardPayload = { sub: 'student_vip', allowedCourses: ['*'] };
  assert(isCourseAuthorized(wildcardPayload, 'math10p1') === true, 'Wildcard ["*"] user has access to any course');

  // ── Test 10: Extract JWT from Authorization Header ──
  const reqHeader = new Request('http://localhost:8788/api/classroom-data', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const extractedHeader = extractJwtFromRequest(reqHeader);
  assert(extractedHeader === token, 'JWT correctly extracted from "Authorization: Bearer <token>" header');

  // ── Test 11: Extract JWT from URL Query Parameter (?token=...) ──
  const reqUrl = new Request(`http://localhost:8788/classroom?subject=adb10p1&token=${encodeURIComponent(token)}`);
  const extractedUrl = extractJwtFromRequest(reqUrl);
  assert(extractedUrl === token, 'JWT correctly extracted from "?token=..." URL parameter');

  // ── Test 12: Extract JWT from Cookie ──
  const reqCookie = new Request('http://localhost:8788/api/courses/classrooms/data', {
    headers: { Cookie: `session_id=123; jwt_token=${encodeURIComponent(token)}` },
  });
  const extractedCookie = extractJwtFromRequest(reqCookie);
  assert(extractedCookie === token, 'JWT correctly extracted from "jwt_token" cookie');

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`📊 JWT SECURITY TEST RESULT: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('════════════════════════════════════════════════════════════════════\n');
}

runJwtSecurityTests();
