/**
 * Discovers and moves TTS audio files from bucket "harby"
 * into their corresponding classroom folders in bucket "courses".
 */

async function testHarbyCredentials() {
  const { AwsClient } = await import('aws4fetch');

  // Harby credentials from D:\projects\openclaw\workflow_config.py
  const harbyClient = new AwsClient({
    accessKeyId: '115e5ab22e3038a46bfc4ec8d423eb44',
    secretAccessKey: 'cbadbe67c8bcfc786f2e5b540a1249cd723baf0c575ff69f940851dd2665d89c',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/harby?max-keys=25`;

  console.log('🔍 Testing credentials for bucket "harby" from openclaw...');
  const res = await harbyClient.fetch(url);

  if (!res.ok) {
    console.error(`❌ Harby fetch failed: ${res.status} ${res.statusText}`);
    console.log(await res.text());
    return;
  }

  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
  console.log(`\n🎉 Authenticated successfully to "harby"! Found ${keys.length} sample keys:`);
  keys.slice(0, 20).forEach(k => console.log('  -', k));
}

testHarbyCredentials();
