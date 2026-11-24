import type { ClassroomData, Action } from '@openmaic/viewer';
import { cleanUnitCode, cleanLessonCode } from '../utils';

export const MEDIA_CACHE_NAME = 'courseviewer-media-v1';

export function normalizeMediaKey(key: string): string {
  const trimmed = (key || '').trim().split('?')[0];
  return trimmed.replace(/^\/+/, '');
}

export async function openMediaCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(MEDIA_CACHE_NAME);
  } catch (err) {
    console.warn('CacheStorage not accessible:', err);
    return null;
  }
}

export async function storeMediaBlob(urlOrKey: string, blob: Blob, mimeType?: string): Promise<void> {
  const cache = await openMediaCache();
  if (!cache) return;

  const cleanKey = normalizeMediaKey(urlOrKey);
  const cacheUrl = `https://local-media.courseviewer.internal/${cleanKey}`;
  const contentType = mimeType || blob.type || 'application/octet-stream';

  const response = new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(blob.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-CourseViewer-Cached': 'true',
    },
  });

  await cache.put(cacheUrl, response);
}

export async function getMediaBlob(urlOrKey: string): Promise<Blob | null> {
  const cache = await openMediaCache();
  if (!cache) return null;

  const cleanKey = normalizeMediaKey(urlOrKey);
  const cacheUrl = `https://local-media.courseviewer.internal/${cleanKey}`;

  const response = await cache.match(cacheUrl);
  if (response && response.ok) {
    return await response.blob();
  }

  // Also check if stored by plain basename
  const basename = cleanKey.split('/').pop();
  if (basename && basename !== cleanKey) {
    const baseMatch = await cache.match(`https://local-media.courseviewer.internal/${basename}`);
    if (baseMatch && baseMatch.ok) {
      return await baseMatch.blob();
    }
  }

  return null;
}

export async function getMediaObjectUrl(urlOrKey: string): Promise<string | null> {
  const blob = await getMediaBlob(urlOrKey);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deleteLessonMedia(mediaKeys: string[]): Promise<void> {
  const cache = await openMediaCache();
  if (!cache) return;

  for (const k of mediaKeys) {
    const cleanKey = normalizeMediaKey(k);
    await cache.delete(`https://local-media.courseviewer.internal/${cleanKey}`);
    const basename = cleanKey.split('/').pop();
    if (basename && basename !== cleanKey) {
      await cache.delete(`https://local-media.courseviewer.internal/${basename}`);
    }
  }
}

/**
 * Traverses ClassroomData, matches any referenced visual/audio media in CacheStorage,
 * and rewrites the URLs into in-memory object URLs for immediate offline playback.
 */
export async function hydrateClassroomDataFromCache(
  classroomData: ClassroomData,
  classroomId: string,
): Promise<{ data: ClassroomData; activeObjectUrls: string[] }> {
  if (!classroomData || typeof classroomData !== 'object') {
    return { data: classroomData, activeObjectUrls: [] };
  }

  const clone: ClassroomData = JSON.parse(JSON.stringify(classroomData));
  const activeObjectUrls: string[] = [];

  const resolveOfflineSrc = async (rawSrc?: string): Promise<string | undefined> => {
    if (!rawSrc) return undefined;
    const trimmed = String(rawSrc).trim();
    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;

    // Search keys:
    // 1. Raw string cleaned
    // 2. filename basename
    // 3. /classroom-media/${classroomId}/media/${filename}
    const clean = trimmed.split('?')[0].replace(/^\/+/, '');
    const filename = clean.split('/').pop() || clean;

    const candidates = [
      clean,
      filename,
      `classroom-media/${classroomId}/media/${filename}`,
      `media/${filename}`,
    ];

    for (const key of candidates) {
      const objUrl = await getMediaObjectUrl(key);
      if (objUrl) {
        activeObjectUrls.push(objUrl);
        return objUrl;
      }
    }

    return rawSrc;
  };

  if (Array.isArray(clone.scenes)) {
    for (const sc of clone.scenes as any[]) {
      // 1. Canvas images & videos
      const elements = sc?.content?.canvas?.elements;
      if (Array.isArray(elements)) {
        for (const el of elements) {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            const localUrl = await resolveOfflineSrc(el.src);
            if (localUrl) el.src = localUrl;
          }
        }
      }

      // 2. Action audio and visualUrl
      if (Array.isArray(sc.actions)) {
        for (const act of sc.actions) {
          if (act.visualUrl) {
            const localVis = await resolveOfflineSrc(act.visualUrl);
            if (localVis) act.visualUrl = localVis;
          }

          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl || act.url) {
            const rawAudio = act.audioUrl || act.url || act.audioRef;
            if (rawAudio) {
              const localAudio = await resolveOfflineSrc(rawAudio);
              if (localAudio) {
                act.audioUrl = localAudio;
                act.url = localAudio;
              }
            }
          }
        }
      }
    }
  }

  return { data: clone, activeObjectUrls };
}

