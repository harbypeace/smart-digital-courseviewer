/**
 * Cloudflare Pages Function — Custom Voice & TTS Studio API
 * Allows uploading custom voice audio files, customizing TTS voice profiles,
 * and saving per-scene / per-speech custom audio overrides.
 */

import { authorizeRequest, type AuthEnv } from '../lib/auth';

interface Env extends AuthEnv {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
}

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

function safePart(value: unknown, fallback: string): string {
  const candidate = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]+$/.test(candidate) ? candidate : fallback;
}

function decodeAudio(audioBase64: string): Uint8Array | null {
  const encoded = audioBase64.replace(/^data:audio\/[\w.+-]+;base64,/, '');
  if (!encoded || encoded.length > 21_000_000) return null;
  try {
    const binary = atob(encoded);
    if (binary.length > 15 * 1024 * 1024) return null;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (_error) {
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
  };

  const requestSubject = new URL(request.url).searchParams.get('subject') || '';
  const auth = await authorizeRequest(request, env, requestSubject);
  if (auth.response) return auth.response;

  if (request.method === 'GET') {
    // Return available voice profiles and options
    const voiceProfiles = [
      { id: 'ar-sa-naif', name: 'أستاذ نايف (سعودي فصيح)', gender: 'male', provider: 'azure', lang: 'ar-SA' },
      { id: 'ar-eg-salma', name: 'أستاذة سلمى (مصرية هادئة)', gender: 'female', provider: 'azure', lang: 'ar-EG' },
      { id: 'ar-jo-tariq', name: 'أستاذ طارق (شامي واضح)', gender: 'male', provider: 'azure', lang: 'ar-JO' },
      { id: 'ar-ae-fatima', name: 'أستاذة فاطمة (خليجية دافئة)', gender: 'female', provider: 'azure', lang: 'ar-AE' },
      { id: 'custom-upload', name: 'صوت مخصص (رفع ملف صوتي أو تسجيل مباشر)', gender: 'custom', provider: 'user-upload', lang: 'ar' },
    ];

    return new Response(JSON.stringify({ status: 'ok', voiceProfiles }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      let body: any = {};

      if (contentType.includes('application/json')) {
        body = await request.json();
      } else if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        for (const [key, value] of formData.entries()) {
          body[key] = value;
        }
      }

      const {
        action = 'customize_voice',
        subject = 'adb10p1',
        unit = 'u1',
        lesson = 'l1',
        classroomId = '1v_nRmh_wh',
        sceneIndex = 0,
        speechIndex = 0,
        audioBase64,
        voiceProfileId,
        speed = 1.0,
        pitch = 1.0,
        text = '',
      } = body;

      const bodyAuth = await authorizeRequest(request, env, safePart(subject, 'adb10p1'));
      if (bodyAuth.response) return bodyAuth.response;

      const safeSubject = safePart(subject, 'adb10p1');
      const u = safePart(cleanUnitCode(String(unit)), 'u1');
      const l = safePart(cleanLessonCode(String(lesson)), 'l1');
      const safeClassroomId = safePart(classroomId, 'classroom');
      const safeSceneIndex = Number.isInteger(Number(sceneIndex)) && Number(sceneIndex) >= 0 && Number(sceneIndex) < 1000 ? Number(sceneIndex) : 0;
      const safeSpeechIndex = Number.isInteger(Number(speechIndex)) && Number(speechIndex) >= 0 && Number(speechIndex) < 1000 ? Number(speechIndex) : 0;
      const padScene = String(safeSceneIndex).padStart(2, '0');
      const padSpeech = String(safeSpeechIndex).padStart(2, '0');
      const customAudioKey = `classrooms/${safeSubject}/${u}/${l}/${safeClassroomId}/custom_tts/scene_${padScene}_speech_${padSpeech}.mp3`;

      // ── Action 1: Upload Custom Voice Audio File ──
      if (action === 'upload_audio' && audioBase64) {
        const binaryData = decodeAudio(String(audioBase64));
        if (!binaryData) {
          return new Response(JSON.stringify({ error: 'Audio payload is invalid or exceeds the 15 MB limit' }), {
            status: 413,
            headers: corsHeaders,
          });
        }
        if (!env.COURSES) {
          return new Response(JSON.stringify({ error: 'Course storage is not configured' }), {
            status: 503,
            headers: corsHeaders,
          });
        }
        try {
          await env.COURSES.put(customAudioKey, binaryData, {
            httpMetadata: { contentType: 'audio/mpeg' },
          });
        } catch (_error) {
          return new Response(JSON.stringify({ error: 'Failed to store custom audio' }), {
            status: 502,
            headers: corsHeaders,
          });
        }

        const audioUrl = `/api/courses/${customAudioKey}`;
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'تم حفظ الصوت المخصص بنجاح',
            audioUrl,
            sceneIndex: safeSceneIndex,
            speechIndex: safeSpeechIndex,
            key: customAudioKey,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // ── Action 2: Customize Voice Profile Parameters ──
      if (action === 'customize_voice') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'تم تطبيق إعدادات الصوت بنجاح',
            config: {
              voiceProfileId: voiceProfileId || 'ar-sa-naif',
              speed,
              pitch,
              subject,
              unit: u,
              lesson: l,
              classroomId,
            },
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // ── Action 3: Synthesize Speech Preview ──
      if (action === 'preview_speech') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            text,
            voiceProfileId,
            speed,
            pitch,
            previewNotice: 'يتم تشغيل معاينة الصوت المخصص عبر مشغل المتصفح أو خادم TTS',
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: corsHeaders,
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message || 'Failed to process voice request' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: corsHeaders,
  });
};
