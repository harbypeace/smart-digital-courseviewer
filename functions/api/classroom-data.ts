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
 * Normalizes any classroom media asset (image / video).
 * - If external (http/https): keep it (upgrade http to https).
 * - If local in-memory (data: / blob:): keep it.
 * - If indicates local relative path: normalize to /classroom-media/${classroomId}/media/${filename}.
 */
function normalizeMediaSrc(src: string | undefined, classroomId: string): string | undefined {
  if (!src) return src;
  const trimmed = src.trim();
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }
  const clean = trimmed.split('?')[0].replace(/^\/+/, '');
  const name = clean.split('/').pop() || clean;
  const hasExt = /\.[a-zA-Z0-9]{2,5}$/.test(name);
  const filename = hasExt ? name : `${name}.jpeg`;
  return `/classroom-media/${classroomId}/media/${filename}`;
}

/**
 * Normalizes classroom assets (speech audio, canvas images/videos, action visuals).
 * - If audio or media is linked to external src (http/https): keeps it.
 * - If in-memory local object (data: / blob:): keeps it.
 * - When it indicates a local/relative path: normalizes to related bucket asset path.
 */
function normalizeClassroomAssets(data: any, subject: string, unit: string, lesson: string, classroomId: string): any {
  if (!data || typeof data !== 'object') return data;
  const clone = JSON.parse(JSON.stringify(data));
  const u = cleanUnitCode(unit);
  const l = cleanLessonCode(lesson);
  const cId = classroomId || clone.id || clone.stage?.id || 'classroom';
  const baseTts = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/tts`;
  const baseAudio = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/audio`;

  if (Array.isArray(clone.scenes)) {
    clone.scenes.forEach((sc: any, scIdx: number) => {
      // 1. Normalize canvas images & videos
      const canvasElements = sc?.content?.canvas?.elements;
      if (Array.isArray(canvasElements)) {
        canvasElements.forEach((el: any) => {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            el.src = normalizeMediaSrc(el.src, cId);
          }
        });
      }

      // 2. Normalize actions (visuals, speech audio)
      if (Array.isArray(sc.actions)) {
        let speechIdx = 0;
        sc.actions.forEach((act: any) => {
          if (act.visualUrl) {
            act.visualUrl = normalizeMediaSrc(act.visualUrl, cId);
          }

          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl || act.url) {
            const rawAudio = act.audioUrl || act.url || act.audioRef;

            if (rawAudio && typeof rawAudio === 'string' && (rawAudio.startsWith('blob:') || rawAudio.startsWith('data:'))) {
              // Local in-memory blob or data URL: keep as is
              act.audioUrl = rawAudio;
              act.url = rawAudio;
            } else if (rawAudio && typeof rawAudio === 'string' && (/^https?:\/\//i.test(rawAudio) || rawAudio.startsWith('//'))) {
              // External src: keep external source, ensuring https protocol
              act.audioUrl = rawAudio.replace(/^http:\/\//i, 'https://');
              act.url = act.audioUrl;
            } else {
              // Indicates local / relative path (e.g. audio/... or filename or audioId): normalize to bucket path
              let audioFilename = '';
              if (rawAudio && typeof rawAudio === 'string') {
                const clean = rawAudio.split('?')[0].trim();
                const name = clean.split('/').pop();
                if (name) {
                  audioFilename = name.endsWith('.mp3') || name.endsWith('.wav') ? name : `${name}.mp3`;
                }
              } else if (act.audioId && typeof act.audioId === 'string') {
                const cleanId = act.audioId.trim();
                audioFilename = cleanId.endsWith('.mp3') || cleanId.endsWith('.wav') ? cleanId : `${cleanId}.mp3`;
              }

              if (audioFilename) {
                act.audioUrl = `${baseAudio}/${audioFilename}`;
              } else {
                const padScene = String(scIdx).padStart(2, '0');
                const padSpeech = String(speechIdx).padStart(2, '0');
                const audioName = `scene_${padScene}_speech_${padSpeech}.mp3`;
                act.audioUrl = `${baseTts}/${audioName}`;
              }
              act.url = act.audioUrl;
            }
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
      const keyMatch = key.match(/^classrooms\/([^/]+)\/(u\d+)\/(l\d+)\/([^/]+)/i);
      const actualSubject = keyMatch?.[1] || subject;
      const actualUnit = keyMatch?.[2] || unit;
      const actualLesson = keyMatch?.[3] || lesson;
      const actualId = keyMatch?.[4] || classroomId;

      const normalized = normalizeClassroomAssets(data, actualSubject, actualUnit, actualLesson, actualId);
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
