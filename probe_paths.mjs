async function probePaths() {
  const base = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev';
  const testPaths = [
    'adb10p1/u1/l1/page-11-w900.webp',
    'adb10p1/adb10p1_c1/adb10p1_c1l1/page-11-w900.webp',
    'adb10p1/adb10p1_c1/adb10p1_c1l1/page-1-w900.webp',
    'adb10p1/u1/l1/page-1-w900.webp',
    'adab10/u1/l1/page-11-w900.webp',
    'adab10/adab10_c1/adab10_c1l1/page-11-w900.webp',
    'adb10p1/page-11.webp',
    'thumbnails/adb10p1.webp',
  ];

  for (const p of testPaths) {
    try {
      const res = await fetch(`${base}/${p}`, { method: 'HEAD' });
      console.log(`${p} -> HTTP ${res.status}`);
    } catch (e) {
      console.log(`${p} -> ${e.message}`);
    }
  }
}
probePaths();
