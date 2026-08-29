async function testCors() {
  const url = 'https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/adb10p1/u1/l1/page-11-w900.webp';
  const res = await fetch(url, {
    headers: { Origin: 'http://localhost:8788' }
  });
  console.log('Status:', res.status);
  console.log('Access-Control-Allow-Origin:', res.headers.get('access-control-allow-origin'));
}
testCors();
