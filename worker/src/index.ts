/**
 * Lesson Viewer & Content Renderer — Cloudflare Worker
 *
 * Unified processing & rendering engine for:
 * 1. Interactive Lesson HTML (/api/lesson-html, /content-html, /api/process-lesson, /html/...)
 * 2. Printed Pages Full RTL Viewer (/printed-pages, /lesson/..., /api/printed-pages)
 * 3. Virtual Classroom & TTS Audio Streamer (/classroom/..., /classrooms/...)
 * 4. Private Image Proxy (/pages/...)
 * 5. Course Thumbnails (/api/thumbnails, /thumbnails/...)
 * 6. HARBY TTS Scanner & Migrator (/api/scan-harby, /api/migrate-harby)
 */

import { AwsClient } from 'aws4fetch';
import { verifyJwt, extractJwtFromRequest, isCourseAuthorized, type JwtPayload } from './jwt';

export interface Env {
  ASSETS?: Fetcher;
  COURSES_IMAGES?: R2Bucket;
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
  JWT_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  REQUIRE_AUTH?: string;
  ALLOW_PUBLIC_R2_FALLBACK?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
const PUBLIC_R2_IMAGES = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev';
const PUBLIC_R2_COURSES = 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev';

function isEnabled(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

function getS3Client(env: Env): AwsClient | null {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function htmlResponse(body: string, maxAge = 300, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function getMime(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.wav')) return 'audio/wav';
  if (p.endsWith('.ogg')) return 'audio/ogg';
  if (p.endsWith('.mp4')) return 'video/mp4';
  if (p.endsWith('.zip') || p.endsWith('.maic.zip')) return 'application/zip';
  return 'application/octet-stream';
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

function cleanFilename(fn?: string): string {
  if (!fn) return '';
  return fn.split('/').pop()!.split('\\').pop()!;
}

async function fetchR2Object(env: Env, bucketName: 'coursesimages' | 'courses' | 'harby', key: string): Promise<Response | null> {
  const cleanKey = key.replace(/^\/+/, '');
  
  if (bucketName === 'coursesimages') {
    if (env.COURSES_IMAGES) {
      try {
        const obj = await env.COURSES_IMAGES.get(cleanKey);
        if (obj) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(obj.body, { headers });
        }
      } catch (_e) {}
    }
    const s3Client = getS3Client(env);
    if (s3Client) {
      try {
        const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/coursesimages/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
        const res = await s3Client.fetch(url, { method: 'GET' });
        if (res.ok) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(res.body, { headers });
        }
      } catch (_e) {}
    }
    if (isEnabled(env.ALLOW_PUBLIC_R2_FALLBACK)) {
      try {
        const pubRes = await fetch(`${PUBLIC_R2_IMAGES}/${cleanKey}`);
        if (pubRes.ok) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(pubRes.body, { headers });
        }
      } catch (_e) {}
    }
  }

  if (bucketName === 'courses') {
    if (env.COURSES) {
      try {
        const obj = await env.COURSES.get(cleanKey);
        if (obj) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'public, max-age=3600');
          return new Response(obj.body, { headers });
        }
      } catch (_e) {}
    }
    const s3Client = getS3Client(env);
    if (s3Client) {
      try {
        const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
        const res = await s3Client.fetch(url, { method: 'GET' });
        if (res.ok) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'private, max-age=3600');
          return new Response(res.body, { headers });
        }
      } catch (_e) {}
    }
    if (isEnabled(env.ALLOW_PUBLIC_R2_FALLBACK)) {
      try {
        const pubRes = await fetch(`${PUBLIC_R2_COURSES}/${cleanKey}`);
        if (pubRes.ok) {
          const headers = new Headers(CORS);
          headers.set('Content-Type', getMime(cleanKey));
          headers.set('Cache-Control', 'private, max-age=3600');
          return new Response(pubRes.body, { headers });
        }
      } catch (_e) {}
    }
  }

  return null;
}

/**
 * Normalizes Classroom classdata.json by fixing old dead HTTP audio URLs to migrated R2 voiceover paths.
 */
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

function normalizeClassroomData(jsonData: any, subject: string, unit: string, lesson: string, classroomId: string): any {
  if (!jsonData || typeof jsonData !== 'object') return jsonData;

  const clone = JSON.parse(JSON.stringify(jsonData));
  const uClean = cleanUnitCode(unit);
  const lClean = cleanLessonCode(lesson);
  const baseTtsUrl = `/classrooms/${subject}/${uClean}/${lClean}/${classroomId}/tts`;

  if (Array.isArray(clone.scenes)) {
    clone.scenes.forEach((scene: any, sceneIdx: number) => {
      const canvasElements = scene?.content?.canvas?.elements;
      if (Array.isArray(canvasElements)) {
        canvasElements.forEach((el: any) => {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            el.src = normalizeMediaSrc(el.src, classroomId);
          }
        });
      }
      if (Array.isArray(scene.actions)) {
        let speechIdx = 0;
        scene.actions.forEach((act: any) => {
          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl) {
            const padScene = String(sceneIdx).padStart(2, '0');
            const padSpeech = String(speechIdx).padStart(2, '0');
            const audioFilename = `scene_${padScene}_speech_${padSpeech}.mp3`;
            
            act.audioUrl = `${baseTtsUrl}/${audioFilename}`;
            act.workerAudioUrl = act.audioUrl;
            speechIdx++;
          }
        });
      }
    });
  }

  return clone;
}

/**
 * Renders an interactive web classroom player for browsers.
 */
