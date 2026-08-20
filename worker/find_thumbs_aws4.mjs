async function search() {
  const { AwsClient } = await import('aws4fetch');
  
  const client = new AwsClient({
    accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
    secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
    service: 's3',
    region: 'auto',
  });

  const prefixes = ['thumbnails/', 'thumbs/', 'covers/', 'images/', 'thumbnails', 'thumbs', 'covers'];
  
  for (const p of prefixes) {
    const url = `https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com/coursesimages?prefix=${encodeURIComponent(p)}&max-keys=20`;
    const res = await client.fetch(url);
    const xml = await res.text();
    
    // Extract <Key> tags from XML
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
    if (keys.length > 0) {
      console.log(`\n✅ Prefix "${p}" found ${keys.length} items:`);
      keys.forEach(k => console.log('  -', k));
    }
  }
}

search();
