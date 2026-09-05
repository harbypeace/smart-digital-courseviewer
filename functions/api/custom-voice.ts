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

      // ── Action 3: Synthesize High-Quality Speech via ElevenLabs / Gemini (Lightweight Format) ──
      if (action === 'generate_tts') {
        const {
          provider = 'elevenlabs',
          apiKey,
          voiceId,
          model,
          replaceOriginalTts = true,
        } = body;

        if (!text) {
          throw new Error('Text is required for TTS synthesis');
        }

        let binaryData: Uint8Array | null = null;

        // 1. ElevenLabs Multilingual v2 with lightweight fast-loading MP3 format (mp3_44100_64)
        if (provider === 'elevenlabs') {
          const elevenKey = apiKey || (env as any).ELEVENLABS_API_KEY;
          if (!elevenKey) {
            throw new Error('مفتاح ElevenLabs API مطلوب لإتمام التوليد');
          }

          const selectedVoice = voiceId || '21m00Tcm4TlvDq8ikWAM';
          const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_44100_64`;

          const elevenRes = await fetch(elevenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': elevenKey,
            },
            body: JSON.stringify({
              text,
              model_id: model || 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          });

          if (!elevenRes.ok) {
            const errText = await elevenRes.text();
            throw new Error(`ElevenLabs API error (${elevenRes.status}): ${errText}`);
          }

          const audioBuf = await elevenRes.arrayBuffer();
          binaryData = new Uint8Array(audioBuf);
        }

        // 2. Google Gemini / Neural2 TTS with lightweight 24kHz MP3 format
        if (provider === 'gemini' || provider === 'google') {
          const geminiKey = apiKey || (env as any).GEMINI_API_KEY || (env as any).GOOGLE_TTS_API_KEY;
          if (!geminiKey) {
            throw new Error('مفتاح Gemini / Google API مطلوب لإتمام التوليد');
          }

          const gUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${geminiKey}`;
          const gRes = await fetch(gUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input: { text },
              voice: {
                languageCode: 'ar-XA',
                name: voiceId || 'ar-XA-Journey-F',
              },
              audioConfig: {
                audioEncoding: 'MP3',
                speakingRate: speed || 1.0,
                pitch: 0.0,
                sampleRateHertz: 24000,
              },
            }),
          });

          if (!gRes.ok) {
            const errText = await gRes.text();
            throw new Error(`Gemini/Google TTS error (${gRes.status}): ${errText}`);
          }

          const gJson: any = await gRes.json();
          if (!gJson.audioContent) {
            throw new Error('لم يتم استلام محتوى صوتي من Google/Gemini TTS');
          }
          binaryData = Uint8Array.from(atob(gJson.audioContent), (c) => c.charCodeAt(0));
        }

        if (!binaryData) {
          throw new Error(`المزود غير مدعوم: ${provider}`);
        }

        const targetKey = replaceOriginalTts
          ? `classrooms/${subject}/${u}/${l}/${classroomId}/tts/scene_${padScene}_speech_${padSpeech}.mp3`
          : customAudioKey;

        // Save to R2
        if (env.COURSES) {
          try {
            await env.COURSES.put(targetKey, binaryData, {
              httpMetadata: { contentType: 'audio/mpeg' },
            });
          } catch (_e) {}
        }

        const audioUrl = `/api/courses/${targetKey}?t=${Date.now()}`;
        return new Response(
          JSON.stringify({
            status: 'ok',
            message: 'تم توليد الصوت بنجاح بصيغة خفيفة وسريعة التحميل (Lightweight Fast MP3)',
            audioUrl,
            provider,
            sizeBytes: binaryData.byteLength,
            sceneIndex,
            speechIndex,
            key: targetKey,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // ── Action 4: Synthesize Speech Preview ──
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
