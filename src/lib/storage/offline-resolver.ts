import type { ClassroomData } from '@openmaic/viewer';
import { getLocalLesson, listLocalLessons, type LocalLessonRecord } from './classroom-db';
import { hydrateClassroomDataFromCache } from './media-cache';
import { cleanUnitCode, cleanLessonCode } from '../utils';

export interface LocalClassroomResolution {
  data: ClassroomData;
  record: LocalLessonRecord;
  objectUrls: string[];
}

/**
 * Checks if the requested classroom exists in client IndexedDB storage.
 * If found and complete, hydrates all media from CacheStorage with in-memory blob URLs.
 */
export async function checkLocalClassroom(
  subject?: string,
  unit?: string,
  lesson?: string,
  classroomId?: string,
): Promise<LocalClassroomResolution | null> {
  if (typeof indexedDB === 'undefined') return null;

  const s = (subject || '').trim();
  const u = cleanUnitCode(unit);
  const l = cleanLessonCode(lesson);
  const cId = (classroomId || '').trim();

  // Try direct lookup with exact parameters
  if (s && cId) {
    try {
      const record = await getLocalLesson(s, u, l, cId);
      if (record && record.isComplete && record.classroomData) {
        const { data, activeObjectUrls } = await hydrateClassroomDataFromCache(record.classroomData, cId);
        return { data, record, objectUrls: activeObjectUrls };
      }
    } catch (err) {
      console.warn('Error reading local classroom record:', err);
    }
  }

  // Fallback: If only classroomId is known, search indexed lessons
  if (cId) {
    try {
      const all = await listLocalLessons(s || undefined, u || undefined);
      const matched = all.find((r) => r.classroomId === cId || r.lessonKey.endsWith(`/${cId}`));
      if (matched && matched.isComplete && matched.classroomData) {
        const { data, activeObjectUrls } = await hydrateClassroomDataFromCache(matched.classroomData, cId);
        return { data, record: matched, objectUrls: activeObjectUrls };
      }
    } catch {}
  }

  return null;
}

/**
 * Quick non-hydrating check to see if a classroom is saved on device
 */
export async function isClassroomStoredLocally(
  subject?: string,
  unit?: string,
  lesson?: string,
  classroomId?: string,
): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  const s = (subject || '').trim();
  const u = cleanUnitCode(unit);
  const l = cleanLessonCode(lesson);
  const cId = (classroomId || '').trim();

  if (!s || !cId) return false;
  try {
    const record = await getLocalLesson(s, u, l, cId);
    return Boolean(record && record.isComplete);
  } catch {
    return false;
  }
}
