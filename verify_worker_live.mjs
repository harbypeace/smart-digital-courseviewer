async function verify() {
  const tests = [
    'https://lesson-viewer.abduh-merzah.workers.dev/',
    'https://lesson-viewer.abduh-merzah.workers.dev/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh',
    'https://lesson-viewer.abduh-merzah.workers.dev/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=0&end=10',
    'https://lesson-viewer.abduh-merzah.workers.dev/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh',
  ];

  for (const t of tests) {
    try {
      const res = await fetch(t);
      const text = await res.text();
      console.log(`[${res.status}] ${t} -> Length: ${text.length}, hasReact: ${text.includes('root') || text.includes('script')}`);
    } catch (e) {
      console.log(`[ERR] ${t} -> ${e.message}`);
    }
  }
}
verify();
