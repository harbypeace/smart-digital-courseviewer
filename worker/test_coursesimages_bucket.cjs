const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  },
});

async function testBucket() {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: 'coursesimages',
      MaxKeys: 25,
    }));
    console.log('✅ Successfully connected to bucket "coursesimages"!');
    console.log('Total sample objects returned:', (list.Contents || []).length);
    console.log('Sample Keys in "coursesimages":');
    (list.Contents || []).forEach(c => console.log('  -', c.Key));
  } catch (err) {
    console.error('❌ Error accessing "coursesimages":', err.message);
  }
}

testBucket();
