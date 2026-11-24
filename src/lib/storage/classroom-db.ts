import type { ClassroomData } from '@openmaic/viewer';
import { cleanUnitCode, cleanLessonCode } from '../utils';

export const DB_NAME = 'CourseViewerLocalDB';
export const DB_VERSION = 1;

export const STORE_LESSONS = 'lessons';
export const STORE_UNITS = 'units';
export const STORE_DOWNLOAD_QUEUE = 'download_queue';

export interface LocalLessonRecord {
  lessonKey: string; // e.g. "bio/u1/l1/class_01"
  subject: string;
  unit: string;
  lesson: string;
  classroomId: string;
  title: string;
  description?: string;
  scenesCount: number;
  sizeBytes: number;
  classroomData: ClassroomData;
  downloadedAt: number;
  mediaFiles: string[]; // List of stored media asset paths/keys in CacheStorage
  hasPrintedPages?: boolean;
  printedPagesRange?: { start: number; end: number };
  isComplete: boolean;
}

export interface LocalUnitRecord {
  unitKey: string; // e.g. "bio/u1"
  subject: string;
  unit: string;
  title?: string;
  totalLessons: number;
  downloadedLessons: number;
  updatedAt: number;
}

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'error';

export interface DownloadTaskRecord {
  taskId: string; // e.g. "bio/u1/l1/class_01"
  subject: string;
  unit: string;
  lesson: string;
  classroomId: string;
  title: string;
  zipUrl?: string;
  status: DownloadStatus;
  progress: number; // 0 to 100
  downloadedBytes: number;
  totalBytes: number;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

export function buildLessonKey(subject: string, unit: string, lesson: string, classroomId: string): string {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  const l = cleanLessonCode(lesson).toLowerCase();
  const c = (classroomId || '').trim();
  return `${s}/${u}/${l}/${c}`;
}

export function buildUnitKey(subject: string, unit: string): string {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  return `${s}/${u}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openLocalDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Lessons store
      if (!db.objectStoreNames.contains(STORE_LESSONS)) {
        const store = db.createObjectStore(STORE_LESSONS, { keyPath: 'lessonKey' });
        store.createIndex('by_subject', 'subject', { unique: false });
        store.createIndex('by_unit', 'unit', { unique: false });
        store.createIndex('by_subject_unit', ['subject', 'unit'], { unique: false });
        store.createIndex('by_downloaded_at', 'downloadedAt', { unique: false });
      }

      // 2. Units store
      if (!db.objectStoreNames.contains(STORE_UNITS)) {
        const store = db.createObjectStore(STORE_UNITS, { keyPath: 'unitKey' });
        store.createIndex('by_subject', 'subject', { unique: false });
      }

      // 3. Download queue store
      if (!db.objectStoreNames.contains(STORE_DOWNLOAD_QUEUE)) {
        const store = db.createObjectStore(STORE_DOWNLOAD_QUEUE, { keyPath: 'taskId' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_created_at', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

export async function saveLocalLesson(record: LocalLessonRecord): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_LESSONS, STORE_UNITS], 'readwrite');
    const lessonStore = tx.objectStore(STORE_LESSONS);
    const unitStore = tx.objectStore(STORE_UNITS);

    lessonStore.put(record);

    // Update unit statistics
    const uKey = buildUnitKey(record.subject, record.unit);
    const unitReq = unitStore.get(uKey);
    unitReq.onsuccess = () => {
      const existing = unitReq.result as LocalUnitRecord | undefined;
      const unitRecord: LocalUnitRecord = existing || {
        unitKey: uKey,
        subject: record.subject,
        unit: cleanUnitCode(record.unit),
        title: `الوحدة ${cleanUnitCode(record.unit)}`,
        totalLessons: 0,
        downloadedLessons: 0,
        updatedAt: Date.now(),
      };
      unitRecord.updatedAt = Date.now();
      unitStore.put(unitRecord);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalLesson(
  subject: string,
  unit: string,
  lesson: string,
  classroomId: string,
): Promise<LocalLessonRecord | null> {
  const db = await openLocalDB();
  const key = buildLessonKey(subject, unit, lesson, classroomId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, 'readonly');
    const store = tx.objectStore(STORE_LESSONS);
    const req = store.get(key);

    req.onsuccess = () => resolve((req.result as LocalLessonRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listLocalLessons(subject?: string, unit?: string): Promise<LocalLessonRecord[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, 'readonly');
    const store = tx.objectStore(STORE_LESSONS);

    let req: IDBRequest;
    if (subject && unit) {
      const idx = store.index('by_subject_unit');
      req = idx.getAll(IDBKeyRange.only([subject.trim().toLowerCase(), cleanUnitCode(unit).toLowerCase()]));
    } else if (subject) {
      const idx = store.index('by_subject');
      req = idx.getAll(IDBKeyRange.only(subject.trim().toLowerCase()));
    } else {
      req = store.getAll();
    }

    req.onsuccess = () => resolve((req.result as LocalLessonRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalLesson(
  subject: string,
  unit: string,
  lesson: string,
  classroomId: string,
): Promise<void> {
  const db = await openLocalDB();
  const key = buildLessonKey(subject, unit, lesson, classroomId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, 'readwrite');
    const store = tx.objectStore(STORE_LESSONS);
    store.delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveLocalUnit(record: LocalUnitRecord): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_UNITS, 'readwrite');
    const store = tx.objectStore(STORE_UNITS);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLocalUnit(subject: string, unit: string): Promise<LocalUnitRecord | null> {
  const db = await openLocalDB();
  const key = buildUnitKey(subject, unit);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_UNITS, 'readonly');
    const store = tx.objectStore(STORE_UNITS);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as LocalUnitRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listLocalUnits(subject?: string): Promise<LocalUnitRecord[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_UNITS, 'readonly');
    const store = tx.objectStore(STORE_UNITS);

    const req = subject
      ? store.index('by_subject').getAll(IDBKeyRange.only(subject.trim().toLowerCase()))
      : store.getAll();

    req.onsuccess = () => resolve((req.result as LocalUnitRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalUnit(subject: string, unit: string): Promise<void> {
  const lessons = await listLocalLessons(subject, unit);
  for (const l of lessons) {
    await deleteLocalLesson(l.subject, l.unit, l.lesson, l.classroomId);
  }

  const db = await openLocalDB();
  const uKey = buildUnitKey(subject, unit);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_UNITS, 'readwrite');
    const store = tx.objectStore(STORE_UNITS);
    store.delete(uKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveDownloadTask(task: DownloadTaskRecord): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_DOWNLOAD_QUEUE);
    store.put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getDownloadTask(taskId: string): Promise<DownloadTaskRecord | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_DOWNLOAD_QUEUE);
    const req = store.get(taskId);
    req.onsuccess = () => resolve((req.result as DownloadTaskRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listDownloadTasks(): Promise<DownloadTaskRecord[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_QUEUE, 'readonly');
    const store = tx.objectStore(STORE_DOWNLOAD_QUEUE);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as DownloadTaskRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDownloadTask(taskId: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOWNLOAD_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_DOWNLOAD_QUEUE);
    store.delete(taskId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getStorageStats(): Promise<{ usedBytes: number; quotaBytes: number; isPersisted: boolean }> {
  if (typeof navigator !== 'undefined' && navigator.storage) {
    const estimate = await navigator.storage.estimate().catch(() => ({ usage: 0, quota: 0 }));
    const isPersisted = navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    return {
      usedBytes: estimate.usage || 0,
      quotaBytes: estimate.quota || 0,
      isPersisted,
    };
  }
  return { usedBytes: 0, quotaBytes: 0, isPersisted: false };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
