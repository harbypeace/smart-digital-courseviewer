const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
    secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
  },
});

async function listImagesBucket() {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: 'coursesimages',
      MaxKeys: 30,
    }));
    console.log('✅ Connected to "coursesimages" successfully with 7th credentials!');
    console.log('Sample Keys in "coursesimages":');
    (list.Contents || []).forEach(c => console.log('  -', c.Key));
  } catch (err) {
    console.error('Error on coursesimages:', err.message);
  }
}

listImagesBucket();
