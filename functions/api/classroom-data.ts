/**
 * Cloudflare Pages Function — Classroom Data Resolver
 * Resolves classroom scenes and normalizes audio TTS paths to the secure proxy.
 */

import { AwsClient } from 'aws4fetch';

interface Env {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
}

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';

const S3_COURSES_CLIENT = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

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

  try {
    const publicUrl = `https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
    const pubRes = await fetch(publicUrl, { method: 'GET' });
    if (pubRes.ok) {
      return await pubRes.json();
    }
  } catch (_e) {}

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

  let subject = url.searchParams.get('subject') || '';
  let unit = cleanUnitCode(url.searchParams.get('unit') || 'u1');
  let lesson = cleanLessonCode(url.searchParams.get('lesson') || 'l1');
  let classroomId = url.searchParams.get('id') || url.searchParams.get('classroomId') || '';

  if (request.method === 'POST') {
    try {
      const body = await request.json() as any;
      if (body.subject) subject = body.subject;
      if (body.unit) unit = cleanUnitCode(body.unit);
      if (body.lesson) lesson = cleanLessonCode(body.lesson);
      if (body.id || body.classroomId) classroomId = body.id || body.classroomId;
    } catch (_e) {}
  }

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