function renderClassroomPlayerHtml(classData: any, subject: string, unit: string, lesson: string, classroomId: string): string {
  const stageName = classData?.stage?.name || classData?.title || 'الغرفة الصفية الذكية';
  const scenes = classData?.scenes || [];
  const scenesJson = JSON.stringify(scenes).replace(/</g, '\\u003c');
  const uClean = cleanUnitCode(unit);
  const lClean = cleanLessonCode(lesson);

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${stageName} — الغرفة الصفية الافتراضية</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #10b981;
      --accent-cyan: #06b6d4;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      font-family: 'Cairo', 'Tajawal', system-ui, sans-serif;
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }
    .header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .header-titles h1 { font-size: 1.1rem; font-weight: 800; color: #fff; }
    .header-titles span { font-size: 0.8rem; color: var(--accent); font-weight: 700; }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border: 1px solid var(--card-border);
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: var(--accent); color: #090d16; }
    .player-container {
      width: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      flex: 1;
    }
    .stage-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .slide-canvas {
      width: 100%;
      min-height: 460px;
      background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
      padding: 32px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      position: relative;
      overflow: hidden;
    }
    .slide-title {
      font-size: 1.8rem;
      font-weight: 900;
      color: #fff;
      margin-bottom: 20px;
      text-align: center;
      text-shadow: 0 2px 10px rgba(0,0,0,0.5);
    }
    .slide-elements {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 800px;
    }
    .slide-el-text {
      font-size: 1.15rem;
      line-height: 1.9;
      color: #e2e8f0;
      background: rgba(15, 23, 42, 0.6);
      padding: 18px 24px;
      border-radius: 16px;
      border: 1px solid var(--card-border);
    }
    .slide-el-img {
      max-width: 100%;
      max-height: 320px;
      object-fit: contain;
      border-radius: 16px;
      margin: 0 auto;
      display: block;
      border: 1px solid var(--card-border);
    }
    .speech-bubble {
      margin-top: 20px;
      width: 100%;
      max-width: 800px;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1));
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 18px 24px;
      border-radius: 20px;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
    }
    .teacher-avatar {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--accent);
      color: #090d16;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 1.2rem;
      shrink: 0;
    }
    .speech-text {
      flex: 1;
      font-size: 1.05rem;
      line-height: 1.8;
      color: #f1f5f9;
      font-weight: 600;
    }
    .playback-bar {
      background: #0b1120;
      border-top: 1px solid var(--card-border);
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .controls-left, .controls-center, .controls-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .play-btn {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: var(--accent);
      color: #090d16;
      border: none;
      font-size: 1.2rem;
      font-weight: 900;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .play-btn:hover { transform: scale(1.08); box-shadow: 0 0 20px rgba(16, 185, 129, 0.5); }
    .scenes-drawer {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      padding: 16px;
      background: var(--card-bg);
      border-radius: 20px;
      border: 1px solid var(--card-border);
    }
    .scene-thumb {
      background: #1e293b;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 10px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: right;
    }
    .scene-thumb.active {
      border-color: var(--accent);
      background: rgba(16, 185, 129, 0.15);
    }
    .scene-thumb h5 { font-size: 0.8rem; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .scene-thumb p { font-size: 0.7rem; color: var(--text-muted); line-clamp: 2; overflow: hidden; }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-titles">
      <h1>🏫 ${stageName}</h1>
      <span>${subject} • ${uClean} • ${lClean}</span>
    </div>
    <div>
      <a href="/classroom/${subject}/${uClean}/${lClean}/${classroomId}/classdata.json" target="_blank" class="btn">📄 عرض JSON</a>
      <button class="btn" onclick="toggleFullscreen()">⛶ ملء الشاشة</button>
    </div>
  </header>

  <main class="player-container">
    <div class="stage-card" id="stageCard">
      <div class="slide-canvas" id="canvas">
        <h2 class="slide-title" id="sceneTitle">جاري تحميل المشهد...</h2>
        <div class="slide-elements" id="sceneElements"></div>
        <div class="speech-bubble" id="speechBox">
          <div class="teacher-avatar">👨‍🏫</div>
          <div class="speech-text" id="speechText">مرحباً بكم في الدرس التفاعلي!</div>
        </div>
      </div>

      <div class="playback-bar">
        <div class="controls-left">
          <button class="play-btn" id="playBtn" onclick="togglePlay()">▶</button>
          <button class="btn" onclick="prevScene()">⏮ السابق</button>
          <button class="btn" onclick="nextScene()">التالي ⏭</button>
        </div>

        <div class="controls-center">
          <span style="font-size:0.85rem; font-weight:700; color:#94a3b8;" id="sceneIndicator">مشهد 1 من ${scenes.length}</span>
        </div>

        <div class="controls-right">
          <select class="btn" id="speedSelect" onchange="changeSpeed(this.value)">
            <option value="1">1.0x سرعة</option>
            <option value="1.25">1.25x سرعة</option>
            <option value="1.5">1.5x سرعة</option>
            <option value="2">2.0x سرعة</option>
          </select>
        </div>
      </div>
    </div>

    <h3 style="font-size:1rem; font-weight:800; color:#fff; margin-top:8px;">📑 مشاهد الدرس (${scenes.length})</h3>
    <div class="scenes-drawer" id="scenesList"></div>
  </main>

  <audio id="ttsAudio" preload="auto"></audio>

  <script>
    const scenes = ${scenesJson};
    let currentSceneIdx = 0;
    let isPlaying = false;
    const audio = document.getElementById('ttsAudio');

    function renderScene(idx) {
      if (idx < 0 || idx >= scenes.length) return;
      currentSceneIdx = idx;
      const s = scenes[idx];
      document.getElementById('sceneIndicator').innerText = 'مشهد ' + (idx + 1) + ' من ' + scenes.length;
      document.getElementById('sceneTitle').innerText = s.title || (s.content && s.content.canvas && s.content.canvas.title) || ('المشهد ' + (idx + 1));
      
      const elContainer = document.getElementById('sceneElements');
      elContainer.innerHTML = '';
      if (s.content && s.content.canvas && Array.isArray(s.content.canvas.elements)) {
        s.content.canvas.elements.forEach(el => {
          if (el.type === 'text' && el.text) {
            const div = document.createElement('div');
            div.className = 'slide-el-text';
            div.innerText = el.text;
            elContainer.appendChild(div);
          } else if (el.type === 'image' && el.src) {
            const img = document.createElement('img');
            img.className = 'slide-el-img';
            img.src = el.src;
            elContainer.appendChild(img);
          }
        });
      }

      const speechAction = (s.actions || []).find(a => a.type === 'speech' || a.type === 'speak' || a.audioUrl);
      if (speechAction) {
        document.getElementById('speechBox').style.display = 'flex';
        document.getElementById('speechText').innerText = speechAction.text || '...';
        if (speechAction.audioUrl) {
          audio.src = speechAction.audioUrl;
          if (isPlaying) audio.play().catch(()=>{});
        }
      } else {
        document.getElementById('speechBox').style.display = 'none';
      }

      document.querySelectorAll('.scene-thumb').forEach((thumb, i) => {
        if (i === idx) thumb.classList.add('active');
        else thumb.classList.remove('active');
      });
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      const btn = document.getElementById('playBtn');
      if (isPlaying) {
        btn.innerText = '⏸';
        audio.play().catch(()=>{});
      } else {
        btn.innerText = '▶';
        audio.pause();
      }
    }

    function nextScene() {
      if (currentSceneIdx < scenes.length - 1) {
        renderScene(currentSceneIdx + 1);
        if (isPlaying) audio.play().catch(()=>{});
      }
    }

    function prevScene() {
      if (currentSceneIdx > 0) {
        renderScene(currentSceneIdx - 1);
        if (isPlaying) audio.play().catch(()=>{});
      }
    }

    function changeSpeed(spd) {
      audio.playbackRate = parseFloat(spd);
    }

    audio.onended = () => {
      if (currentSceneIdx < scenes.length - 1) {
        nextScene();
      } else {
        isPlaying = false;
        document.getElementById('playBtn').innerText = '▶';
      }
    };

    function toggleFullscreen() {
      const card = document.getElementById('stageCard');
      if (!document.fullscreenElement) card.requestFullscreen().catch(()=>{});
      else document.exitFullscreen().catch(()=>{});
    }

    const list = document.getElementById('scenesList');
    scenes.forEach((sc, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'scene-thumb' + (i === 0 ? ' active' : '');
      thumb.onclick = () => renderScene(i);
      const sp = (sc.actions || []).find(a => a.type === 'speech');
      thumb.innerHTML = '<h5>مشهد ' + (i + 1) + '</h5><p>' + (sp ? sp.text : (sc.title || 'مشهد تعليمي')) + '</p>';
      list.appendChild(thumb);
    });

    renderScene(0);
  </script>
</body>
</html>`;
}

/**
 * Builds rich interactive HTML lesson from content pages, markdown text, images, and questions.
 */
function renderLessonHtmlContent(data: {
  subject: string;
  subjectTitle?: string;
  unit: string;
  unitTitle?: string;
  lesson: string;
  lessonTitle?: string;
  contentPages?: any[];
  questions?: any[];
  flashcards?: any[];
  startPage?: number;
  endPage?: number;
}): string {
  const { subject, subjectTitle, unit, unitTitle, lesson, lessonTitle, contentPages = [], questions = [], flashcards = [], startPage = 1, endPage = 1 } = data;
  const uClean = cleanUnitCode(unit);
  const lClean = cleanLessonCode(lesson);

  const formatText = (rawText?: string) => {
    if (!rawText) return '';
    // Replace markdown images: ![alt](url) -> <img> with clean R2 path
    const textWithImgs = rawText.replace(/!\[(.*?)\]\((.*?)\)/g, (_m, alt, imgPath) => {
      const clean = cleanFilename(imgPath);
      const src = `${PUBLIC_R2_IMAGES}/${subject}/${uClean}/${lClean}/${clean}`;
      return `
        <figure class="inline-img-figure">
          <img src="${src}" alt="${alt || 'صورة توضيحية'}" loading="lazy" class="inline-lesson-img" />
          ${alt ? `<figcaption>${alt}</figcaption>` : ''}
        </figure>`;
    });

    return textWithImgs
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-bold text-cyan-400 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-black text-emerald-400 mt-6 mb-3 border-b border-white/10 pb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-black text-white mt-8 mb-4">$1</h1>')
      .replace(/\n\n/g, '</p><p class="paragraph">')
      .replace(/\n/g, '<br/>');
  };

  let pagesMarkup = '';
  if (contentPages.length > 0) {
    pagesMarkup = contentPages.map((cp, idx) => {
      const formattedText = formatText(cp.text);
      let imgGrid = '';
      if (cp.images && Array.isArray(cp.images) && cp.images.length > 0) {
        const imgs = cp.images.map((img: any) => {
          const rawUrl = typeof img === 'string' ? img : (img.url || img.src);
          const clean = cleanFilename(rawUrl);
          const imgSrc = `${PUBLIC_R2_IMAGES}/${subject}/${uClean}/${lClean}/${clean}`;
          return `
            <div class="gallery-card">
              <img src="${imgSrc}" alt="شكل توضيحي" loading="lazy" />
            </div>`;
        }).join('');
        imgGrid = `<div class="image-gallery-grid">${imgs}</div>`;
      }

      return `
        <article class="lesson-card" id="page-sec-${idx + 1}">
          <div class="card-badge">قسم ${idx + 1}</div>
          ${cp.title ? `<h2 class="section-title">${cp.title}</h2>` : ''}
          ${formattedText ? `<div class="content-body"><p class="paragraph">${formattedText}</p></div>` : ''}
          ${imgGrid}
          ${cp.page_number ? `<div class="page-footer-tag">مرجع الكتاب: صفحة ${cp.page_number}</div>` : ''}
        </article>`;
    }).join('');
  } else {
    // Fallback: render scanned textbook pages
    let scannedPages = '';
    const total = endPage >= startPage ? (endPage - startPage + 1) : 5;
    for (let p = startPage; p <= (startPage + total - 1); p++) {
      const cleanKey = `${subject}/${uClean}/${lClean}/page-${p}`;
      scannedPages += `
        <div class="scanned-page-card">
          <div class="card-badge">صفحة ${p}</div>
          <img 
            src="${PUBLIC_R2_IMAGES}/${cleanKey}-w900.webp" 
            srcset="${PUBLIC_R2_IMAGES}/${cleanKey}-w600.webp 600w, ${PUBLIC_R2_IMAGES}/${cleanKey}-w900.webp 900w, ${PUBLIC_R2_IMAGES}/${cleanKey}-w1200.webp 1200w"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 960px"
            alt="صفحة ${p}"
            loading="lazy"
            decoding="async"
          />
        </div>`;
    }
    pagesMarkup = scannedPages;
  }

  // Flashcards block
  let flashcardsMarkup = '';
  if (flashcards.length > 0) {
    const cards = flashcards.map((fc, i) => `
      <div class="flashcard" onclick="this.classList.toggle('flipped')">
        <div class="card-inner">
          <div class="card-front">
            <span class="fc-num">#${i + 1}</span>
            <p>${fc.front || fc.question}</p>
            <span class="tap-hint">انقر لقلب البطاقة ↺</span>
          </div>
          <div class="card-back">
            <span class="fc-num">الإجابة</span>
            <p>${fc.back || fc.answer}</p>
          </div>
        </div>
      </div>`).join('');
    flashcardsMarkup = `
      <section class="activity-section">
        <h3 class="activity-title">🧠 البطاقات التعليمية التفاعلية</h3>
        <div class="flashcards-grid">${cards}</div>
      </section>`;
  }

  // Questions block
  let questionsMarkup = '';
  if (questions.length > 0) {
    const qList = questions.map((q, i) => `
      <div class="question-card">
        <div class="q-header">
          <span class="q-badge">سؤال ${i + 1}</span>
          <p class="q-text">${q.question}</p>
        </div>
        ${q.options && Array.isArray(q.options) ? `
          <div class="options-grid">
            ${q.options.map((opt: string, optIdx: number) => `
              <button class="opt-btn" onclick="this.parentElement.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected'));this.classList.add('selected');">
                ${opt}
              </button>`).join('')}
          </div>` : ''}
        ${q.answer ? `
          <details class="answer-details">
            <summary>كشف الإجابة النموذجية</summary>
            <div class="answer-content">${q.answer}</div>
          </details>` : ''}
      </div>`).join('');
    questionsMarkup = `
      <section class="activity-section">
        <h3 class="activity-title">📝 بنك أسئلة وتدريبات الدرس</h3>
        <div class="questions-list">${qList}</div>
      </section>`;
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>${lessonTitle || 'الدرس التفاعلي'} — ${subjectTitle || subject}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #06b6d4;
      --accent-green: #10b981;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      font-family: 'Cairo', 'Tajawal', system-ui, sans-serif;
      color: var(--text);
      line-height: 1.8;
      font-size: 17px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 14px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .header-titles h1 { font-size: 1.15rem; font-weight: 800; color: #fff; }
    .header-titles span { font-size: 0.8rem; color: var(--accent); font-weight: 700; }
    .toolbar-btns { display: flex; gap: 8px; }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border: 1px solid var(--card-border);
      padding: 6px 12px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--accent); color: #090d16; }
    .container {
      width: 100%;
      max-width: 920px;
      margin: 0 auto;
      padding: 24px 16px 80px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .lesson-card, .scanned-page-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 28px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .scanned-page-card { padding: 12px; overflow: hidden; }
    .scanned-page-card img { width: 100%; height: auto; border-radius: 12px; display: block; }
    .card-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--accent);
      background: rgba(6, 182, 212, 0.12);
      border: 1px solid rgba(6, 182, 212, 0.3);
      padding: 2px 10px;
      border-radius: 8px;
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 1.35rem;
      font-weight: 900;
      color: #fff;
      margin-bottom: 16px;
      border-right: 4px solid var(--accent);
      padding-right: 12px;
    }
    .content-body { color: #cbd5e1; font-size: 1.05rem; }
    .paragraph { margin-bottom: 16px; line-height: 2; text-align: justify; }
    .inline-img-figure {
      margin: 20px 0;
      text-align: center;
      background: #000;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--card-border);
    }
    .inline-lesson-img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    figcaption { padding: 8px; font-size: 0.8rem; color: var(--text-muted); }
    .image-gallery-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .gallery-card {
      background: #000;
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--card-border);
    }
    .gallery-card img { width: 100%; height: auto; display: block; }
    .page-footer-tag { margin-top: 20px; font-size: 0.8rem; color: var(--text-muted); text-align: left; }
    .activity-section { margin-top: 16px; display: flex; flex-direction: column; gap: 16px; }
    .activity-title { font-size: 1.2rem; font-weight: 900; color: #fff; }
    .flashcards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .flashcard { perspective: 1000px; height: 180px; cursor: pointer; }
    .card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.6s; transform-style: preserve-3d; }
    .flashcard.flipped .card-inner { transform: rotateY(180deg); }
    .card-front, .card-back {
      position: absolute;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
      border-radius: 16px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      border: 1px solid var(--card-border);
    }
    .card-front { background: #1e293b; color: #fff; font-weight: 700; }
    .card-back { background: #064e3b; color: #a7f3d0; transform: rotateY(180deg); font-weight: 700; }
    .fc-num { position: absolute; top: 8px; right: 12px; font-size: 0.7rem; color: var(--text-muted); }
    .tap-hint { position: absolute; bottom: 8px; font-size: 0.7rem; color: var(--accent); }
    .questions-list { display: flex; flex-direction: column; gap: 14px; }
    .question-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px; }
    .q-header { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 12px; }
    .q-badge { background: rgba(16, 185, 129, 0.15); color: var(--accent-green); padding: 2px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; shrink: 0; }
    .q-text { font-weight: 700; color: #fff; font-size: 1rem; }
    .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .opt-btn { background: #1e293b; border: 1px solid var(--card-border); color: #cbd5e1; padding: 10px; border-radius: 10px; font-family: inherit; font-size: 0.85rem; font-weight: 600; cursor: pointer; text-align: right; }
    .opt-btn.selected { background: rgba(6, 182, 212, 0.2); border-color: var(--accent); color: #fff; }
    .answer-details { margin-top: 12px; font-size: 0.85rem; }
    .answer-details summary { cursor: pointer; color: var(--accent); font-weight: 700; }
    .answer-content { margin-top: 8px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.2); }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-titles">
      <h1>${lessonTitle || 'الدرس التفاعلي'}</h1>
      <span>${subjectTitle || subject} • الوحدة ${uClean} • الدرس ${lClean}</span>
    </div>
    <div class="toolbar-btns">
      <button class="btn" onclick="window.scrollTo({top:0, behavior:'smooth'})">⬆ للأعلى</button>
      <button class="btn" onclick="window.print()">🖨️ طباعة</button>
    </div>
  </header>

  <main class="container">
    ${pagesMarkup}
    ${flashcardsMarkup}
    ${questionsMarkup}
  </main>
</body>
</html>`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const url = new URL(req.url);
    const p = url.pathname;

    // ── 0. Static Assets & React Frontend SPA ──
    if (env.ASSETS) {
      if (
        p.startsWith('/assets/') ||
        p.endsWith('.js') ||
        p.endsWith('.css') ||
        p.endsWith('.svg') ||
        p.endsWith('.ico') ||
        p.endsWith('.woff2') ||
        p === '/catalog.html'
      ) {
        return env.ASSETS.fetch(req);
      }

      // If browser visits web pages: render full React SPA
      const acceptHeader = req.headers.get('Accept') || '';
      if (
        (p === '/' || p === '/classroom' || p === '/printed-pages') &&
        (acceptHeader.includes('text/html') || !p.startsWith('/api/'))
      ) {
        return env.ASSETS.fetch(req);
      }
    }

    // ── JWT Authentication (Option A) ──
    // Printed pages, thumbnails, public scans, and health discovery remain public.
    const authRequired = Boolean(env.JWT_SECRET) || isEnabled(env.REQUIRE_AUTH);
    const isPublic =
      p === '/' ||
      p === '/api/health' ||
      p.startsWith('/thumbnails/') ||
      p.startsWith('/pages/') ||
      p === '/printed-pages' ||
      p === '/api/printed-pages' ||
      p.startsWith('/lesson/') ||
      p === '/api/thumbnails';

    if (authRequired && !isPublic) {
      if (!env.JWT_SECRET) {
        return jsonResponse({
          status: 'error',
          code: 'AUTH_NOT_CONFIGURED',
          error: 'Authentication is required but JWT_SECRET is not configured on this deployment.',
        }, 503);
      }

      const token = extractJwtFromRequest(req);
      if (!token) {
        return jsonResponse({
          status: 'error',
          code: 'UNAUTHORIZED',
          error: 'Authentication required. Provide a signed JWT in Authorization, ?token=, or jwt_token cookie.',
        }, 401);
      }

      const verification = await verifyJwt(token, env.JWT_SECRET);
      if (!verification.valid || !verification.payload) {
        return jsonResponse({
          status: 'error',
          code: 'INVALID_TOKEN',
          error: verification.error || 'Invalid or expired JWT token',
        }, 401);
      }

      const pathSegments = p.split('/').filter(Boolean);
      const subjectParam = url.searchParams.get('subject') ||
        (pathSegments[0] === 'api' && pathSegments[1] === 'courses'
          ? (pathSegments[2] === 'classrooms' ? pathSegments[3] : pathSegments[2])
          : pathSegments[0] === 'classroom' && pathSegments.length >= 4
            ? pathSegments[1]
            : '');
      if (subjectParam && !isCourseAuthorized(verification.payload, subjectParam)) {
        return jsonResponse({
          status: 'error',
          code: 'FORBIDDEN',
          error: `Access to course subject '${subjectParam}' is not permitted for this user account.`,
        }, 403);
      }
    }

    // ── 1. Health & Discovery API ──────────────────────────────────────
    if (p === '/' || p === '/api/health') {
      return jsonResponse({
        status: 'ok',
        service: 'lesson-viewer-worker',
        version: '2.0.0',
        endpoints: {
          printed_pages: '/printed-pages?subject=...&unit=...&lesson=...&start=...&end=...&total=...',
          lesson_html: '/api/lesson-html?subject=...&unit=...&lesson=...',
          process_lesson: 'POST /api/process-lesson (accepts JSON lesson payload)',
          classroom_proxy: '/classroom/{subject}/{unit}/{lesson}/{id}/classdata.json',
          classrooms_proxy: '/classrooms/{subject}/{unit}/{lesson}/{id}/classdata.json',
          image_proxy: '/pages/{key}',
          thumbnails: '/api/thumbnails',
          scan_harby: '/api/scan-harby',
          migrate_harby: '/api/migrate-harby',
        },
        ts: new Date().toISOString(),
      });
    }

    // ── 2. Interactive HTML Lesson Renderer (/api/lesson-html, /content-html, /api/process-lesson) ──
    if (p === '/api/lesson-html' || p === '/content-html' || p === '/api/process-lesson' || p === '/api/render-lesson') {
      let bodyData: any = {};
      if (req.method === 'POST') {
        try {
          bodyData = await req.json();
        } catch (_e) {
          bodyData = {};
        }
      }

      const subject = url.searchParams.get('subject') || bodyData.subject_code || bodyData.subject || 'subject';
      const unit = url.searchParams.get('unit') || bodyData.unit_code || bodyData.unit_id || 'u1';
      const lesson = url.searchParams.get('lesson') || bodyData.lesson_code || bodyData.lesson_id || 'l1';
      const subjectTitle = url.searchParams.get('subject_title') || bodyData.subject_name || bodyData.subject || subject;
      const lessonTitle = url.searchParams.get('lesson_title') || bodyData.lesson_name || bodyData.title || `${subject} - ${unit} ${lesson}`;
      const startPage = parseInt(url.searchParams.get('start') || bodyData.start_page || '1', 10);
      const endPage = parseInt(url.searchParams.get('end') || bodyData.end_page || '10', 10);

      const contentPages = bodyData.content_pages || [];
      const questions = bodyData.questions || [];
      const flashcards = bodyData.flashcards || [];

      const renderedHtml = renderLessonHtmlContent({
        subject,
        subjectTitle,
        unit,
        lesson,
        lessonTitle,
        contentPages,
        questions,
        flashcards,
        startPage,
        endPage,
      });

      return htmlResponse(renderedHtml, 300);
    }

    // ── 3. Printed Pages Web Viewer (/printed-pages, /lesson/..., /api/printed-pages) ──
    if (p === '/printed-pages' || p === '/api/printed-pages' || p.startsWith('/lesson/')) {
      let s = url.searchParams.get('subject') || '';
      let u = url.searchParams.get('unit') || '';
      let l = url.searchParams.get('lesson') || '';
      const start = parseInt(url.searchParams.get('start') || '1', 10);
      const endParam = parseInt(url.searchParams.get('end') || '0', 10);
      const totalParam = parseInt(url.searchParams.get('total') || '0', 10);

      if (p.startsWith('/lesson/')) {
        const segments = p.split('/').filter(Boolean);
        if (segments.length >= 4) {
          s = s || segments[1];
          u = u || segments[2];
          l = l || segments[3];
        }
      }

      if (!s || !u || !l) {
        return jsonResponse({ error: 'Required parameters: ?subject=...&unit=...&lesson=...' }, 400);
      }

      const uClean = cleanUnitCode(u);
      const lClean = cleanLessonCode(l);
      const end = endParam > 0 ? endParam : (totalParam > 0 ? (start + totalParam - 1) : 10);

      let pagesMarkup = '';
      for (let i = start; i <= end; i++) {
        const cleanKey = `${s}/${uClean}/${lClean}/page-${i}`;
        const relativeIndex = (i - start) + 1;
        const relativeKey = `${s}/${uClean}/${lClean}/page-${relativeIndex}`;
        const legacyKey = `${s}/${s}_c${uClean.replace(/^u/i, '')}/${s}_c${uClean.replace(/^u/i, '')}l${lClean.replace(/^l/i, '')}/page-${i}`;

        pagesMarkup += `
          <div class="page-card" id="page-${i}">
            <div class="page-header">
              <span class="page-pill">صفحة ${i}</span>
              <a href="/pages/${cleanKey}-w1200.webp" target="_blank" class="zoom-btn" title="فتح الصورة بدقة عالية">🔍 تكبير فائق</a>
            </div>
            <div class="img-wrapper">
              <img 
                src="/pages/${cleanKey}-w900.webp"
                srcset="/pages/${cleanKey}-w600.webp 600w, /pages/${cleanKey}-w900.webp 900w, /pages/${cleanKey}-w1200.webp 1200w"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 92vw, 1000px"
                alt="صفحة ${i}"
                loading="lazy"
                decoding="async"
                data-clean="${cleanKey}"
                data-relative="${relativeKey}"
                data-legacy="${legacyKey}"
                onerror="handleImgError(this, ${i})"
              />
            </div>
          </div>`;
      }

      return htmlResponse(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>كتاب الطالب — ${s} (${uClean} / ${lClean})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #131b2e;
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #06b6d4;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      font-family: 'Cairo', 'Tajawal', system-ui, sans-serif;
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .navbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--card-border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .navbar-title { display: flex; flex-direction: column; gap: 2px; }
    .navbar-title h1 { font-size: 1.1rem; font-weight: 800; color: #fff; }
    .navbar-title span { font-size: 0.8rem; color: var(--accent); font-weight: 600; }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border: 1px solid var(--card-border);
      padding: 7px 14px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }
    .btn:hover { background: var(--accent); color: #090d16; }
    .reader-container {
      width: 100%;
      max-width: 980px;
      margin: 0 auto;
      padding: 24px 16px 60px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .page-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .page-header {
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--card-border);
    }
    .page-pill {
      font-size: 0.75rem;
      font-weight: 800;
      color: var(--accent);
      background: rgba(6, 182, 212, 0.12);
      padding: 2px 10px;
      border-radius: 6px;
    }
    .zoom-btn { font-size: 0.75rem; color: var(--text-muted); text-decoration: none; }
    .zoom-btn:hover { color: #fff; }
    .img-wrapper { width: 100%; background: #000; display: flex; justify-content: center; align-items: center; min-height: 200px; }
    .img-wrapper img { width: 100%; height: auto; display: block; }
    .error-box { padding: 40px 20px; text-align: center; color: #ef4444; font-size: 0.9rem; font-weight: 600; }
  </style>
  <script>
    function handleImgError(img, pageNum) {
      const stage = img.dataset.stage || '0';
      const rel = img.dataset.relative;
      const leg = img.dataset.legacy;

      if (stage === '0' && rel) {
        // Stage 1: Try relative 1-based offset
        img.dataset.stage = '1';
        img.removeAttribute('srcset');
        img.src = '/pages/' + rel + '-w900.webp';
      } else if (stage === '1' && leg) {
        // Stage 2: Try legacy concatenated path
        img.dataset.stage = '2';
        img.removeAttribute('srcset');
        img.src = '/pages/' + leg + '-w900.webp';
      } else if (stage === '2') {
        // Stage 3: Try public R2 direct fallback
        img.dataset.stage = '3';
        img.removeAttribute('srcset');
        img.src = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/' + img.dataset.clean + '-w900.webp';
      } else {
        img.parentElement.innerHTML = '<div class="error-box">⚠️ لا تتوفر صورة لهذه الصفحة (' + pageNum + ')</div>';
      }
    }
  </script>
</head>
<body>
  <header class="navbar">
    <div class="navbar-title">
      <h1>📖 صفحات الكتاب المدرسي</h1>
      <span>${s} • ${uClean} • ${lClean} (الصفحات ${start} - ${end})</span>
    </div>
    <div>
      <button class="btn" onclick="window.scrollTo({top:0, behavior:'smooth'})">⬆ للأعلى</button>
      <button class="btn" onclick="window.print()">🖨️ طباعة</button>
    </div>
  </header>
  <main class="reader-container">
    ${pagesMarkup}
  </main>
</body>
</html>`, 300);
    }

    // ── 4. Virtual Classroom & TTS Audio Streamer (/classroom/..., /classrooms/...) ──
    if (p.startsWith('/classroom/') || p.startsWith('/classrooms/')) {
      const subPath = p.replace(/^\/(classroom|classrooms)\//, '');
      let key = `classrooms/${subPath}`;
      const acceptsHtml = (req.headers.get('accept') || '').includes('text/html');

      // If requested as directory or without file extension (e.g. /classroom/bio10p1/u1/l1/KbOpmXdyXa)
      if (!subPath.includes('.')) {
        key = `classrooms/${subPath.replace(/\/$/, '')}/classdata.json`;
      }

      // Check if client is requesting classdata.json or export.json -> normalize audio URLs
      if (key.endsWith('.json')) {
        const res = await fetchR2Object(env, 'courses', key);
        if (res) {
          try {
            const rawJson = await res.json();
            const segments = subPath.split('/');
            // Expecting: [subject, unit, lesson, classroomId, filename.json]
            const s = segments[0] || 'subject';
            const u = segments[1] || 'u1';
            const l = segments[2] || 'l1';
            const cId = segments[3] || segments[0];

            const normalized = normalizeClassroomData(rawJson, s, u, l, cId);
            
            // If opened in a web browser, render the full interactive Classroom Web Player!
            if (acceptsHtml && url.searchParams.get('format') !== 'json') {
              return htmlResponse(renderClassroomPlayerHtml(normalized, s, u, l, cId), 300);
            }
            return jsonResponse(normalized, 200);
          } catch (_e) {
            // Return raw stream if JSON parse failed
          }
        }
      }

      // Serve binary / audio / other assets directly
      const assetRes = await fetchR2Object(env, 'courses', key);
      if (assetRes) return assetRes;

      return new Response('Classroom asset not found', { status: 404, headers: CORS });
    }

    // ── 5. HTML Direct Lessons (/html/...) ──
    if (p.startsWith('/html/')) {
      const subKey = p.slice('/html/'.length).replace(/^\/+/, '');
      const key = subKey.startsWith('classrooms/') ? subKey : subKey;

      // 1. Try static pre-rendered HTML in R2
      const res = await fetchR2Object(env, 'courses', key);
      if (res) return res;

      // 2. If not found in R2, dynamically render lesson HTML
      const cleanSub = subKey.replace(/\.html$/i, '');
      const parts = cleanSub.split('/');
      const filenamePart = parts[parts.length - 1];
      const subject = parts[0] || filenamePart.replace(/_.*$/, '');
      const uMatch = filenamePart.match(/[cu](\d+)/i);
      const lMatch = filenamePart.match(/[cl](\d+)$/i);
      const u = uMatch ? `u${uMatch[1]}` : 'u1';
      const l = lMatch ? `l${lMatch[1]}` : 'l1';

      const dynamicHtml = renderLessonHtmlContent({
        subject,
        unit: u,
        lesson: l,
        lessonTitle: `${subject} - ${u} ${l}`,
        startPage: 1,
        endPage: 10,
      });

      return htmlResponse(dynamicHtml, 300);
    }

    // ── 6. Course Thumbnails (/api/thumbnails, /thumbnails/...) ──
    if (p === '/api/thumbnails' || p.startsWith('/api/thumbnails/')) {
      const grade = url.searchParams.get('grade') || '';
      const subject = url.searchParams.get('subject') || (p.startsWith('/api/thumbnails/') ? p.slice('/api/thumbnails/'.length) : '');

      let keys: string[] = [];
      if (env.COURSES_IMAGES) {
        const listed = await env.COURSES_IMAGES.list({ prefix: 'thumbnails/', limit: 1000 });
        keys = listed.objects.map(o => o.key);
      } else {
        const s3Client = getS3Client(env);
        if (s3Client) {
          const r2Url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/coursesimages?prefix=thumbnails%2F&max-keys=1000`;
          const res = await s3Client.fetch(r2Url);
          if (res.ok) {
            const xml = await res.text();
            keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
          }
        }
      }

      let thumbs = keys.map(k => {
        const filename = k.replace('thumbnails/', '');
        const subjectCode = filename.replace(/\.[^/.]+$/, '');
        return {
          subject_code: subjectCode,
          filename,
          key: k,
          url: `/thumbnails/${filename}`,
          public_url: `${PUBLIC_R2_IMAGES}/${k}`,
        };
      });

      if (subject) {
        thumbs = thumbs.filter(t => t.subject_code === subject || t.filename.startsWith(subject));
      } else if (grade) {
        thumbs = thumbs.filter(t => t.subject_code.includes(grade) || t.filename.includes(grade));
      }

      return jsonResponse({
        total: thumbs.length,
        filter: { grade: grade || null, subject: subject || null },
        thumbnails: thumbs,
      });
    }

    if (p.startsWith('/thumbnails/')) {
      const filename = p.slice('/thumbnails/'.length);
      const key = `thumbnails/${filename}`;
      const res = await fetchR2Object(env, 'coursesimages', key);
      if (res) return res;
      return new Response('Thumbnail not found', { status: 404, headers: CORS });
    }

    // ── 7. Private Image Proxy (/pages/...) ──
    if (p.startsWith('/pages/')) {
      const rawKey = p.slice('/pages/'.length);
      
      // Try exact key first
      let res = await fetchR2Object(env, 'coursesimages', rawKey);
      if (res) return res;

      // Try clean prefix standard if legacy was given
      const parts = rawKey.split('/');
      if (parts.length >= 3) {
        const s = parts[0];
        const uClean = cleanUnitCode(parts[1]);
        const lClean = cleanLessonCode(parts[2]);
        const rest = parts.slice(3).join('/');
        const cleanCandidate = `${s}/${uClean}/${lClean}/${rest}`;
        res = await fetchR2Object(env, 'coursesimages', cleanCandidate);
        if (res) return res;
      }

      return new Response('Image not found', { status: 404, headers: CORS });
    }

    // ── 8. HARBY Bucket Scan & Migration (/api/scan-harby, /api/migrate-harby) ──
    if (p === '/api/scan-harby') {
      if (!env.HARBY) return jsonResponse({ error: 'HARBY bucket binding not found' }, 500);

      const prefix = url.searchParams.get('prefix') || '';
      const cursor = url.searchParams.get('cursor') || undefined;
      const listed = await env.HARBY.list({ prefix, cursor, limit: 1000 });

      return jsonResponse({
        total_listed: listed.objects.length,
        truncated: listed.truncated,
        cursor: (listed as any).cursor,
        sample_keys: listed.objects.slice(0, 50).map(o => ({ key: o.key, size: o.size })),
      });
    }

    if (p === '/api/migrate-harby') {
      if (!env.HARBY || !env.COURSES) return jsonResponse({ error: 'Required bucket bindings (HARBY or COURSES) missing' }, 500);

      const prefix = url.searchParams.get('prefix') || '';
      const cursor = url.searchParams.get('cursor') || undefined;
      const listed = await env.HARBY.list({ prefix, cursor, limit: 500 });

      let moved = 0;
      let skipped = 0;
      const logs: string[] = [];

      for (const obj of listed.objects) {
        const sourceKey = obj.key;
        let targetKey = sourceKey.startsWith('classrooms/') ? sourceKey : `classrooms/${sourceKey}`;

        try {
          const item = await env.HARBY.get(sourceKey);
          if (item) {
            await env.COURSES.put(targetKey, item.body, {
              httpMetadata: item.httpMetadata,
              customMetadata: item.customMetadata,
            });
            moved++;
            if (logs.length < 20) logs.push(`Copied: ${sourceKey} -> ${targetKey}`);
          }
        } catch (_e) {
          skipped++;
        }
      }

      return jsonResponse({
        batch_size: listed.objects.length,
        moved_count: moved,
        skipped_count: skipped,
        truncated: listed.truncated,
        next_cursor: (listed as any).cursor,
        sample_logs: logs,
      });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};
