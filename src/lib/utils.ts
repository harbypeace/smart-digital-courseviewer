import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Public R2 Buckets (Images & Scans)
export const PUBLIC_R2_IMAGES = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev';

// Private R2 Proxy (Courses HTML, Classrooms & TTS Voice Audio)
export const PRIVATE_COURSES_PROXY = '/api/courses';

/**
 * Clean unit and lesson codes to standard short form (e.g. u1, l1).
 */
export function cleanUnitCode(unitCode?: string): string {
  if (!unitCode) return 'u1';
  const match = unitCode.match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : unitCode.replace(/.*_/, '');
}

export function cleanLessonCode(lessonCode?: string): string {
  if (!lessonCode) return 'l1';
  const match = lessonCode.match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : lessonCode.replace(/.*_/, '');
}

/**
 * Generate primary URL for page images ({subject}/{unit}/{lesson}/page-{N}-w{width}.webp)
 */
export function generatePageImageUrl(
  subjectCode: string,
  unitCode: string,
  lessonCode: string,
  pageNum: number,
  width: 600 | 900 | 1200 = 900
): string {
  const s = subjectCode || 'subject';
  const u = cleanUnitCode(unitCode);
  const l = cleanLessonCode(lessonCode);
  return `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${pageNum}-w${width}.webp`;
}

/**
 * Generate fallback URLs for page images in case of offset or relative indexing
 */
export function generatePageImageCandidates(
  subjectCode: string,
  unitCode: string,
  lessonCode: string,
  pageNum: number,
  startPage: number,
  width: 600 | 900 | 1200 = 900
): string[] {
  const s = subjectCode || 'subject';
  const u = cleanUnitCode(unitCode);
  const l = cleanLessonCode(lessonCode);
  const relPage = Math.max(1, (pageNum - startPage) + 1);

  const candidates = [
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${pageNum}-w${width}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${relPage}-w${width}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${pageNum}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${relPage}.webp`,
  ];

  return [...new Set(candidates)];
}

/**
 * Generate URL for general images / thumbnails (Public CDN)
 */
export function generateThumbnailUrl(subjectCode: string): string {
  return `${PUBLIC_R2_IMAGES}/thumbnails/${subjectCode}.webp`;
}

/**
 * Generate URL for Private HTML Lessons (Through secure Pages API proxy)
 */
export function generatePrivateHtmlUrl(
  subjectCode: string,
  unitCode: string,
  lessonCode: string,
  customHtmlPath?: string
): string {
  if (customHtmlPath) {
    const cleanPath = customHtmlPath.replace(/^\/+/, '');
    return `${PRIVATE_COURSES_PROXY}/${cleanPath}`;
  }
  const s = subjectCode || 'subject';
  const u = cleanUnitCode(unitCode);
  const l = cleanLessonCode(lessonCode);
  return `${PRIVATE_COURSES_PROXY}/${s}/${s}_${u}${l}.html`;
}

/**
 * Generate fallback candidate URLs for HTML lesson discovery
 */
export function generatePrivateHtmlCandidates(
  subjectCode: string,
  unitCode: string,
  lessonCode: string,
  customHtmlPath?: string
): string[] {
  if (customHtmlPath) {
    const cleanPath = customHtmlPath.replace(/^\/+/, '');
    return [`${PRIVATE_COURSES_PROXY}/${cleanPath}`];
  }
  const s = subjectCode || 'subject';
  const u = cleanUnitCode(unitCode);
  const l = cleanLessonCode(lessonCode);
  return [
    `${PRIVATE_COURSES_PROXY}/${s}/${s}_${u}${l}.html`,
    `${PRIVATE_COURSES_PROXY}/${s}/${s}${u}${l}.html`,
    `${PRIVATE_COURSES_PROXY}/${s}/${u}${l}.html`,
    `${PRIVATE_COURSES_PROXY}/${s}/index.html`,
  ];
}

