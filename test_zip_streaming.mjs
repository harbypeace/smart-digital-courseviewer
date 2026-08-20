const BASE = 'http://127.0.0.1:8788';

async function fetchUrl(name, path, options = {}) {
  const url = `${BASE}${path}`;
  const t0 = performance.now();
  try {
    const res = await fetch(url, options);
    const duration = Math.round(performance.now() - t0);
    const contentType = res.headers.get('content-type') || '';
    let bodySnippet = '';
    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      const buf = await res.arrayBuffer();
      bodySnippet = `Binary stream: ${buf.byteLength} bytes`;
    } else {
      const text = await res.text();
      bodySnippet = text.slice(0, 140).replace(/\n/g, ' ');
    }
    const ok = res.ok || res.status === 200 || res.status === 206;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
    console.log(`       HTTP ${res.status} (${duration}ms) | Content-Type: ${contentType}`);
    console.log(`       Data: ${bodySnippet}\n`);
    return ok;
  } catch (err) {
    console.log(`[FAIL] ${name}: ${err.message}\n`);
    return false;
  }
}

async function main() {
  console.log('--- Testing Progressive ZIP Streaming on Cloudflare Pages ---\n');

  // Wait for server
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  let passed = 0;
  const tests = [
    {
      name: '1. ZIP Manifest Extraction (test-classroom.zip)',
      path: '/api/classroom-zip/data?zip=/samples/test-classroom.zip',
    },
    {
      name: '2. ZIP Scene Media Audio Stream',
      path: '/api/classroom-zip/media?zip=/samples/test-classroom.zip&file=audio/tts_s2_action_TZZsQaod.mp3',
    },
    {
      name: '3. ZIP Scene Audio Range Request (HTTP 206)',
      path: '/api/classroom-zip/media?zip=/samples/test-classroom.zip&file=audio/tts_s2_action_TZZsQaod.mp3',
      options: { headers: { Range: 'bytes=0-1024' } },
    },
    {
      name: '4. MAIC Package Manifest Extraction (quantum-computing.maic.zip)',
      path: '/api/classroom-zip/data?zip=/samples/quantum-computing.maic.zip',
    },
    {
      name: '5. Progressive Classroom Player Page with ZIP Mode',
      path: '/classroom?mode=zip&zipUrl=/samples/test-classroom.zip',
    },
  ];

  for (const t of tests) {
    const ok = await fetchUrl(t.name, t.path, t.options);
    if (ok) passed++;
  }

  console.log(`==================================================`);
  console.log(`📊 Result: ${passed}/${tests.length} ZIP streaming tests passed successfully.`);
  console.log(`==================================================`);
}

main();
