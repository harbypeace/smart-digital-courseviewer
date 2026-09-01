import worker from './src/index.ts';

async function runComprehensiveTests() {
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 RUNNING COMPREHENSIVE CLOUDFLARE WORKER TEST SUITE');
  console.log('════════════════════════════════════════════════════════════════════════════\n');

  // The suite uses public fixtures intentionally; production deployments must keep this flag false.
  const mockEnv = { ALLOW_PUBLIC_R2_FALLBACK: 'true' };
  let passed = 0;
  let failed = 0;
  const tests = [];

  const runReq = async (urlStr, method = 'GET', body = null, headers = {}) => {
    const req = new Request(urlStr, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    });
    return worker.fetch(req, mockEnv);
  };

  async function test(title, fn) {
    tests.push({ title, fn });
  }

  // 1. Health & Discovery
  test('1. Health Check GET /api/health', async () => {
    const res = await runReq('https://worker.local/api/health');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (json.status !== 'ok' || json.service !== 'lesson-viewer-worker') {
      throw new Error(`Unexpected body: ${JSON.stringify(json)}`);
    }
    if (!json.endpoints || !json.endpoints.printed_pages) {
      throw new Error('Endpoints discovery object missing');
    }
    return `Service: ${json.service}, Version: ${json.version}, Status: ${json.status}`;
  });

  // 2. CORS Preflight OPTIONS
  test('2. CORS Preflight OPTIONS /api/health', async () => {
    const res = await runReq('https://worker.local/api/health', 'OPTIONS');
    if (res.status !== 204) throw new Error(`Status ${res.status}`);
    const cors = res.headers.get('Access-Control-Allow-Origin');
    if (cors !== '*') throw new Error(`CORS header missing or wrong: ${cors}`);
    return `Status: 204, CORS Allow-Origin: ${cors}`;
  });

  // 3. Printed Pages Web Viewer GET /printed-pages
  test('3. Printed Pages Web Viewer GET /printed-pages', async () => {
    const res = await runReq('https://worker.local/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error(`Wrong Content-Type: ${ct}`);
    const html = await res.text();
    if (!html.includes('كتاب الطالب') || !html.includes('page-11')) {
      throw new Error('Missing expected page markup in HTML');
    }
    return `HTML Size: ${html.length} chars, Contains Arabic Book Layout`;
  });

  // 4. Printed Pages Route /lesson/:subject/:unit/:lesson
  test('4. Route Path Alias GET /lesson/adb10p1/u1/l1', async () => {
    const res = await runReq('https://worker.local/lesson/adb10p1/u1/l1?start=11&end=13');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('adb10p1') || !html.includes('page-11')) {
      throw new Error('Missing expected page markup in HTML');
    }
    return `HTML Size: ${html.length} chars, Path parsed correctly`;
  });

  // 5. Dynamic HTML Lesson GET /api/lesson-html
  test('5. Dynamic HTML Lesson GET /api/lesson-html', async () => {
    const res = await runReq('https://worker.local/api/lesson-html?subject=bio10p1&unit=u1&lesson=l1&lesson_title=%D8%A7%D9%84%D8%AE%D9%84%D9%8A%D8%A9');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('الخلية')) throw new Error('Lesson title not rendered in HTML');
    return `HTML Size: ${html.length} chars, Title rendered`;
  });

  // 6. Dynamic Lesson Processing POST /api/process-lesson
  test('6. Dynamic Lesson Processing POST /api/process-lesson', async () => {
    const payload = {
      subject_code: 'adb10p1',
      subject_name: 'الأدب العربي',
      unit_code: 'u1',
      lesson_code: 'l1',
      lesson_name: 'عصر صدر الإسلام',
      content_pages: [
        {
          title: 'أثر الإسلام في الشعر',
          text: 'أثر الإسلام عميقاً في بنية القصيدة العربية ولغتها.\n\n![صورة](adab_pic.jpeg)',
          images: ['adab_pic.jpeg'],
          page_number: 22,
        },
      ],
      questions: [
        {
          question: 'ما أثر الإسلام في لغة الشعر؟',
          options: ['هذب الألفاظ', 'أضعف البيان', 'ألغى الشعر'],
          answer: 'هذب الألفاظ واقتبس من القرآن الكريم والحديث الشريف',
        },
      ],
      flashcards: [
        { front: 'شعر الدعوة الإسلامية', back: 'شعر حسان بن ثابت وكعب بن مالك' },
      ],
    };
    const res = await runReq('https://worker.local/api/process-lesson', 'POST', payload);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    if (!html.includes('أثر الإسلام في الشعر') || !html.includes('هذب الألفاظ') || !html.includes('حسان بن ثابت')) {
      throw new Error('Lesson contents, questions, or flashcards missing from rendered output');
    }
    if (!html.includes('pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/adab_pic.jpeg')) {
      throw new Error('Image URL not transformed to clean R2 path');
    }
    return `HTML Size: ${html.length} chars, Markdown transformed, Questions & Flashcards verified`;
  });

  // 7. Classroom Data Normalization GET /classroom/.../classdata.json
  test('7. Classroom Data Normalization GET /classroom/.../classdata.json', async () => {
    const res = await runReq('https://worker.local/classroom/adb10p1/u1/l1/1v_nRmh_wh/classdata.json');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!json.scenes || !Array.isArray(json.scenes)) throw new Error('Missing scenes array in classroom data');
    const allActions = json.scenes.flatMap(s => s.actions || []);
    const speechAct = allActions.find(a => a.type === 'speech' || a.audioUrl);
    if (!speechAct) throw new Error('No speech actions found in classdata');
    if (speechAct.audioUrl.includes('open.maic.chat')) {
      throw new Error('Dead domain open.maic.chat still present in audioUrl');
    }
    if (!speechAct.audioUrl.includes('/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/')) {
      throw new Error(`Audio URL not properly normalized: ${speechAct.audioUrl}`);
    }
    return `Classroom ID: ${json.id}, Scenes: ${json.scenes.length}, Audio URL normalized to R2`;
  });

  // 8. Classroom TTS Audio Streaming GET /classrooms/.../tts/...mp3
  test('8. Classroom Voiceover TTS Audio Streaming GET /classrooms/.../tts/...mp3', async () => {
    const res = await runReq('https://worker.local/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/scene_00_speech_00.mp3');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get('content-type');
    if (ct !== 'audio/mpeg') throw new Error(`Wrong Content-Type: ${ct}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 1000) throw new Error(`Audio buffer unexpectedly small: ${buf.byteLength} bytes`);
    return `Status: 200, Content-Type: ${ct}, Size: ${(buf.byteLength / 1024).toFixed(1)} KB`;
  });

  // 9. Course Thumbnails Listing GET /api/thumbnails
  test('9. Course Thumbnails Listing GET /api/thumbnails', async () => {
    const res = await runReq('https://worker.local/api/thumbnails');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (typeof json.total !== 'number' || !Array.isArray(json.thumbnails)) {
      throw new Error('Unexpected thumbnails response structure');
    }
    return `Total thumbnails: ${json.total}, Sample: ${json.thumbnails[0]?.subject_code || 'none'}`;
  });

  // 10. Filtered Thumbnails GET /api/thumbnails?grade=10
  test('10. Filtered Thumbnails GET /api/thumbnails?grade=10', async () => {
    const res = await runReq('https://worker.local/api/thumbnails?grade=10');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.thumbnails)) throw new Error('Thumbnails array missing');
    const allGrade10 = json.thumbnails.every(t => t.subject_code.includes('10'));
    if (!allGrade10) throw new Error('Filter did not restrict to grade 10');
    return `Filtered count: ${json.total} items (all grade 10)`;
  });

  // 11. Thumbnail Direct Image GET /thumbnails/adb10p1.webp
  test('11. Thumbnail Direct Image GET /thumbnails/adb10p1.webp', async () => {
    const res = await runReq('https://worker.local/thumbnails/adb10p1.webp');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get('content-type');
    if (!ct?.includes('image/webp')) throw new Error(`Wrong Content-Type: ${ct}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) throw new Error('Empty image payload');
    return `Status: 200, Content-Type: ${ct}, Size: ${(buf.byteLength / 1024).toFixed(1)} KB`;
  });

  // 12. Printed Page Image Proxy GET /pages/adb10p1/u1/l1/page-11-w900.webp
  test('12. Page Image Proxy GET /pages/adb10p1/u1/l1/page-11-w900.webp', async () => {
    const res = await runReq('https://worker.local/pages/adb10p1/u1/l1/page-11-w900.webp');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const ct = res.headers.get('content-type');
    if (!ct?.includes('image/webp')) throw new Error(`Wrong Content-Type: ${ct}`);
    const buf = await res.arrayBuffer();
    return `Status: 200, Content-Type: ${ct}, Size: ${(buf.byteLength / 1024).toFixed(1)} KB`;
  });

  // 13. Missing Params Error Handling
  test('13. Validation Error: Missing Query Params GET /printed-pages', async () => {
    const res = await runReq('https://worker.local/printed-pages');
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const json = await res.json();
    if (!json.error) throw new Error('Missing error message in JSON');
    return `Status: 400, Error Message: "${json.error}"`;
  });

  // 14. 404 Route Not Found
  test('14. Route Not Found Handling GET /non-existent-endpoint', async () => {
    const res = await runReq('https://worker.local/non-existent-endpoint');
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
    return `Status: 404 correctly returned`;
  });

  // 15. 405 Method Not Allowed
  test('15. Method Not Allowed PUT /api/health', async () => {
    const res = await runReq('https://worker.local/api/health', 'PUT');
    if (res.status !== 405) throw new Error(`Expected 405, got ${res.status}`);
    return `Status: 405 correctly returned`;
  });

  // 16. Dynamic HTML Lesson Fallback GET /html/...
  test('16. Dynamic HTML Lesson Fallback GET /html/bioearth10/bioearth10_u1l1.html', async () => {
    const res = await runReq('https://worker.local/html/bioearth10/bioearth10_u1l1.html');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error(`Wrong Content-Type: ${ct}`);
    const html = await res.text();
    if (!html.includes('bioearth10') && !html.includes('الدرس')) throw new Error('Lesson HTML markup missing');
    return `Status: 200, HTML Length: ${html.length} chars (Full responsive layout)`;
  });

  // 17. Interactive Classroom Web Player GET /classroom/... (HTML view)
  test('17. Interactive Classroom Web Player GET /classroom/adb10p1/u1/l1/1v_nRmh_wh', async () => {
    const res = await runReq('https://worker.local/classroom/adb10p1/u1/l1/1v_nRmh_wh', 'GET', null, { 'Accept': 'text/html' });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error(`Wrong Content-Type: ${ct}`);
    const html = await res.text();
    if (!html.includes('الغرفة الصفية الافتراضية') || !html.includes('ttsAudio')) {
      throw new Error('Classroom player components missing from HTML');
    }
    return `Status: 200, HTML Length: ${html.length} chars (Interactive player with audio narration)`;
  });

  // Execute all tests
  for (const t of tests) {
    try {
      const detail = await t.fn();
      passed++;
      console.log(`✅ [PASS] ${t.title}`);
      if (detail) console.log(`   ↳ ${detail}`);
    } catch (err) {
      failed++;
      console.log(`❌ [FAIL] ${t.title}`);
      console.log(`   ↳ Error: ${err.message}`);
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log(`📊 FINAL TEST SUMMARY: ${passed} Passed, ${failed} Failed out of ${tests.length} Total Tests`);
  console.log('════════════════════════════════════════════════════════════════════════════');
  if (failed === 0) {
    console.log('🎉 ALL 15 WORKER SUITE TESTS PASSED 100% SUCCESSFULLY!');
  }
}

runComprehensiveTests();
