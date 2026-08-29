import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AwsClient } from 'aws4fetch';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 8788;

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';

const S3_COURSES_CLIENT = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

// In-memory custom voice storage for preview server
const customVoiceMemoryCache = new Map();

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mimeMap = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    gif: 'image/gif',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    zip: 'application/zip',
    pdf: 'application/pdf',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

function cleanUnitCode(unit) {
  if (!unit) return 'u1';
  const match = unit.match(/[cu](\d+)/i);
  return match ? `u${match[1]}` : unit.replace(/.*_/, '');
}

function cleanLessonCode(lesson) {
  if (!lesson) return 'l1';
  const match = lesson.match(/[cl](\d+)$/i);
  return match ? `l${match[1]}` : lesson.replace(/.*_/, '');
}

/**
 * Normalizes a scene media URL to the live OpenMAIC media host over HTTPS.
 * The courses bucket is now private, so scene images/videos must be served
 * directly from the still-public open.maic.chat media CDN.
 */
function normalizeMediaSrc(src, classroomId) {
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

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname);

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // ── API 0: /api/custom-voice (Upload & Customize Voice) ──
    if (pathname === '/api/custom-voice') {
      if (req.method === 'GET') {
        const voiceProfiles = [
          { id: 'ar-sa-naif', name: 'أستاذ نايف (سعودي فصيح)', gender: 'male', provider: 'azure', lang: 'ar-SA' },
          { id: 'ar-eg-salma', name: 'أستاذة سلمى (مصرية هادئة)', gender: 'female', provider: 'azure', lang: 'ar-EG' },
          { id: 'ar-jo-tariq', name: 'أستاذ طارق (شامي واضح)', gender: 'male', provider: 'azure', lang: 'ar-JO' },
          { id: 'ar-ae-fatima', name: 'أستاذة فاطمة (خليجية دافئة)', gender: 'female', provider: 'azure', lang: 'ar-AE' },
          { id: 'custom-upload', name: 'صوت مخصص (رفع ملف صوتي أو تسجيل مباشر)', gender: 'custom', provider: 'user-upload', lang: 'ar' },
        ];
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok', voiceProfiles }));
        return;
      }

      if (req.method === 'POST') {
        let bodyText = '';
        req.on('data', (chunk) => { bodyText += chunk; });
        req.on('end', async () => {
          try {
            const body = JSON.parse(bodyText || '{}');
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
            } = body;

            const u = cleanUnitCode(unit);
            const l = cleanLessonCode(lesson);
            const padScene = String(sceneIndex).padStart(2, '0');
            const padSpeech = String(speechIndex).padStart(2, '0');
            const customAudioKey = `classrooms/${subject}/${u}/${l}/${classroomId}/custom_tts/scene_${padScene}_speech_${padSpeech}.mp3`;

            if (action === 'upload_audio' && audioBase64) {
              const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
              const buffer = Buffer.from(base64Data, 'base64');
              customVoiceMemoryCache.set(customAudioKey, buffer);

              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({
                status: 'ok',
                message: 'تم حفظ الصوت المخصص بنجاح',
                audioUrl: `/api/custom-voice/audio?key=${encodeURIComponent(customAudioKey)}`,
                sceneIndex,
                speechIndex,
                key: customAudioKey,
              }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              status: 'ok',
              message: 'تم تطبيق إعدادات الصوت بنجاح',
              config: { voiceProfileId, speed, pitch, subject, unit: u, lesson: l, classroomId },
            }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
    }

    // ── API 0.1: /api/custom-voice/audio (Serve uploaded in-memory audio) ──
    if (pathname === '/api/custom-voice/audio') {
      const key = reqUrl.searchParams.get('key') || '';
      if (customVoiceMemoryCache.has(key)) {
        const buf = customVoiceMemoryCache.get(key);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buf.length,
          'Accept-Ranges': 'bytes',
        });
        res.end(buf);
        return;
      }
    }

    // ── API 1: /api/classroom-data ──
    if (pathname === '/api/classroom-data') {
      const subject = reqUrl.searchParams.get('subject') || '';
      const unit = cleanUnitCode(reqUrl.searchParams.get('unit') || 'u1');
      const lesson = cleanLessonCode(reqUrl.searchParams.get('lesson') || 'l1');
      const classroomId = reqUrl.searchParams.get('id') || reqUrl.searchParams.get('classroomId') || '';

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
        try {
          const s3Url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses/${encodeURI(key).replace(/%2F/g, '/')}`;
          const s3Res = await S3_COURSES_CLIENT.fetch(s3Url, { method: 'GET' });
          if (s3Res.ok) {
            const data = await s3Res.json();
            // Normalize audio + scene media
            if (data && Array.isArray(data.scenes)) {
              data.scenes.forEach((sc, scIdx) => {
                const canvasElements = sc?.content?.canvas?.elements;
                if (Array.isArray(canvasElements)) {
                  canvasElements.forEach((el) => {
                    if ((el.type === 'image' || el.type === 'video') && el.src) {
                      el.src = normalizeMediaSrc(el.src, classroomId);
                    }
                  });
                }
                if (Array.isArray(sc.actions)) {
                  let speechIdx = 0;
                  sc.actions.forEach((act) => {
                    if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl) {
                      const padScene = String(scIdx).padStart(2, '0');
                      const padSpeech = String(speechIdx).padStart(2, '0');
                      act.audioUrl = `/api/courses/classrooms/${subject}/${unit}/${lesson}/${classroomId}/tts/scene_${padScene}_speech_${padSpeech}.mp3`;
                      speechIdx++;
                    }
                  });
                }
              });
            }

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ status: 'ok', key, data }));
            return;
          }
        } catch (_e) {}
      }

      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Classroom not found', candidates: candidateKeys }));
      return;
    }

    // ── API 2: /api/classroom-zip/data & /api/classroom-zip/media ──
    if (pathname.startsWith('/api/classroom-zip/')) {
      const zipParam = reqUrl.searchParams.get('zip') || reqUrl.searchParams.get('zipUrl') || '';
      const fileParam = reqUrl.searchParams.get('file') || '';

      if (!zipParam) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing zip parameter' }));
        return;
      }

      let zipBuffer = null;
      if (zipParam.startsWith('http://') || zipParam.startsWith('https://')) {
        const fetchRes = await fetch(zipParam);
        if (fetchRes.ok) zipBuffer = await fetchRes.arrayBuffer();
      } else {
        const localZipPath = path.join(DIST_DIR, zipParam.replace(/^\/+/, ''));
        if (fs.existsSync(localZipPath)) {
          zipBuffer = fs.readFileSync(localZipPath);
        } else {
          // Try S3
          const s3Url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses/${encodeURI(zipParam.replace(/^\/+/, '')).replace(/%2F/g, '/')}`;
          const s3Res = await S3_COURSES_CLIENT.fetch(s3Url, { method: 'GET' });
          if (s3Res.ok) zipBuffer = await s3Res.arrayBuffer();
        }
      }

      if (!zipBuffer) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load ZIP archive' }));
        return;
      }

      const zip = await JSZip.loadAsync(zipBuffer);

      if (pathname.includes('/media') || fileParam) {
        const cleanName = fileParam.replace(/^\/+/, '');
        let file = zip.file(cleanName) || zip.file(cleanName.split('/').pop() || '');
        if (!file) {
          const files = zip.file(new RegExp(`${path.basename(cleanName)}$`, 'i'));
          if (files.length > 0) file = files[0];
        }

        if (!file) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `File not found in ZIP: ${fileParam}` }));
          return;
        }

        const buf = await file.async('nodebuffer');
        res.writeHead(200, {
          'Content-Type': getMime(file.name),
          'Content-Length': buf.length,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(buf);
        return;
      }

      // Manifest data extraction
      const manifestFile = zip.file(/(?:^|\/)manifest\.json$/i)[0] ||
                           zip.file(/(?:^|\/)classroom\.json$/i)[0] ||
                           zip.file(/(?:^|\/)classdata\.json$/i)[0];

      if (manifestFile) {
        const text = await manifestFile.async('string');
        const parsed = JSON.parse(text);

        // Rewrite URLs
        const buildMediaUrl = (f) => f && !/^(http|data:|blob:)/.test(f) ? `/api/classroom-zip/media?zip=${encodeURIComponent(zipParam)}&file=${encodeURIComponent(f.replace(/^\/+/, ''))}` : f;

        if (Array.isArray(parsed.scenes)) {
          parsed.scenes.forEach((sc) => {
            if (sc.content?.canvas?.elements) {
              sc.content.canvas.elements.forEach((el) => {
                if ((el.type === 'image' || el.type === 'video') && el.src) el.src = buildMediaUrl(el.src);
              });
            }
            if (Array.isArray(sc.actions)) {
              sc.actions.forEach((act) => {
                if (act.type === 'speech' || act.type === 'speak') {
                  if (act.audioUrl) act.audioUrl = buildMediaUrl(act.audioUrl);
                  if (act.audioRef) act.audioUrl = buildMediaUrl(act.audioRef);
                  if (act.visualUrl) act.visualUrl = buildMediaUrl(act.visualUrl);
                }
              });
            }
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'ok', format: 'zip-stream', data: parsed }));
        return;
      }
    }

    // ── API 3: /api/courses/* ──
    if (pathname.startsWith('/api/courses/')) {
      const key = pathname.replace(/^\/api\/courses\//, '');
      const s3Url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses/${encodeURI(key).replace(/%2F/g, '/')}`;
      const s3Headers = {};
      if (req.headers.range) s3Headers['Range'] = req.headers.range;

      const s3Res = await S3_COURSES_CLIENT.fetch(s3Url, { method: req.method, headers: s3Headers });
      if (s3Res.ok || s3Res.status === 206) {
        const buf = Buffer.from(await s3Res.arrayBuffer());
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': getMime(key),
          'Accept-Ranges': 'bytes',
          'Content-Length': String(buf.length),
        };
        if (s3Res.headers.get('content-range')) {
          headers['Content-Range'] = s3Res.headers.get('content-range');
        }
        res.writeHead(s3Res.status, headers);
        res.end(buf);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Object not found in courses bucket', key }));
      return;
    }

    // ── API 4: /pages/* (Textbook image proxy with CORS) ──
    if (pathname.startsWith('/pages/')) {
      const cleanKey = pathname.replace(/^\/pages\//, '');
      const pubUrl = `https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/${cleanKey}`;
      try {
        const fetchRes = await fetch(pubUrl);
        if (fetchRes.ok) {
          const buf = Buffer.from(await fetchRes.arrayBuffer());
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': getMime(cleanKey),
            'Content-Length': buf.length,
            'Cache-Control': 'public, max-age=86400',
          });
          res.end(buf);
          return;
        }
      } catch (_e) {}
    }

    // ── Static Files from dist/ ──
    let localPath = path.join(DIST_DIR, pathname);
    if (fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()) {
      localPath = path.join(localPath, 'index.html');
    }

    if (fs.existsSync(localPath) && !fs.statSync(localPath).isDirectory()) {
      const buf = fs.readFileSync(localPath);
      res.writeHead(200, {
        'Content-Type': getMime(localPath),
        'Content-Length': buf.length,
      });
      res.end(buf);
      return;
    }

    // SPA fallback: serve dist/index.html for any client routes
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      const buf = fs.readFileSync(indexPath);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': buf.length,
      });
      res.end(buf);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==================================================`);
  console.log(`🌐 CourseViewer Render Server is LIVE at:`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   http://localhost:${PORT}/catalog.html (Complete Catalog)`);
  console.log(`   http://localhost:${PORT}/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh`);
  console.log(`==================================================\n`);
});
