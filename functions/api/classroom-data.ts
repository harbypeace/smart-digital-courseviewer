/**
 * Cloudflare Pages Function — Classroom Data Resolver
 * Resolves classroom scenes and normalizes audio TTS paths to the secure proxy.
 */

import { authorizeRequest, type AuthEnv } from '../lib/auth';

interface Env extends AuthEnv {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
  ALLOW_PUBLIC_R2_FALLBACK?: string;
}

const PUBLIC_R2_COURSES = 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev';

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

function isEnabled(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

function safePart(value: string, fallback = ''): string {
  const candidate = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : fallback;
}

async function fetchCoursesJson(env: Env, key: string): Promise<any | null> {
  const cleanKey = key.replace(/^\/+/, '');

  if (env.COURSES) {
    try {
      const obj = await env.COURSES.get(cleanKey);
      if (obj) {
        return await obj.json();
      }
    } catch (_e) {}
  }

  if (isEnabled(env.ALLOW_PUBLIC_R2_FALLBACK)) {
    try {
      const publicUrl = `${PUBLIC_R2_COURSES}/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
      const pubRes = await fetch(publicUrl, { method: 'GET' });
      if (pubRes.ok) {
        return await pubRes.json();
      }
    } catch (_e) {}
  }

  return null;
}

/**
 * Normalizes a scene media URL to the live OpenMAIC media host over HTTPS.
 * The courses bucket is now private, so scene images/videos must be served
 * directly from the still-public open.maic.chat media CDN.
 */
function normalizeMediaSrc(src: string | undefined, classroomId: string): string | undefined {
  if (!src) return src;
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (/^https:\/\//i.test(src)) return src;
  if (/^http:\/\//i.test(src)) return src.replace(/^http:/, 'https:');
  const clean = src.replace(/^\/+/, '');
  const name = clean.split('/').pop() || clean;
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(name);
  const filename = hasExt ? name : `${name}.jpeg`;
  return `https://open.maic.chat/api/classroom-media/${classroomId}/media/${filename}`;
}

function normalizeClassroomAudio(data: any, subject: string, unit: string, lesson: string, classroomId: string): any {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data));
  const u = cleanUnitCode(unit);
  const l = cleanLessonCode(lesson);
  const cId = classroomId || clone.id || 'classroom';
  const baseTts = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/tts`;

  if (Array.isArray(clone.scenes)) {
    clone.scenes.forEach((sc: any, scIdx: number) => {
      const canvasElements = sc?.content?.canvas?.elements;
      if (Array.isArray(canvasElements)) {
        canvasElements.forEach((el: any) => {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            el.src = normalizeMediaSrc(el.src, cId);
          }
        });
      }
      if (Array.isArray(sc.actions)) {
        let speechIdx = 0;
        sc.actions.forEach((act: any) => {
          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl) {
            const padScene = String(scIdx).padStart(2, '0');
            const padSpeech = String(speechIdx).padStart(2, '0');
            const audioName = `scene_${padScene}_speech_${padSpeech}.mp3`;
            act.audioUrl = `${baseTts}/${audioName}`;
            speechIdx++;
          }
        });
      }
    });
  }

  return clone;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  let subject = safePart(url.searchParams.get('subject') || '');
  let unit = safePart(cleanUnitCode(url.searchParams.get('unit') || 'u1'), 'u1');
  let lesson = safePart(cleanLessonCode(url.searchParams.get('lesson') || 'l1'), 'l1');
  let classroomId = safePart(url.searchParams.get('id') || url.searchParams.get('classroomId') || '');

  if (request.method === 'POST') {
    try {
      const body = await request.json() as any;
      if (body.subject) subject = safePart(String(body.subject));
      if (body.unit) unit = safePart(cleanUnitCode(String(body.unit)), 'u1');
      if (body.lesson) lesson = safePart(cleanLessonCode(String(body.lesson)), 'l1');
      if (body.id || body.classroomId) classroomId = safePart(String(body.id || body.classroomId));
    } catch (_e) {}
  }

  const auth = await authorizeRequest(request, env, subject);
  if (auth.response) return auth.response;

  if (!classroomId && !subject) {
    return new Response(JSON.stringify({ error: 'Missing subject or classroomId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const candidateKeys = [
    `classrooms/${subject}/${unit}/${lesson}/${classroomId}/classdata.json`,
    `classrooms/${subject}/${unit}/${lesson}/${classroomId}/${subject}_${unit}_${lesson}_${classroomId}_classdata.json`,
    `classrooms/${subject}/${unit}/${lesson}/${classroomId}/${subject}_${unit}_${lesson}_${classroomId}.json`,
    `classrooms/${subject}/${unit}/${lesson}/${classroomId}/speechtext.json`,
    `classrooms/${subject}/${unit}/${lesson}/${classroomId}/export.json`,
    `classrooms/${classroomId}/classdata.json`,
    `classrooms/${classroomId}/classroom.json`,
    `classrooms/${classroomId}/manifest.json`,
  ];

  for (const key of candidateKeys) {
    const data = await fetchCoursesJson(env, key);
    if (data) {
      const normalized = normalizeClassroomAudio(data, subject, unit, lesson, classroomId);
      return new Response(JSON.stringify({ status: 'ok', key, data: normalized }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Classroom not found in private bucket', candidates: candidateKeys }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
};
