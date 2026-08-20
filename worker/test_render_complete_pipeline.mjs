import worker from './src/index.ts';

async function testWorker() {
  console.log('🚀 Testing Complete Cloudflare Worker Lesson Processing & Rendering Pipeline...\n');

  const mockEnv = {};

  const runRequest = async (urlStr, method = 'GET', body = null) => {
    const req = new Request(urlStr, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : null,
    });
    return worker.fetch(req, mockEnv);
  };

  let passed = 0;
  let total = 0;

  const assertTest = async (name, url, method = 'GET', body = null, checkFn = (res, data) => res.status === 200) => {
    total++;
    try {
      const res = await runRequest(url, method, body);
      const isHtml = res.headers.get('content-type')?.includes('text/html');
      const isJson = res.headers.get('content-type')?.includes('application/json');
      const isAudio = res.headers.get('content-type')?.includes('audio');
      
      let data = null;
      if (isJson) data = await res.json();
      else if (isHtml) data = await res.text();
      else if (isAudio) data = await res.arrayBuffer();

      const ok = checkFn(res, data);
      if (ok) {
        passed++;
        console.log(`✅ [PASS] ${name}`);
        if (isJson) console.log(`   Result:`, JSON.stringify(data).slice(0, 120) + '...');
        if (isHtml) console.log(`   HTML Length: ${data.length} chars (Title/Tag found: ${data.includes('كتاب') || data.includes('الدرس')})`);
        if (isAudio) console.log(`   Audio Byte Length: ${data.byteLength}`);
      } else {
        console.log(`❌ [FAIL] ${name} (Status: ${res.status})`);
      }
    } catch (err) {
      console.log(`❌ [ERROR] ${name}: ${err.message}`);
    }
    console.log('--------------------------------------------------');
  };

  // 1. Health API
  await assertTest(
    '1. Worker Health & Discovery API',
    'https://lesson-viewer.local/api/health',
    'GET',
    null,
    (res, data) => res.status === 200 && data.status === 'ok'
  );

  // 2. Printed Pages Web Viewer
  await assertTest(
    '2. Printed Pages RTL Web Viewer (/printed-pages)',
    'https://lesson-viewer.local/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15',
    'GET',
    null,
    (res, html) => res.status === 200 && html.includes('كتاب الطالب') && html.includes('handleImgError')
  );

  // 3. Dynamic Lesson HTML Generation via GET
  await assertTest(
    '3. Dynamic Lesson HTML Rendering via GET (/api/lesson-html)',
    'https://lesson-viewer.local/api/lesson-html?subject=bio10p1&unit=u1&lesson=l1&lesson_title=الخلية%20ووظائفها',
    'GET',
    null,
    (res, html) => res.status === 200 && html.includes('الخلية ووظائفها') && html.includes('inline-lesson-img')
  );

  // 4. Dynamic Lesson Processing via POST
  await assertTest(
    '4. Dynamic Lesson Processing via POST (/api/process-lesson)',
    'https://lesson-viewer.local/api/process-lesson',
    'POST',
    {
      subject_code: 'adb10p1',
      subject_name: 'الأدب العربي',
      unit_code: 'u1',
      lesson_code: 'l1',
      lesson_name: 'الأدب في العصر الجاهلي',
      content_pages: [
        {
          title: 'المعلقات وأصحابها',
          text: 'كانت المعلقات من أروع ما قيل في الشعر العربي.\n\n![شكل توضيحي](adab10u1l1p11_5.jpeg)',
          images: ['adab10u1l1p11_5.jpeg'],
          page_number: 11
        }
      ],
      questions: [
        {
          question: 'ما هي المعلقات؟',
          options: ['قصائد طوال اختيرت لجودتها', 'روايات نثرية', 'مقالات أدبية'],
          answer: 'قصائد طوال علقت على أستار الكعبة لجودتها'
        }
      ],
      flashcards: [
        { front: 'المعلقات', back: 'قصائد جاهلية نفيسة' }
      ]
    },
    (res, html) => res.status === 200 && html.includes('المعلقات') && html.includes('قصائد جاهلية نفيسة') && html.includes('adab10u1l1p11_5.jpeg')
  );

  // 5. Classroom Classdata Serving & URL Normalization
  await assertTest(
    '5. Classroom Asset Proxy & Audio URL Auto-Normalization (/classrooms/...)',
    'https://lesson-viewer.local/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json',
    'GET',
    null,
    (res, data) => {
      if (res.status !== 200 || !data.scenes) return false;
      const allActions = data.scenes.flatMap(s => s.actions || []);
      const speechAction = allActions.find(a => a.type === 'speech' || a.audioUrl);
      // Must NOT contain dead open.maic.chat domain and MUST have migrated R2 audio URL
      return speechAction && !speechAction.audioUrl.includes('open.maic.chat') && speechAction.audioUrl.includes('.r2.dev/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/');
    }
  );

  // 6. Audio File Streaming
  await assertTest(
    '6. Classroom Voiceover Audio Streaming (/classrooms/.../tts/scene_00_speech_00.mp3)',
    'https://lesson-viewer.local/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/scene_00_speech_00.mp3',
    'GET',
    null,
    (res, buffer) => res.status === 200 && res.headers.get('content-type') === 'audio/mpeg' && buffer.byteLength > 1000
  );

  // 7. Course Thumbnails
  await assertTest(
    '7. Course Thumbnails Listing (/api/thumbnails)',
    'https://lesson-viewer.local/api/thumbnails?grade=10',
    'GET',
    null,
    (res, data) => res.status === 200 && Array.isArray(data.thumbnails)
  );

  console.log(`\n🏁 Test Results: ${passed} / ${total} passed!`);
  if (passed === total) {
    console.log('🎉 ALL WORKER RENDERING PIPELINES ARE WORKING 100% CORRECTLY!');
  }
}

testWorker();
