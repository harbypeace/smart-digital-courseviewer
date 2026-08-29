import { AwsClient } from 'aws4fetch';

const S3_COURSES_CLIENT = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

async function checkBackgrounds() {
  const url = 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json';
  const res = await S3_COURSES_CLIENT.fetch(url);
  const json = await res.json();
  json.scenes.slice(0, 5).forEach((s, idx) => {
    console.log(`Scene ${idx}: background =`, s.content?.canvas?.background);
  });
}
checkBackgrounds();
