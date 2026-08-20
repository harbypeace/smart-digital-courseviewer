import { AwsClient } from 'aws4fetch';

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';

const S3_IMAGES = new AwsClient({
  accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
  secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
  service: 's3',
  region: 'auto',
});

const S3_COURSES = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

async function listBucket(client, bucket, prefix = '', limit = 15) {
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=${limit}`;
  const res = await client.fetch(url);
  const text = await res.text();
  const keys = [...text.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
  return keys;
}

async function main() {
  console.log('--- 1. Sample keys in coursesimages (Images) ---');
  const imgKeys = await listBucket(S3_IMAGES, 'coursesimages', '', 20);
  console.log(imgKeys);

  console.log('\n--- 2. Sample keys in courses (HTML / Classrooms) ---');
  const coursesKeys = await listBucket(S3_COURSES, 'courses', '', 20);
  console.log(coursesKeys);

  console.log('\n--- 3. Classrooms in courses bucket ---');
  const classroomKeys = await listBucket(S3_COURSES, 'courses', 'classrooms/', 20);
  console.log(classroomKeys);
}

main();
