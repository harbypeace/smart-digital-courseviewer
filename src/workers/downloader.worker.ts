/**
 * Web Worker for downloading, extracting, and persisting classroom lessons offline.
 * Runs in background thread without blocking UI or audio playback.
 */

import JSZip from 'jszip';

interface DownloadPayload {
  taskId: string;
  subject: string;
  unit: string;
  lesson: string;
  classroomId: string;
  title: string;
  zipUrl?: string;
  jsonUrl?: string;
}

const MEDIA_CACHE_NAME = 'courseviewer-media-v1';
const DB_NAME = 'CourseViewerLocalDB';
const DB_VERSION = 1;
const STORE_LESSONS = 'lessons';
const STORE_UNITS = 'units';
const STORE_DOWNLOAD_QUEUE = 'download_queue';

function cleanUnitCode(unit?: string): string {
  if (!unit) return 'u1';
  const match = unit.match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : unit.replace(/.*_/, '');
}

function cleanLessonCode(lesson?: string): string {
  if (!lesson) return 'l1';
  const match = lesson.match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : lesson.replace(/.*_/, '');
}

function buildLessonKey(subject: string, unit: string, lesson: string, classroomId: string): string {
  return `${subject.trim().toLowerCase()}/${cleanUnitCode(unit).toLowerCase()}/${cleanLessonCode(lesson).toLowerCase()}/${classroomId.trim()}`;
}

function buildUnitKey(subject: string, unit: string): string {
  return `${subject.trim().toLowerCase()}/${cleanUnitCode(unit).toLowerCase()}`;
}

async function openWorkerDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_LESSONS)) {
        const store = db.createObjectStore(STORE_LESSONS, { keyPath: 'lessonKey' });
        store.createIndex('by_subject', 'subject', { unique: false });
        store.createIndex('by_unit', 'unit', { unique: false });
        store.createIndex('by_subject_unit', ['subject', 'unit'], { unique: false });
        store.createIndex('by_downloaded_at', 'downloadedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_UNITS)) {
        const store = db.createObjectStore(STORE_UNITS, { keyPath: 'unitKey' });
        store.createIndex('by_subject', 'subject', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DOWNLOAD_QUEUE)) {
        const store = db.createObjectStore(STORE_DOWNLOAD_QUEUE, { keyPath: 'taskId' });
        store.createIndex('by_status', 'status', { unique: false });
        store.createIndex('by_created_at', 'createdAt', { unique: false });
      }
    };
  });
}

const activeAbortControllers = new Map<string, AbortController>();

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'START_DOWNLOAD': {
      await handleDownload(payload as DownloadPayload);
      break;
    }
    case 'CANCEL_DOWNLOAD': {
      const { taskId } = payload || {};
      if (taskId && activeAbortControllers.has(taskId)) {
        activeAbortControllers.get(taskId)?.abort();
        activeAbortControllers.delete(taskId);
        self.postMessage({ type: 'CANCELLED', taskId });
      }
      break;
    }
    default:
      break;
  }
});

