const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  },
});

async function countClassrooms() {
  console.log('Counting uploaded classroom files in R2 bucket "courses"...');
  let token = undefined;
  let count = 0;
  let sampleClassrooms = [];

  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: 'courses',
      Prefix: 'classrooms/',
      ContinuationToken: token,
      MaxKeys: 1000,
    }));

    const contents = res.Contents || [];
    count += contents.length;

    if (sampleClassrooms.length < 5 && contents.length > 0) {
      sampleClassrooms.push(...contents.slice(0, 5).map(c => c.Key));
    }

    token = res.NextContinuationToken;
    process.stdout.write(`\rTotal Classroom Files in R2: ${count}`);
  } while (token);

  console.log(`\n\n✅ Verified in R2: ${count} classroom files are uploaded!`);
  console.log('Sample Keys in R2:');
  sampleClassrooms.slice(0, 5).forEach(k => console.log(' -', k));
}

countClassrooms().catch(e => console.error('Error:', e.message));
