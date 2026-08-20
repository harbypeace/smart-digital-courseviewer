const { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// ── S3 Credentials for R2 Buckets ──
const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  },
});

/**
 * Move/Rename objects inside R2 bucket from old prefix to new prefix
 * @param {string} bucket - The R2 bucket name ('courses')
 * @param {string} oldPrefix - e.g. 'bio10p1/bio10_u1/bio10_u1l1/'
 * @param {string} newPrefix - e.g. 'bio10p1/u1/l1/'
 * @param {boolean} dryRun - If true, only print what will be moved
 */
async function renamePrefix(bucket, oldPrefix, newPrefix, dryRun = true) {
  console.log(`\n📦 Renaming prefix in bucket "${bucket}":`);
  console.log(`   FROM: ${oldPrefix}`);
  console.log(`   TO:   ${newPrefix}`);
  console.log(`   MODE: ${dryRun ? 'DRY RUN' : 'LIVE MOVE'}\n`);

  let continuationToken = undefined;
  let totalMoved = 0;

  do {
    const listRes = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: oldPrefix,
      ContinuationToken: continuationToken,
    }));

    const objects = listRes.Contents || [];
    for (const obj of objects) {
      const oldKey = obj.Key;
      const newKey = oldKey.replace(oldPrefix, newPrefix);

      console.log(`   ${oldKey}  ──►  ${newKey}`);

      if (!dryRun) {
        // 1. Copy object to new key
        await s3.send(new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodeURIComponent(oldKey)}`,
          Key: newKey,
        }));

        // 2. Delete original object
        await s3.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: oldKey,
        }));
      }

      totalMoved++;
    }

    continuationToken = listRes.NextContinuationToken;
  } while (continuationToken);

  console.log(`\n✅ Completed! Total objects moved: ${totalMoved}`);
}

// Example usage test:
renamePrefix('courses', 'bio10p1/bio10_u1/bio10_u1l1/', 'bio10p1/u1/l1/', true)
  .catch(err => console.error('Error:', err.message));
