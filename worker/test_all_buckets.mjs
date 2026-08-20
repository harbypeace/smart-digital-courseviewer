async function listBucketsAndKeys() {
  const { AwsClient } = await import('aws4fetch');

  // Key Pair 1
  const c1 = new AwsClient({
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const buckets = ['courses', 'coursesimages', 'classrooms', 'harby', 'sahl', 'cncyemen', 'engy-up'];

  console.log('Testing S3 list access across all buckets...\n');

  for (const b of buckets) {
    const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${b}?max-keys=5`;
    try {
      const res = await c1.fetch(url);
      if (res.ok) {
        const xml = await res.text();
        const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
        console.log(`✅ [${b}] Accessible! Found ${keys.length} sample keys:`);
        keys.forEach(k => console.log(`   - ${k}`));
      } else {
        console.log(`❌ [${b}] Status ${res.status}: ${res.statusText}`);
      }
    } catch (e) {
      console.log(`❌ [${b}] Error: ${e.message}`);
    }
  }
}

listBucketsAndKeys();
