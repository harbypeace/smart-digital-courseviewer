/**
 * Renames all `export.json` files to `speechtext.json` in the `courses` R2 bucket.
 * Performs fast server-side CopyObject + DeleteObject across 40 worker threads.
 */

async function run() {
  const { AwsClient } = await import('aws4fetch');

  const client = new AwsClient({
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const BUCKET = 'courses';
  const BASE_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`;

  console.log('🔍 Scanning bucket "courses" for all "export.json" files...');

  let continuationToken = null;
  const exportKeys = [];

  do {
    let url = `${BASE_URL}?prefix=classrooms%2F&max-keys=1000`;
    if (continuationToken) url += `&continuation-token=${encodeURIComponent(continuationToken)}`;

    const res = await client.fetch(url);
    const xml = await res.text();

    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);
    for (const key of keys) {
      if (key.endsWith('/export.json')) {
        exportKeys.push(key);
      }
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    continuationToken = nextTokenMatch ? nextTokenMatch[1] : null;

    process.stdout.write(`\rFound ${exportKeys.length} export.json files...`);
  } while (continuationToken);

  console.log(`\n\n🎯 Total export.json files to rename to speechtext.json: ${exportKeys.length}`);

  let processed = 0;
  let success = 0;
  let errors = 0;
  const CONCURRENCY = 40;

  async function worker(workerId, keysQueue) {
    while (keysQueue.length > 0) {
      const oldKey = keysQueue.shift();
      if (!oldKey) break;

      const newKey = oldKey.replace(/\/export\.json$/, '/speechtext.json');

      try {
        // 1. Server-side copy
        const copyUrl = `${BASE_URL}/${encodeURI(newKey).replace(/%2F/g, '/')}`;
        const copyRes = await client.fetch(copyUrl, {
          method: 'PUT',
          headers: {
            'x-amz-copy-source': `/${BUCKET}/${encodeURI(oldKey).replace(/%2F/g, '/')}`,
          },
        });

        if (copyRes.ok) {
          // 2. Delete old key
          const delUrl = `${BASE_URL}/${encodeURI(oldKey).replace(/%2F/g, '/')}`;
          await client.fetch(delUrl, { method: 'DELETE' });
          success++;
        } else {
          errors++;
        }
      } catch (err) {
        errors++;
      }

      processed++;
      if (processed % 100 === 0 || processed === exportKeys.length) {
        const pct = ((processed / exportKeys.length) * 100).toFixed(1);
        process.stdout.write(`\r[${pct}%] Processed ${processed}/${exportKeys.length} (Success: ${success}, Errors: ${errors})`);
      }
    }
  }

  const queue = [...exportKeys];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i, queue));
  }

  await Promise.all(workers);
  console.log(`\n\n🎉 Migration Complete! Successfully renamed ${success} export.json files to speechtext.json.`);
}

run();