export function revokeObjectUrls(urls: string[]): void {
  if (typeof URL === 'undefined' || !Array.isArray(urls)) return;
  for (const u of urls) {
    if (u && typeof u === 'string' && u.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    }
  }
}

/**
 * Builds the canonical 900px WebP storage key for textbook page scans.
 * Strictly 900px to conserve bandwidth and device storage while retaining retina clarity.
 */
export function buildPageImageKey(subject: string, unit: string, lesson: string, pageNum: number): string {
  const s = (subject || '').trim().toLowerCase();
  const u = cleanUnitCode(unit).toLowerCase();
  const l = cleanLessonCode(lesson).toLowerCase();
  return `pages/${s}/${u}/${l}/page-${pageNum}-w900.webp`;
}

export async function storePageImageBlob(
  subject: string,
  unit: string,
  lesson: string,
  pageNum: number,
  blob: Blob,
): Promise<void> {
  const key = buildPageImageKey(subject, unit, lesson, pageNum);
  await storeMediaBlob(key, blob, 'image/webp');

  // Also store under candidate fallback key
  const altKey = `page-${pageNum}-w900.webp`;
  await storeMediaBlob(altKey, blob, 'image/webp');
}

export async function getPageImageBlob(
  subject: string,
  unit: string,
  lesson: string,
  pageNum: number,
): Promise<Blob | null> {
  const key = buildPageImageKey(subject, unit, lesson, pageNum);
  const blob = await getMediaBlob(key);
  if (blob) return blob;

  // Try candidate fallback key
  const altKey = `page-${pageNum}-w900.webp`;
  return await getMediaBlob(altKey);
}

export async function getPageImageObjectUrl(
  subject: string,
  unit: string,
  lesson: string,
  pageNum: number,
): Promise<string | null> {
  const blob = await getPageImageBlob(subject, unit, lesson, pageNum);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function checkPagesRangeCached(
  subject: string,
  unit: string,
  lesson: string,
  startPage: number,
  endPage: number,
): Promise<{ cachedPages: number[]; totalPages: number; isFullyCached: boolean }> {
  const cachedPages: number[] = [];
  const start = Math.min(startPage, endPage);
  const end = Math.max(startPage, endPage);
  const totalPages = end - start + 1;

  for (let p = start; p <= end; p++) {
    const key = buildPageImageKey(subject, unit, lesson, p);
    const blob = await getMediaBlob(key);
    if (blob && blob.size > 0) {
      cachedPages.push(p);
    }
  }

  return {
    cachedPages,
    totalPages,
    isFullyCached: totalPages > 0 && cachedPages.length === totalPages,
  };
}

export async function deletePagesRange(
  subject: string,
  unit: string,
  lesson: string,
  startPage: number,
  endPage: number,
): Promise<void> {
  const keysToDelete: string[] = [];
  const start = Math.min(startPage, endPage);
  const end = Math.max(startPage, endPage);

  for (let p = start; p <= end; p++) {
    keysToDelete.push(buildPageImageKey(subject, unit, lesson, p));
    keysToDelete.push(`page-${p}-w900.webp`);
  }

  await deleteLessonMedia(keysToDelete);
}
