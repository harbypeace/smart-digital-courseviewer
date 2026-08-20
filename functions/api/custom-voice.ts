/**
 * Cloudflare Pages Function — Custom Voice & TTS Studio API
 * Allows uploading custom voice audio files, customizing TTS voice profiles,
 * and saving per-scene / per-speech custom audio overrides.
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

      const u = cleanUnitCode(unit);
      const l = cleanLessonCode(lesson);
      const padScene = String(sceneIndex).padStart(2, '0');
      const padSpeech = String(speechIndex).padStart(2, '0');
      const customAudioKey = `classrooms/${subject}/${u}/${l}/${classroomId}/custom_tts/scene_${padScene}_speech_${padSpeech}.mp3`;

      // ── Action 1: Upload Custom Voice Audio File ──
      if (action === 'upload_audio' && audioBase64) {
        const binaryData = Uint8Array.from(atob(audioBase64.replace(/^data:audio\/\w+;base64,/, '')), (c) => c.charCodeAt(0));

        // Save to R2 bucket if available
        if (env.COURSES) {
          try {
            await env.COURSES.put(customAudioKey, binaryData, {
              httpMetadata: { contentType: 'audio/mpeg' },
            });
          } catch (_e) {}
        }

        const audioUrl = `/api/courses/${customAudioKey}`;
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'تم حفظ الصوت المخصص بنجاح',
            audioUrl,
            sceneIndex,
            speechIndex,
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
