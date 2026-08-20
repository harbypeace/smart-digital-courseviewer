async function inspectHarbyWithKey2() {
  const { AwsClient } = await import('aws4fetch');

  // Key pair from 7th .env
  const client = new AwsClient({
    accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
    secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const BUCKET = 'harby';
  const BASE_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;

  console.log('🔍 Testing access to bucket "harby" with Key 2...');

  try {
    const res = await client.fetch(`${BASE_URL}?max-keys=50`);
    if (!res.ok) {
      console.error(`Fetch failed with status ${res.status}: ${res.statusText}`);
      console.log(await res.text());
      return;
    }

    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
    console.log(`\n🎉 Success! Found ${keys.length} sample keys in "harby":`);
    keys.slice(0, 30).forEach(k => console.log('  -', k));
  } catch (err) {
    console.error('Error inspecting harby:', err.message);
  }
}

inspectHarbyWithKey2();
