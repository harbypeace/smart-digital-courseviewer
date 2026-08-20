/**
 * Inspects bucket "harby" to discover its key naming structure,
 * specifically looking for TTS audio files, directories, and classroom IDs.
 */

async function inspectHarbyBucket() {
  const { AwsClient } = await import('aws4fetch');

  // We test credentials for account 656055b2b0eea86b43dd2fd4853c100f
  const client = new AwsClient({
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const BUCKET = 'harby';
  const BASE_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;

  console.log('🔍 Scanning bucket "harby" for objects and folders...');

  try {
    const res = await client.fetch(`${BASE_URL}?max-keys=50`);
    if (!res.ok) {
      console.error(`Fetch failed with status ${res.status}: ${res.statusText}`);
      console.log(await res.text());
      return;
    }

    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
    console.log(`\nFound ${keys.length} sample keys in "harby":`);
    keys.slice(0, 30).forEach(k => console.log('  -', k));

    const prefixes = [...xml.matchAll(/<Prefix>(.*?)<\/Prefix>/g)].map(m => m[1]);
    if (prefixes.length > 0) {
      console.log('\nSample prefixes:');
      prefixes.forEach(p => console.log('  [Prefix]', p));
    }
  } catch (err) {
    console.error('Error inspecting harby:', err.message);
  }
}

inspectHarbyBucket();
