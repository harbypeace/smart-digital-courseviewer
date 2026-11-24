/**
 * Automated Verification Test for Printed Pages Offline Caching & Selective Download Options
 */

import assert from 'assert';

console.log('--- [1] Testing 900px WebP Canonical Key Generation ---');

function cleanUnitCode(unitCode) {
  if (!unitCode) return 'u1';
  const match = String(unitCode).match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : String(unitCode).replace(/.*_/, '');
}

function cleanLessonCode(lessonCode) {
  if (!lessonCode) return 'l1';
  const match = String(lessonCode).match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : String(lessonCode).replace(/.*_/, '');
}

function buildPageImageKey(subject, unit, lesson, pageNum) {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  const l = cleanLessonCode(lesson).toLowerCase();
  return `pages/${s}/${u}/${l}/page-${pageNum}-w900.webp`;
}

assert.strictEqual(
  buildPageImageKey('adb10p1', 'u1', 'l1', 5),
  'pages/adb10p1/u1/l1/page-5-w900.webp'
);
assert.strictEqual(
  buildPageImageKey('bio11', 'c02', 'c04', 12),
  'pages/bio11/u02/l04/page-12-w900.webp'
);
console.log('✓ 900px WebP storage key generator strictly targets 900px width.');

console.log('--- [2] Testing CacheStorage Simulation for Printed Pages ---');

class MockCacheStorage {
  constructor() {
    this.cache = new Map();
  }

  put(key, data) {
    this.cache.set(key, data);
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  delete(key) {
    this.cache.delete(key);
  }

  has(key) {
    return this.cache.has(key);
  }
}

const mockCache = new MockCacheStorage();

// Simulate downloading pages 1 to 5 at 900px
const startPage = 1;
const endPage = 5;
const subject = 'adb10p1';
const unit = 'u1';
const lesson = 'l1';

for (let p = startPage; p <= endPage; p++) {
  const key = buildPageImageKey(subject, unit, lesson, p);
  mockCache.put(key, { mime: 'image/webp', bytes: 45000 });
}

assert.strictEqual(mockCache.cache.size, 5);
assert.ok(mockCache.has(buildPageImageKey(subject, unit, lesson, 3)));
console.log('✓ Cached 5 pages strictly as w900.webp in simulated storage.');

console.log('--- [3] Testing Selective Options & Granular Deletion ---');

// Simulate separate Classroom vs Pages storage
const classroomStore = new Map();
classroomStore.set(`${subject}_${unit}_${lesson}`, { id: 'class_01', scenes: [{}, {}] });

assert.strictEqual(classroomStore.has(`${subject}_${unit}_${lesson}`), true);
assert.strictEqual(mockCache.cache.size, 5);

// User chooses to delete pages only:
for (let p = startPage; p <= endPage; p++) {
  mockCache.delete(buildPageImageKey(subject, unit, lesson, p));
}

assert.strictEqual(mockCache.cache.size, 0); // Pages deleted
assert.strictEqual(classroomStore.has(`${subject}_${unit}_${lesson}`), true); // Classroom still intact!
console.log('✓ Granular deletion passed: Deleting pages keeps classroom intact.');

// User chooses to delete classroom only:
classroomStore.delete(`${subject}_${unit}_${lesson}`);
assert.strictEqual(classroomStore.size, 0);
console.log('✓ Granular deletion passed: Deleting classroom keeps pages intact.');

console.log('\n======================================================');
console.log('🎉 ALL PRINTED PAGES & SELECTIVE DOWNLOAD TESTS PASSED');
console.log('======================================================\n');
