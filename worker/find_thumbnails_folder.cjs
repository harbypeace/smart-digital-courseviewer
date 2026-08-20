const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
    secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
  },
});

async function findThumbnailFolders() {
  console.log('🔍 Searching for thumbnail folders in bucket "coursesimages"...');
  
  const prefixes = ['thumbnails', 'thumbs', 'covers', 'images', ''];
  for (const p of prefixes) {
    try {
      const res = await s3.send(new ListObjectsV2Command({
        Bucket: 'coursesimages',
        Prefix: p,
        MaxKeys: 30,
      }));
      
      const contents = res.Contents || [];
      if (contents.length > 0) {
        console.log(`\n📁 Found items with prefix "${p}" (${contents.length} samples):`);
        contents.slice(0, 15).forEach(c => console.log('  -', c.Key));
      }
    } catch (e) {
      console.error(`Error on prefix "${p}":`, e.message);
    }
  }
}

findThumbnailFolders();