async function handleDownload(payload: DownloadPayload) {
  const { taskId, subject, unit, lesson, classroomId, title, zipUrl, jsonUrl } = payload;
  const abortController = new AbortController();
  activeAbortControllers.set(taskId, abortController);

  const sendProgress = (progress: number, downloadedBytes: number, totalBytes: number) => {
    self.postMessage({
      type: 'PROGRESS',
      taskId,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      downloadedBytes,
      totalBytes,
    });
  };

  try {
    sendProgress(5, 0, 0);

    const u = cleanUnitCode(unit);
    const l = cleanLessonCode(lesson);
    const cId = classroomId;

    // 1. Resolve source URL
    let downloadUrl = zipUrl;
    if (!downloadUrl && !jsonUrl) {
      downloadUrl = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/classroom.zip`;
    }

    const targetUrl = downloadUrl || jsonUrl || '';
    if (!targetUrl) throw new Error('No valid download URL available');

    const res = await fetch(targetUrl, { signal: abortController.signal });
    if (!res.ok) {
      // Try fallback URL if default failed
      if (downloadUrl && downloadUrl.endsWith('.zip')) {
        const altUrl = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/${cId}.maic.zip`;
        const altRes = await fetch(altUrl, { signal: abortController.signal });
        if (altRes.ok) {
          await processZipResponse(altRes, payload, abortController.signal, sendProgress);
          return;
        }
      }
      throw new Error(`Download failed with HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('json') || targetUrl.endsWith('.json')) {
      await processJsonResponse(res, payload, sendProgress);
    } else {
      await processZipResponse(res, payload, abortController.signal, sendProgress);
    }
  } catch (err: any) {
    if (abortController.signal.aborted) {
      self.postMessage({ type: 'CANCELLED', taskId });
    } else {
      console.error('Worker download error:', err);
      self.postMessage({ type: 'ERROR', taskId, error: err?.message || 'Download failed' });
    }
  } finally {
    activeAbortControllers.delete(taskId);
  }
}

async function processZipResponse(
  res: Response,
  payload: DownloadPayload,
  signal: AbortSignal,
  sendProgress: (p: number, d: number, t: number) => void,
) {
  const { taskId, subject, unit, lesson, classroomId, title } = payload;
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body?.getReader();

  if (!reader) throw new Error('ReadableStream not supported on download response');

  let receivedBytes = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    if (signal.aborted) throw new Error('Download aborted by user');
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      receivedBytes += value.length;
      if (contentLength > 0) {
        // 0 to 60% is download
        const p = 5 + (receivedBytes / contentLength) * 55;
        sendProgress(p, receivedBytes, contentLength);
      }
    }
  }

  sendProgress(65, receivedBytes, receivedBytes);

  // Concatenate chunks into single ArrayBuffer
  const fullArray = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    fullArray.set(chunk, offset);
    offset += chunk.length;
  }

  // Decompress ZIP using JSZip
  sendProgress(70, receivedBytes, receivedBytes);
  const zip = await JSZip.loadAsync(fullArray.buffer);

  // Extract manifest/classroom JSON
  const manifestFile = zip.file(/(?:^|\/)manifest\.json$/i)[0] ||
    zip.file(/(?:^|\/)classroom\.json$/i)[0] ||
    zip.file(/(?:^|\/)classdata\.json$/i)[0];

  if (!manifestFile) {
    throw new Error('ZIP package is missing manifest.json / classroom.json');
  }

  const manifestText = await manifestFile.async('string');
  const parsedData = JSON.parse(manifestText);

  // Open CacheStorage for media assets
  sendProgress(80, receivedBytes, receivedBytes);
  const mediaCache = typeof caches !== 'undefined' ? await caches.open(MEDIA_CACHE_NAME) : null;
  const storedMediaKeys: string[] = [];

  const mediaRegex = /\.(png|jpg|jpeg|gif|webp|svg|mp4|webm|mp3|wav|ogg|m4a|aac)$/i;
  const mediaFiles = zip.file(mediaRegex);

  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    const blob = await file.async('blob');
    const cleanName = file.name.replace(/^\/+/, '');
    const basename = cleanName.split('/').pop() || cleanName;

    if (mediaCache) {
      const resp = new Response(blob, {
        headers: {
          'Content-Type': blob.type || 'application/octet-stream',
          'Content-Length': String(blob.size),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });

      // Save under canonical keys
      const keyCandidates = [
        `classroom-media/${classroomId}/media/${basename}`,
        basename,
        cleanName,
      ];

      for (const k of keyCandidates) {
        await mediaCache.put(`https://local-media.courseviewer.internal/${k}`, resp.clone());
        storedMediaKeys.push(k);
      }
    }

    const p = 80 + Math.round((i / mediaFiles.length) * 15);
    sendProgress(p, receivedBytes, receivedBytes);
  }

  // Save to IndexedDB
  sendProgress(95, receivedBytes, receivedBytes);
  const db = await openWorkerDB();
  const lessonKey = buildLessonKey(subject, unit, lesson, classroomId);
  const unitKey = buildUnitKey(subject, unit);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_LESSONS, STORE_UNITS, STORE_DOWNLOAD_QUEUE], 'readwrite');
    const lessonStore = tx.objectStore(STORE_LESSONS);
    const unitStore = tx.objectStore(STORE_UNITS);
    const queueStore = tx.objectStore(STORE_DOWNLOAD_QUEUE);

    const lessonRecord = {
      lessonKey,
      subject: subject.trim().toLowerCase(),
      unit: cleanUnitCode(unit).toLowerCase(),
      lesson: cleanLessonCode(lesson).toLowerCase(),
      classroomId,
      title: title || parsedData.stage?.name || parsedData.title || `درس ${cleanLessonCode(lesson)}`,
      scenesCount: Array.isArray(parsedData.scenes) ? parsedData.scenes.length : 0,
      sizeBytes: receivedBytes,
      classroomData: parsedData,
      downloadedAt: Date.now(),
      mediaFiles: storedMediaKeys,
      isComplete: true,
    };
    lessonStore.put(lessonRecord);

    // Update unit
    const uReq = unitStore.get(unitKey);
    uReq.onsuccess = () => {
      const existing = uReq.result;
      const uRec = existing || {
        unitKey,
        subject: subject.trim().toLowerCase(),
        unit: cleanUnitCode(unit).toLowerCase(),
        title: `الوحدة ${cleanUnitCode(unit)}`,
        totalLessons: 0,
        downloadedLessons: 0,
        updatedAt: Date.now(),
      };
      uRec.updatedAt = Date.now();
      unitStore.put(uRec);
    };

    // Update download queue record
    queueStore.put({
      taskId,
      subject,
      unit,
      lesson,
      classroomId,
      title,
      status: 'completed',
      progress: 100,
      downloadedBytes: receivedBytes,
      totalBytes: receivedBytes,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  sendProgress(100, receivedBytes, receivedBytes);
  self.postMessage({ type: 'COMPLETED', taskId, lessonKey });
}

async function processJsonResponse(
  res: Response,
  payload: DownloadPayload,
  sendProgress: (p: number, d: number, t: number) => void,
) {
  const { taskId, subject, unit, lesson, classroomId, title } = payload;
  sendProgress(50, 0, 0);

  const parsed = await res.json();
  const rawData = (parsed as any).data || parsed;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(rawData)).length;

  sendProgress(80, jsonBytes, jsonBytes);

  const db = await openWorkerDB();
  const lessonKey = buildLessonKey(subject, unit, lesson, classroomId);
  const unitKey = buildUnitKey(subject, unit);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_LESSONS, STORE_UNITS, STORE_DOWNLOAD_QUEUE], 'readwrite');
    const lessonStore = tx.objectStore(STORE_LESSONS);
    const unitStore = tx.objectStore(STORE_UNITS);
    const queueStore = tx.objectStore(STORE_DOWNLOAD_QUEUE);

    lessonStore.put({
      lessonKey,
      subject: subject.trim().toLowerCase(),
      unit: cleanUnitCode(unit).toLowerCase(),
      lesson: cleanLessonCode(lesson).toLowerCase(),
      classroomId,
      title: title || rawData.stage?.name || rawData.title || `درس ${cleanLessonCode(lesson)}`,
      scenesCount: Array.isArray(rawData.scenes) ? rawData.scenes.length : 0,
      sizeBytes: jsonBytes,
      classroomData: rawData,
      downloadedAt: Date.now(),
      mediaFiles: [],
      isComplete: true,
    });

    const uReq = unitStore.get(unitKey);
    uReq.onsuccess = () => {
      const existing = uReq.result;
      const uRec = existing || {
        unitKey,
        subject: subject.trim().toLowerCase(),
        unit: cleanUnitCode(unit).toLowerCase(),
        title: `الوحدة ${cleanUnitCode(unit)}`,
        totalLessons: 0,
        downloadedLessons: 0,
        updatedAt: Date.now(),
      };
      uRec.updatedAt = Date.now();
      unitStore.put(uRec);
    };

    queueStore.put({
      taskId,
      subject,
      unit,
      lesson,
      classroomId,
      title,
      status: 'completed',
      progress: 100,
      downloadedBytes: jsonBytes,
      totalBytes: jsonBytes,
      createdAt: Date.now(),
      completedAt: Date.now(),
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  sendProgress(100, jsonBytes, jsonBytes);
  self.postMessage({ type: 'COMPLETED', taskId, lessonKey });
}
