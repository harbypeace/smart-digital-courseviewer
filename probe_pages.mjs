async function probeImages() {
  for (let i = 0; i <= 25; i++) {
    const url = `https://pub-84180d5dd6894faea5ae06b12a8934ab.r2.dev/adb10p1/u1/l1/page-${i}-w900.webp`;
    try {
      const res = await fetch(url, { method: 'HEAD' });
      console.log(`Page ${i}: HTTP ${res.status}`);
    } catch (e) {
      console.log(`Page ${i}: Error ${e.message}`);
    }
  }
}
probeImages();
