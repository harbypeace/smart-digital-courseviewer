const WORKER_BASE = 'https://lesson-viewer.abduh-merzah.workers.dev';

const endpoints = [
  {
    name: '1. Health & Discovery API',
    url: `${WORKER_BASE}/api/health`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '2. Printed Pages Full RTL Reader Web View',
    url: `${WORKER_BASE}/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '3. Dynamic HTML Lesson Renderer (GET)',
    url: `${WORKER_BASE}/api/lesson-html?subject=bio10p1&unit=u1&lesson=l1&lesson_title=${encodeURIComponent('الخلية ووظائفها')}`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '4. Dynamic Lesson Processing Engine (POST)',
    url: `${WORKER_BASE}/api/process-lesson`,
    method: 'POST',
    body: {
      subject_code: 'adb10p1',
      unit_code: 'u1',
      lesson_code: 'l1',
      lesson_name: 'الأدب في العصر الجاهلي',
      content_pages: [
        {
          title: 'مدخل إلى الشعر الجاهلي',
          text: 'يعد الشعر الجاهلي ديوان العرب وسجل مفاخرهم.\n\n![شكل توضيحي](adab10u1l1p11_5.jpeg)',
          images: ['adab10u1l1p11_5.jpeg'],
          page_number: 11
        }
      ]
    },
    expectedStatus: 200,
  },
  {
    name: '5. Virtual Classroom Data & Voice Normalizer',
    url: `${WORKER_BASE}/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '6. Classroom Voiceover TTS Audio Stream',
    url: `${WORKER_BASE}/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/scene_00_speech_00.mp3`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '7. Course Thumbnails Listing API',
    url: `${WORKER_BASE}/api/thumbnails?grade=10`,
    method: 'GET',
    expectedStatus: 200,
  },
  {
    name: '8. Thumbnail Direct Image Stream',
    url: `${WORKER_BASE}/thumbnails/adb10p1.webp`,
    method: 'GET',
    expectedStatus: 200,
  },
];

async function runLiveTests() {
  console.log(`🌐 Testing Live Cloudflare Worker Endpoints at: ${WORKER_BASE}\n`);
  let passed = 0;
  let failed = 0;

  for (const ep of endpoints) {
    try {
      const options = {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      };

      const res = await fetch(ep.url, options);
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const isHtml = res.headers.get('content-type')?.includes('text/html');
      const isAudio = res.headers.get('content-type')?.includes('audio');

      let preview = '';
      if (isJson) {
        const json = await res.json();
        preview = JSON.stringify(json).slice(0, 100) + '...';
      } else if (isHtml) {
        const text = await res.text();
        preview = `HTML length: ${text.length} chars (title: ${text.includes('كتاب') || text.includes('الدرس')})`;
      } else if (isAudio) {
        const buf = await res.arrayBuffer();
        preview = `Audio binary: ${buf.byteLength} bytes`;
      } else {
        preview = `Status: ${res.status}`;
      }

      if (res.status === ep.expectedStatus) {
        passed++;
        console.log(`✅ [PASS] ${ep.name}`);
        console.log(`   URL: ${ep.url}`);
        console.log(`   Status: ${res.status} | Content-Type: ${res.headers.get('content-type')} | ${preview}\n`);
      } else {
        failed++;
        console.log(`❌ [FAIL] ${ep.name}`);
        console.log(`   URL: ${ep.url}`);
        console.log(`   Status: ${res.status} (Expected ${ep.expectedStatus}) | ${preview}\n`);
      }
    } catch (err) {
      failed++;
      console.log(`❌ [ERROR] ${ep.name}`);
      console.log(`   URL: ${ep.url}`);
      console.log(`   Error: ${err.message}\n`);
    }
  }

  console.log(`==================================================`);
  console.log(`📊 Live Test Summary: ${passed} Passed, ${failed} Failed out of ${endpoints.length} Total`);
  console.log(`==================================================`);
}

runLiveTests();
