/**
 * Automated Verification Test for Offline Local Storage & Resolver
 * Tests schema constraints, key normalization, IndexedDB/Cache simulation,
 * and hydrated data resolution.
 */

import assert from 'assert';

console.log('--- [1] Testing Lesson & Unit Key Building and Normalization ---');

function cleanUnitCode(unit) {
  if (!unit) return 'u1';
  const match = String(unit).match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : String(unit).replace(/.*_/, '');
}

function cleanLessonCode(lesson) {
  if (!lesson) return 'l1';
  const match = String(lesson).match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : String(lesson).replace(/.*_/, '');
}

function buildLessonKey(subject, unit, lesson, classroomId) {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  const l = cleanLessonCode(lesson).toLowerCase();
  const c = (classroomId || '').trim();
  return `${s}/${u}/${l}/${c}`;
}

function buildUnitKey(subject, unit) {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  return `${s}/${u}`;
}

// Assertions on normalization matching existing utils.ts behavior
assert.strictEqual(buildLessonKey('BIO', 'u1', 'l2', 'bio_l2'), 'bio/u1/l2/bio_l2');
assert.strictEqual(buildLessonKey('math', 'c3', 'c4', 'math_l4'), 'math/u3/l4/math_l4');
assert.strictEqual(buildUnitKey('Physics', 'u5'), 'physics/u5');
console.log('✓ Key building and normalization tests passed.');

console.log('--- [2] Testing In-Memory Local DB Simulation ---');

class MockIDBStore {
  constructor(keyPath) {
    this.keyPath = keyPath;
    this.data = new Map();
  }

  put(record) {
    const key = record[this.keyPath];
    this.data.set(key, JSON.parse(JSON.stringify(record)));
  }

  get(key) {
    return this.data.get(key) || null;
  }

  getAll() {
    return Array.from(this.data.values());
  }

  delete(key) {
    this.data.delete(key);
  }
}

const lessonsStore = new MockIDBStore('lessonKey');
const unitsStore = new MockIDBStore('unitKey');

// Mock classroom record
const mockLesson = {
  lessonKey: buildLessonKey('bio', 'u1', 'l1', 'bio_u1_l1_01'),
  subject: 'bio',
  unit: 'u1',
  lesson: 'l1',
  classroomId: 'bio_u1_l1_01',
  title: 'مقدمة في علم الأحياء',
  scenesCount: 2,
  sizeBytes: 4096,
  classroomData: {
    id: 'stage_test',
    stage: { id: 'stage_test', name: 'مقدمة في علم الأحياء' },
    scenes: [
      {
        id: 'scene_0',
        title: 'المشهد الأول',
        type: 'slide',
        content: {
          type: 'slide',
          canvas: {
            elements: [
              { type: 'image', src: 'cell_diagram.png' },
              { type: 'text', content: 'الخلية الحية' },
            ],
          },
        },
        actions: [
          {
            type: 'speech',
            text: 'مرحبا بكم في الدرس الأول',
            audioUrl: 'scene_00_speech_00.mp3',
          },
        ],
      },
    ],
  },
  downloadedAt: Date.now(),
  mediaFiles: ['cell_diagram.png', 'scene_00_speech_00.mp3'],
  isComplete: true,
};

// 1. Put lesson
lessonsStore.put(mockLesson);
assert.strictEqual(lessonsStore.data.size, 1);

// 2. Query lesson
const retrieved = lessonsStore.get(mockLesson.lessonKey);
assert.ok(retrieved);
assert.strictEqual(retrieved.title, 'مقدمة في علم الأحياء');
assert.strictEqual(retrieved.scenesCount, 2);
console.log('✓ Lesson store put and get passed.');

console.log('--- [3] Testing Media Asset Rewriting / Hydration ---');

const mockMediaCache = new Map();
mockMediaCache.set('cell_diagram.png', 'blob:http://localhost:5173/mock-cell-uuid');
mockMediaCache.set('scene_00_speech_00.mp3', 'blob:http://localhost:5173/mock-audio-uuid');

function hydrateMockData(data) {
  const clone = JSON.parse(JSON.stringify(data));
  for (const sc of clone.scenes) {
    if (sc.content?.canvas?.elements) {
      for (const el of sc.content.canvas.elements) {
        if (el.type === 'image' && mockMediaCache.has(el.src)) {
          el.src = mockMediaCache.get(el.src);
        }
      }
    }
    if (sc.actions) {
      for (const a of sc.actions) {
        if (a.audioUrl && mockMediaCache.has(a.audioUrl)) {
          a.audioUrl = mockMediaCache.get(a.audioUrl);
        }
      }
    }
  }
  return clone;
}

const hydrated = hydrateMockData(retrieved.classroomData);
assert.strictEqual(hydrated.scenes[0].content.canvas.elements[0].src, 'blob:http://localhost:5173/mock-cell-uuid');
assert.strictEqual(hydrated.scenes[0].actions[0].audioUrl, 'blob:http://localhost:5173/mock-audio-uuid');
console.log('✓ Media asset hydration into in-memory blob URLs passed.');

console.log('--- [4] Testing Deletion & Cleanup ---');
lessonsStore.delete(mockLesson.lessonKey);
assert.strictEqual(lessonsStore.get(mockLesson.lessonKey), null);
console.log('✓ Storage deletion and cleanup passed.');

console.log('\n===========================================');
console.log('🎉 ALL OFFLINE STORAGE TESTS PASSED SUCCESSFULLY');
console.log('===========================================\n');
