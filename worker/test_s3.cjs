const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  },
});

async function run() {
  try {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: 'courses', MaxKeys: 5 }));
    console.log('Successfully connected to "courses" bucket!');
    console.log('Objects sample:', list.Contents ? list.Contents.map(c => c.Key) : []);
  } catch (err) {
    console.error('Error on "courses" bucket:', err.message);
  }
}

run();
