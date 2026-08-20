const BASE = 'http://127.0.0.1:8788';

async function fetchUrl(path, options = {}) {
  const url = `${BASE}${path}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url, options);
    const duration = Math.round(performance.now() - t0);
    const contentType = res.headers.get('content-type') || '';
    let bodySnippet = '';
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const buf = await res.arrayBuffer();
      bodySnippet = `Audio binary: ${buf.byteLength} bytes`;
    } else {
      const text = await res.text();
      bodySnippet = text.slice(0, 140).replace(/\n/g, ' ');
    }
    return {
      path,
      status: res.status,
      ok: res.ok,
      duration: `${duration}ms`,
      contentType,
      bodySnippet,
    };
  } catch (err) {
    return {
      path,
      status: 'FETCH_ERROR',
      ok: false,
      error: err.message,
    };
  }
}

async function runAllTests() {
  console.log('--- Waiting for Pages Dev server to be ready ---');
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok || res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    console.error('Server did not respond within 20 seconds.');
    process.exit(1);
  }

  console.log('✅ Pages dev server is READY! Running tests:\n');

  const tests = [
    { name: '1. Root Test Showcase UI', path: '/' },
    { name: '2. Printed Pages Reader (adb10p1, p11-15)', path: '/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15' },
    { name: '3. Printed Pages Reader (bio10p1, p9-13)', path: '/printed-pages?subject=bio10p1&unit=u1&lesson=l1&start=9&end=13' },
    { name: '4. Classroom Player View (adb10p1)', path: '/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh' },
    { name: '5. Classroom Data API Resolver', path: '/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh' },
    { name: '6. Private Courses TTS Audio Stream', path: '/api/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/scene_00_speech_00.mp3' },
    { name: '7. HTML Lesson Viewer (hadith11)', path: '/html?subject=hadith11&unit=u1&lesson=l1&file=hadith11/hadith11_u1l1.html' },
    { name: '8. Dynamic HTML Lesson Fallback', path: '/html?subject=bio10p1&unit=u1&lesson=l1' },
  ];

  let passed = 0;
  for (const t of tests) {
    const result = await fetchUrl(t.path, t.options);
    const isSuccess = result.ok || result.status === 200 || result.status === 206;
    if (isSuccess) passed++;
    console.log(`[${isSuccess ? 'PASS' : 'FAIL'}] ${t.name}: HTTP ${result.status} (${result.duration || '-'})`);
    console.log(`       Content-Type: ${result.contentType}`);
    console.log(`       Data: ${result.bodySnippet || result.error || '-'}\n`);
  }

  console.log(`==================================================`);
  console.log(`📊 Result: ${passed}/${tests.length} tests passed successfully.`);
  console.log(`==================================================`);
}

runAllTests();
