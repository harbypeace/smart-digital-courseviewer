/**
 * High-Throughput Concurrent Classroom Uploader → courses bucket
 *
 * Uses a worker-pool pattern with configurable concurrency (default: 25 workers)
 * to maximize upload bandwidth to Cloudflare R2.
 *
 * Usage:
 *   node upload_classrooms_fast.cjs                     # upload with 25 workers
 *   node upload_classrooms_fast.cjs --concurrency 40    # custom worker count
 *   node upload_classrooms_fast.cjs --dry-run
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
const R2_ACCESS_KEY = 'f942f0be0f3d93ab1e338b10e896bd78';
const R2_SECRET_KEY = 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa';
const BUCKET = 'courses';

const CLASSROOM_DIR = 'D:\\projects\\openclaw\\classroom_packages';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  maxAttempts: 5,
});

// ── CLI Arguments ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const concIdx = args.indexOf('--concurrency');
const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 25;

// ── Helpers ───────────────────────────────────────────────────────────────

const MIMES = {
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
};

function ct(f) { return MIMES[path.extname(f).toLowerCase()] || 'application/octet-stream'; }

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(fp));
    else if (e.isFile()) out.push(fp);
  }
  return out;
}

// ── Worker Pool ───────────────────────────────────────────────────────────

async function runWorkerPool(tasks, limit, workerFn) {
  let index = 0;
  const workers = Array.from({ length: limit }, async (_, workerId) => {
    while (index < tasks.length) {
      const current = index++;
      await workerFn(tasks[current], current, workerId);
    }
  });
  await Promise.all(workers);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 High-Speed Classroom Uploader → ${BUCKET}`);
  console.log(`   Source:      ${CLASSROOM_DIR}`);
  console.log(`   Workers:     ${CONCURRENCY} parallel threads`);
  console.log(`   Mode:        ${DRY ? 'DRY RUN' : 'LIVE UPLOAD'}`);
  console.log('');

  console.log('🔍 Scanning all classroom files...');
  const subjects = fs.readdirSync(CLASSROOM_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const allTasks = [];
  for (const sub of subjects) {
    const files = walk(path.join(CLASSROOM_DIR, sub));
    for (const fp of files) {
      const rel = path.relative(CLASSROOM_DIR, fp).replace(/\\/g, '/');
      const r2Key = `classrooms/${rel.replace('/classrooms/', '/')}`;
      allTasks.push({ localPath: fp, r2Key });
    }
  }

  console.log(`📋 Total files queued: ${allTasks.length}`);
  console.log(`⚡ Starting ${CONCURRENCY} parallel upload workers...\n`);

  let uploaded = 0, skipped = 0, errors = 0;
  const startTime = Date.now();

  await runWorkerPool(allTasks, CONCURRENCY, async (task, i) => {
    if (DRY) {
      uploaded++;
      return;
    }

    try {
      // Check if already uploaded
      try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: task.r2Key }));
        skipped++;
        return;
      } catch (err) {
        // Not found, proceed to upload
      }

      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: task.r2Key,
        Body: fs.readFileSync(task.localPath),
        ContentType: ct(task.localPath),
      }));

      uploaded++;
      if (uploaded % 100 === 0 || uploaded + skipped === allTasks.length) {
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (uploaded / Math.max(1, elapsedSec)).toFixed(1);
        console.log(`[${uploaded + skipped}/${allTasks.length}] Uploaded: ${uploaded} | Skipped: ${skipped} | Rate: ${rate} files/sec (${elapsedSec}s)`);
      }
    } catch (e) {
      errors++;
      console.error(`❌ [Failed] ${task.r2Key}: ${e.message}`);
    }
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 Finished in ${totalTime}s`);
  console.log(`Total:    ${allTasks.length}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(e => { console.error('Fatal Error:', e); process.exit(1); });
