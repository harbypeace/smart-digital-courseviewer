/**
 * Upload classroom_packages to the "courses" R2 bucket.
 *
 * Local structure:
 *   D:\projects\openclaw\classroom_packages\{subject}\{unit}\{lesson}\classrooms\{id}\*.json
 *
 * R2 key in "courses":
 *   classrooms/{subject}/{unit}/{lesson}/{id}/classdata.json
 *   classrooms/{subject}/{unit}/{lesson}/{id}/export.json
 *
 * Usage:
 *   node upload_classrooms.cjs                          # upload all
 *   node upload_classrooms.cjs --dry-run                # preview only
 *   node upload_classrooms.cjs --subject bio10p1        # one subject
 *   node upload_classrooms.cjs --skip-existing          # skip already uploaded
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// ── Config (credentials targeting the 'courses' bucket) ───────────────────

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
const R2_ACCESS_KEY = 'f942f0be0f3d93ab1e338b10e896bd78';
const R2_SECRET_KEY = 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa';
const BUCKET = 'courses';

const CLASSROOM_DIR = 'D:\\projects\\openclaw\\classroom_packages';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
});

// ── CLI flags ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP = args.includes('--skip-existing');
const subjectIdx = args.indexOf('--subject');
const subjectFilter = subjectIdx !== -1 ? args[subjectIdx + 1] : null;

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

async function exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📦 Classroom Uploader → ${BUCKET}`);
  console.log(`   Source: ${CLASSROOM_DIR}`);
  console.log(`   Mode:   ${DRY ? 'DRY RUN' : 'LIVE'}`);
  if (subjectFilter) console.log(`   Filter: ${subjectFilter}`);
  if (SKIP) console.log(`   Skip:   existing`);
  console.log('');

  const subjects = fs.readdirSync(CLASSROOM_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .filter(n => !subjectFilter || n === subjectFilter);

  let total = 0, ok = 0, skip = 0, fail = 0;

  for (const sub of subjects) {
    const files = walk(path.join(CLASSROOM_DIR, sub));
    if (!files.length) continue;
    console.log(`📁 ${sub} — ${files.length} files`);

    for (const fp of files) {
      total++;
      // Map local to R2 path:
      // Local: D:\projects\openclaw\classroom_packages\bio10p1\u1\l1\classrooms\KbOpmXdyXa\classdata.json
      // R2 Key: classrooms/bio10p1/u1/l1/KbOpmXdyXa/classdata.json (or bio10p1/u1/l1/classrooms/KbOpmXdyXa/classdata.json)
      const rel = path.relative(CLASSROOM_DIR, fp).replace(/\\/g, '/');
      const r2Key = `classrooms/${rel.replace('/classrooms/', '/')}`;

      if (DRY) { console.log(`   [DRY] ${r2Key}`); ok++; continue; }

      try {
        if (SKIP && await exists(r2Key)) { skip++; continue; }

        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: r2Key,
          Body: fs.readFileSync(fp),
          ContentType: ct(fp),
        }));
        ok++;
        console.log(`   ✅ ${r2Key}`);
      } catch (e) {
        fail++;
        console.error(`   ❌ ${r2Key}: ${e.message}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Total:    ${total}`);
  console.log(`Uploaded: ${ok}`);
  console.log(`Skipped:  ${skip}`);
  console.log(`Errors:   ${fail}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
