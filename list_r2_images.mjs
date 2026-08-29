import { AwsClient } from 'aws4fetch';

const S3_IMAGES_CLIENT = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

async function listImages() {
  const url = 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com/coursesimages?prefix=adb10p1/u1/l1/&max-keys=20';
  const res = await S3_IMAGES_CLIENT.fetch(url);
  const text = await res.text();
  console.log('Images listed in coursesimages:\n', text);
}
listImages();
