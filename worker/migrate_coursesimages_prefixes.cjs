const { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

// ── 7th Worker R2 Credentials for `coursesimages` ──
const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: '4caf4a9a8285b5a9118199f0d41c2770',
    secretAccessKey: '236368997414d63d9001197a69db69c800ad4fbefffb3ecc1f3b6f6bf1a3b19a',
  },
});

const BUCKET = 'coursesimages';
const CONCURRENCY = 40;

function convertKeyToCleanPrefix(key) {
  const parts = key.split('/');
  if (parts.length < 4) return null;

  const [subject, unitRaw, lessonRaw, ...rest] = parts;

  // e.g. adb10p1_c1 -> u1, bio10_u1 -> u1, ysoc10p1_u1 -> u1
  const unitMatch = unitRaw.match(/_?[cu](\d+)/i);
  const cleanUnit = unitMatch ? `u${unitMatch[1]}` : unitRaw.replace(/^.*_/, '');

  // e.g. adb10p1_c1l1 -> l1, ysoc10p1_u1l9 -> l9, adb10p1_c1l1_balagha -> l1_balagha
  let cleanLesson = lessonRaw;
  const lessonMatch = lessonRaw.match(/_?[cu]?\d*([cl]\d+.*)$/i);
  if (lessonMatch) {
    cleanLesson = lessonMatch[1].toLowerCase().replace(/^c/, 'l');
  } else {
    cleanLesson = lessonRaw.replace(/^.*_/, '');
  }

  const newKey = [subject, cleanUnit, cleanLesson, ...rest].join('/');
  return newKey !== key ? newKey : null;
}

async function moveSingleObject(oldKey, newKey, dryRun) {
  if (dryRun) {
    console.log(`[DRY] ${oldKey} ──► ${newKey}`);
    return;
  }

  await s3.send(new CopyObjectCommand({
    Bucket: BUCKET,
    CopySource: `${BUCKET}/${encodeURIComponent(oldKey)}`,
    Key: newKey,
  }));

  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: oldKey,
  }));
}

async function processAllImages(dryRun = false) {
  console.log(`🚀 Starting R2 Image Prefix Migration in bucket "${BUCKET}"...`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE MIGRATION (SERVER-SIDE)'}\n`);

  let continuationToken = undefined;
  let totalFound = 0;
  let totalToMigrate = 0;
  let totalDone = 0;
  const queue = [];

  do {
    const listRes = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));

    for (const item of (listRes.Contents || [])) {
      totalFound++;
      const oldKey = item.Key;
      const newKey = convertKeyToCleanPrefix(oldKey);

      if (newKey) {
        queue.push({ oldKey, newKey });
        totalToMigrate++;
      }
    }

    continuationToken = listRes.NextContinuationToken;
    process.stdout.write(`\rScanned: ${totalFound} objects | To Migrate: ${totalToMigrate}`);
  } while (continuationToken);

  console.log(`\n\nStarting batch move of ${queue.length} objects with ${CONCURRENCY} workers...\n`);

  let cursor = 0;
  async function worker(id) {
    while (cursor < queue.length) {
      const idx = cursor++;
      const { oldKey, newKey } = queue[idx];
      try {
        await moveSingleObject(oldKey, newKey, dryRun);
        totalDone++;
        if (totalDone % 250 === 0 || totalDone === queue.length) {
          console.log(`[Worker ${id}] Progress: ${totalDone}/${queue.length} (${Math.round((totalDone/queue.length)*100)}%)`);
        }
      } catch (err) {
        console.error(`[Worker ${id}] Error on ${oldKey}:`, err.message);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  console.log(`\n🎉 Finished! Successfully processed ${totalDone} objects in bucket "${BUCKET}".`);
}

const isLive = process.argv.includes('--live');
processAllImages(!isLive).catch(e => console.error('Fatal error:', e));
