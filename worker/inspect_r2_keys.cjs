const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  },
});

async function listSamples() {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: 'courses',
      MaxKeys: 100,
    }));
    
    console.log('Sample R2 keys from courses bucket:');
    (list.Contents || []).slice(0, 30).forEach(c => console.log(' -', c.Key));

    // Search for any .webp or page- files
    const webpFiles = (list.Contents || []).filter(c => c.Key.endsWith('.webp') || c.Key.includes('page-'));
    console.log('\nWebP / Page samples in courses:');
    webpFiles.slice(0, 20).forEach(c => console.log(' *', c.Key));

  } catch (err) {
    console.error('Error listing R2:', err.message);
  }
}

listSamples();
