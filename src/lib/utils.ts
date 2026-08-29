import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Public R2 Buckets (Images & Scans)
export const PUBLIC_R2_IMAGES = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev';

// Private R2 Proxy (Courses HTML, Classrooms & TTS Voice Audio)
export const PRIVATE_COURSES_PROXY = '/api/courses';
export const R2_COURSES_BASE = 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev';

// Subject to folder mapping
export const COURSE_FOLDERS: Record<string, string> = {
  adb10p1: 'adab10', adb11p1: 'adab11', adb12p1: 'adab12p1', ar7p1: 'ara7p1', ar7p2: 'ar7p2',
  ar8p1: 'ar8p1', ar8p2: 'ara8p2', ar9p2: 'ar9p2', bio10p1: 'bioearth10', bio11p1: 'bioearth11',
  bio12p1: 'bioearth12', chm10p1: 'chem10', chm11p1: 'chem11', chm12p1: 'chem12', fkh10p1: 'fiqh10',
  fkh12p1: 'fiqh12p1', geo10p1: 'geo10', geo7p1: 'geo7', geo8p1: 'geo8', geo9p1: 'geo9p1',
  hdth10p1: 'hadith10', hdth11p1: 'hadith11', hdth12p1: 'hadith12p1', hst7p1: 'hist7p1',
  hst7p2: 'hist7p2', hst8p1: 'hist8p1', hst8p2: 'hist8p2', hst9p1: 'hist9p1', hst9p2: 'hist9p2',
  iman10p1: 'iman10p1', iman11p1: 'iman11', iman12p1: 'iman12p1', islm7p2: 'islamic7p2',
  islm8p1: 'islamic8p1', islm8p2: 'islamic8p2', islm9p1: 'islamic9p1', math10p1: 'math10p1',
  math10p2: 'math10p2', math11p1: 'math11p1', math11p2: 'math11p2', math12p1: 'math12',
  math8p1: 'math8p1', math8p2: 'math8p2', math9p1: 'math9p1', ne8p1: 'ne8p1', ne9p1: 'ne9p1',
  nhw10p1: 'nahw10p1', nhw10p2: 'nahw10p2', nhw11p1: 'nahw11p1', nhw11p2: 'nahw11p2',
  phy10p1: 'phy10', phy11p1: 'phy11', phy12p1: 'phy12', qrn10p1: 'quran10p1', qrn11p1: 'quran11p1',
  qrn12p1: 'quran12p1', qrn8p1: 'quran8p1', qrn9p1: 'quran9p1', rd10p1: 'read10p1',
  rd10p2: 'read10p2', rd11p1: 'read11p1', rd11p2: 'read11p2', sci7p2: 'sci7p2', sci8p1: 'sci8p1',
  sci8p2: 'sci8p2', sci9p1: 'sci9p1', sci9p2: 'sci9p2', sra10p1: 'sira10', sra11p1: 'sira11',
  sra11p2: 'sira11p2', sra12p1: 'sira12p1', ysoc10p1: 'soc10p1',
};

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
    `/pages/${s}/${u}/${l}/page-${pageNum}-w${width}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${pageNum}-w${width}.webp`,
    `/pages/${s}/${u}/${l}/page-${relPage}-w${width}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${relPage}-w${width}.webp`,
    `/pages/${s}/${u}/${l}/page-${pageNum}.webp`,
    `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/page-${pageNum}.webp`,
    `/pages/${s}/${u}/${l}/page-${relPage}.webp`,
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
  const folder = COURSE_FOLDERS[s] || s;
  return `${PRIVATE_COURSES_PROXY}/${folder}/${folder}_${u}${l}.html`;
}

/**
 * Generate fallback candidate URLs for HTML lesson discovery
 */
export function generatePrivateHtmlCandidates(
  subjectCode: string,
  unitCode: string,
  lessonCode: string,
  customHtmlPath?: string,
  htmlFolder?: string
): string[] {
  const candidates: string[] = [];

  if (customHtmlPath) {
    const cleanPath = customHtmlPath.replace(/^\/+/, '');
    candidates.push(`${PRIVATE_COURSES_PROXY}/${cleanPath}`);
    candidates.push(`http://localhost:5173/api/html/${cleanPath}`);
    candidates.push(`/api/html/${cleanPath}`);
    candidates.push(`${R2_COURSES_BASE}/${cleanPath}`);
  }

  const s = subjectCode || 'subject';
  const u = cleanUnitCode(unitCode);
  const l = cleanLessonCode(lessonCode);
  const folder = htmlFolder || COURSE_FOLDERS[s] || s;

  // 1. Local Dev Server APIs (via port 5173 & relative)
  candidates.push(`http://localhost:5173/api/html-by-id?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);
  candidates.push(`http://localhost:5173/api/html/${folder}/${folder}_${u}${l}.html`);
  candidates.push(`http://localhost:5173/api/content-html?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);
  candidates.push(`http://localhost:5173/api/lesson-html?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);

  candidates.push(`/api/html-by-id?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);
  candidates.push(`/api/html/${folder}/${folder}_${u}${l}.html`);
  candidates.push(`/api/content-html?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);
  candidates.push(`/api/lesson-html?subject=${encodeURIComponent(s)}&unit=${encodeURIComponent(u)}&lesson=${encodeURIComponent(l)}`);

  // 2. Private Courses Proxy
  candidates.push(`${PRIVATE_COURSES_PROXY}/${folder}/${folder}_${u}${l}.html`);
  candidates.push(`${PRIVATE_COURSES_PROXY}/${s}/${s}_${u}${l}.html`);
  candidates.push(`${PRIVATE_COURSES_PROXY}/${folder}/${folder}${u}${l}.html`);
  candidates.push(`${PRIVATE_COURSES_PROXY}/${folder}/${u}${l}.html`);

  // 3. Public R2 Courses Base
  candidates.push(`${R2_COURSES_BASE}/${folder}/${folder}_${u}${l}.html`);
  candidates.push(`${R2_COURSES_BASE}/${s}/${s}_${u}${l}.html`);

  return [...new Set(candidates)];
}
