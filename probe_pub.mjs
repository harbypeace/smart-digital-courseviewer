async function probePublicBucket() {
  const url = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/page-1-w900.webp';
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(`pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev status: ${res.status}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
probePublicBucket();
