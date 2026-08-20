/**
 * Harby ZIP to Courses Classroom Migration Script
 *
 * Migrates ~637 classroom ZIP archives (.zip / .maic.zip) from R2 bucket "harby"
 * into their corresponding clean lesson directories in R2 bucket "courses".
 *
 * Destination Standard:
 *   courses -> classrooms/{subject_code}/u{N}/l{M}/{classroomId}/classroom.zip
 *
 * Usage:
 *   node migrate_harby_zips_to_courses.mjs                    # full live migration
 *   node migrate_harby_zips_to_courses.mjs --dry-run          # preview mapping without copying
 *   node migrate_harby_zips_to_courses.mjs --skip-existing    # skip already copied files
 *   node migrate_harby_zips_to_courses.mjs --concurrency 40   # custom worker count
 *   node migrate_harby_zips_to_courses.mjs --subject bio10p1  # filter specific subject
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CLI Arguments ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_EXISTING = args.includes('--skip-existing');
const DELETE_SOURCE = args.includes('--delete-source');

const concIdx = args.indexOf('--concurrency');
const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 30;

const subjIdx = args.indexOf('--subject');
const SUBJECT_FILTER = subjIdx !== -1 ? args[subjIdx + 1].toLowerCase() : null;

// ── R2 Configuration ────────────────────────────────────────────────────────
const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';

// Harby Bucket Client (Source)
const HARBY_CREDS = {
  accessKeyId: '115e5ab22e3038a46bfc4ec8d423eb44',
  secretAccessKey: 'cbadbe67c8bcfc786f2e5b540a1249cd723baf0c575ff69f940851dd2665d89c',
};

// Courses Bucket Client (Destination)
const COURSES_CREDS = {
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
};

const HARBY_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/harby`;
const COURSES_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses`;

// ── Subject Code Normalizer ─────────────────────────────────────────────────
function getSubjectCode(subject, grade) {
  const s = String(subject || '').toLowerCase().trim();
  const g = String(grade || '').replace(/\D/g, '');
  const map = {
    'bio': `bio${g || '10'}p1`,
    'biology': `bio${g || '10'}p1`,
    'math': `math${g || '10'}p1`,
    'phy': `phy${g || '10'}p1`,
    'physics': `phy${g || '10'}p1`,
    'sci': `sci${g || '8'}p1`,
    'science': `sci${g || '8'}p1`,
    'arabic': `adb${g || '10'}p1`,
    'adab': `adb${g || '10'}p1`,
    'chm': `chm${g || '10'}p1`,
    'chemistry': `chm${g || '10'}p1`,
  };
  return map[s] || (s.includes(g) ? s : `${s}${g}p1`);
}

// ── Database Loader ─────────────────────────────────────────────────────────
function loadClassroomsDb() {
  const dumpPath = path.join(__dirname, 'classrooms_db_dump.json');
  const dbPath = 'D:\\projects\\openclaw\\classrooms.db';

  if (!fs.existsSync(dumpPath) && fs.existsSync(dbPath)) {
    console.log('🔄 Exporting metadata from classrooms.db via Python...');
    const pyScript = `
import sqlite3, json
conn = sqlite3.connect(r'${dbPath}')
c = conn.cursor()
c.execute("SELECT id, classroom_id, subject, subject_code, grade, lesson_code, lesson_name, url, zip_url, status FROM classrooms")
classrooms = [{"id":r[0],"classroom_id":r[1],"subject":r[2],"subject_code":r[3],"grade":r[4],"lesson_code":r[5],"lesson_name":r[6],"url":r[7],"zip_url":r[8],"status":r[9]} for r in c.fetchall()]
c.execute("SELECT id, classroom_id, lesson_code, lesson_name, subject, grade, unit_name, account, url, status FROM account_classrooms")
account_classrooms = [{"id":r[0],"classroom_id":r[1],"lesson_code":r[2],"lesson_name":r[3],"subject":r[4],"grade":r[5],"unit_name":r[6],"account":r[7],"url":r[8],"status":r[9]} for r in c.fetchall()]
with open(r'${dumpPath.replace(/\\/g, '\\\\')}', 'w', encoding='utf-8') as f:
    json.dump({"classrooms": classrooms, "account_classrooms": account_classrooms}, f, ensure_ascii=False)
`;
    try {
      execSync(`python -c "${pyScript.replace(/\n/g, ' ')}"`, { stdio: 'pipe' });
    } catch (e) {
      console.warn('⚠️ Python SQLite export warning:', e.message);
    }
  }

  if (fs.existsSync(dumpPath)) {
    try {
      const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
      return {
        classrooms: dump.classrooms || [],
        account_classrooms: dump.account_classrooms || [],
      };
    } catch (e) {
      console.warn('⚠️ Failed to parse classrooms_db_dump.json:', e.message);
    }
  }

  return { classrooms: [], account_classrooms: [] };
}

// ── Main Migration Function ─────────────────────────────────────────────────
async function migrateHarbyZips() {
  const { AwsClient } = await import('aws4fetch');

  const harbyClient = new AwsClient({
    accessKeyId: HARBY_CREDS.accessKeyId,
    secretAccessKey: HARBY_CREDS.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  const coursesClient = new AwsClient({
    accessKeyId: COURSES_CREDS.accessKeyId,
    secretAccessKey: COURSES_CREDS.secretAccessKey,
    service: 's3',
    region: 'auto',
  });

  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log('📦 HARBY ZIP -> COURSES CLASSROOM MIGRATION PIPELINE');
  console.log('════════════════════════════════════════════════════════════════════════════');
  console.log(`   Source:      harby bucket (classrooms/*.zip)`);
  console.log(`   Destination: courses bucket (classrooms/{subject}/u{N}/l{M}/{id}/classroom.zip)`);
  console.log(`   Mode:        ${DRY_RUN ? 'DRY RUN (Preview Only)' : 'LIVE MIGRATION'}`);
  console.log(`   Workers:     ${CONCURRENCY} parallel threads`);
  console.log(`   Skip Exist:  ${SKIP_EXISTING}`);
  if (SUBJECT_FILTER) console.log(`   Subject:     ${SUBJECT_FILTER}`);
  console.log('════════════════════════════════════════════════════════════════════════════\n');

  // 1. Index database records
  console.log('⚡ Phase 1: Loading classroom catalog from database & index...');
  const { classrooms, account_classrooms } = loadClassroomsDb();
  console.log(`   ↳ Loaded ${classrooms.length} main classrooms and ${account_classrooms.length} account classrooms.`);

  const dbByZip = new Map();
  const dbById = new Map();
  const dbBySubjectGradeLesson = new Map();

  for (const r of classrooms) {
    if (r.classroom_id) dbById.set(r.classroom_id, r);
    if (r.zip_url) {
      const cleanZ = r.zip_url.replace(/https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
      dbByZip.set(cleanZ, r);
    }
    if (r.subject && r.grade && r.lesson_code) {
      const k = `${String(r.subject).toLowerCase()}/grade${r.grade}/${String(r.lesson_code).toLowerCase()}`;
      dbBySubjectGradeLesson.set(k, r);
    }
    if (r.subject_code && r.lesson_code) {
      const k2 = `${String(r.subject_code).toLowerCase()}/${String(r.lesson_code).toLowerCase()}`;
      dbBySubjectGradeLesson.set(k2, r);
    }
  }

  for (const r of account_classrooms) {
    if (r.classroom_id && !dbById.has(r.classroom_id)) dbById.set(r.classroom_id, r);
    if (r.subject && r.grade && r.lesson_code) {
      const k = `${String(r.subject).toLowerCase()}/grade${r.grade}/${String(r.lesson_code).toLowerCase()}`;
      if (!dbBySubjectGradeLesson.has(k)) dbBySubjectGradeLesson.set(k, r);
    }
  }

  // 2. Index existing classrooms in courses bucket
  console.log('\n⚡ Phase 2: Indexing classroom directory tree in bucket "courses"...');
  const coursesClassroomMap = new Map(); // classroomId -> directory path
  let token = null;

  do {
    let url = `${COURSES_URL}?prefix=classrooms%2F&max-keys=1000`;
    if (token) url += `&continuation-token=${encodeURIComponent(token)}`;

    const res = await coursesClient.fetch(url);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);

    for (const key of keys) {
      const parts = key.split('/');
      // e.g. classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json
      if (parts.length >= 5) {
        const classId = parts[4];
        const dir = parts.slice(0, 5).join('/');
        coursesClassroomMap.set(classId, dir);
      }
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    token = nextTokenMatch ? nextTokenMatch[1] : null;
    process.stdout.write(`\r   Indexed ${coursesClassroomMap.size} classroom locations in "courses"...`);
  } while (token);

  console.log(`\n   ↳ Found ${coursesClassroomMap.size} existing classroom directories in "courses".`);

  // 3. Scan all ZIP files in Harby
  console.log('\n⚡ Phase 3: Scanning all ZIP packages in bucket "harby"...');
  token = null;
  const harbyZips = [];

  do {
    let url = `${HARBY_URL}?prefix=classrooms%2F&max-keys=1000`;
    if (token) url += `&continuation-token=${encodeURIComponent(token)}`;

    const res = await harbyClient.fetch(url);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);

    for (const key of keys) {
      if (key.endsWith('.zip')) {
        harbyZips.push(key);
      }
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    token = nextTokenMatch ? nextTokenMatch[1] : null;
    process.stdout.write(`\r   Found ${harbyZips.length} ZIP archives in "harby"...`);
  } while (token);

  console.log(`\n   ↳ Total ZIP archives discovered in "harby": ${harbyZips.length}`);

  // 4. Map and build work tasks
  console.log('\n⚡ Phase 4: Resolving destination lesson paths for each ZIP package...');
  const tasks = [];

  for (const zipKey of harbyZips) {
    const filename = zipKey.split('/').pop();
    const cleanZipKey = zipKey.replace(/^\/+/, '');

    let matchedId = null;
    let subjectCode = null;
    let lessonCode = null;

    // Strategy 1: Exact zip_url in DB
    if (dbByZip.has(cleanZipKey)) {
      const info = dbByZip.get(cleanZipKey);
      matchedId = info.classroom_id;
      subjectCode = info.subject_code || getSubjectCode(info.subject, info.grade);
      lessonCode = info.lesson_code;
    }

    // Strategy 2: ID extracted from filename (e.g. u1l1_wrFHVxdOpe.maic.zip)
    if (!matchedId) {
      const idMatch = filename.match(/_([A-Za-z0-9_-]{10})\.(?:maic\.)?zip$/) || filename.match(/^([A-Za-z0-9_-]{10})\.(?:maic\.)?zip$/);
      if (idMatch) {
        matchedId = idMatch[1];
        if (dbById.has(matchedId)) {
          const info = dbById.get(matchedId);
          subjectCode = info.subject_code || getSubjectCode(info.subject, info.grade);
          lessonCode = info.lesson_code;
        }
      }
    }

    // Strategy 3: Folder + Lesson Code in DB
    if (!matchedId) {
      const parts = cleanZipKey.split('/');
      if (parts.length >= 4) {
        const subject = parts[1];
        const grade = parts[2];
        const rawCode = parts[3].replace(/\.(?:maic\.)?zip$/i, '');
        const codeKey = `${subject.toLowerCase()}/${grade.toLowerCase()}/${rawCode.toLowerCase()}`;
        if (dbBySubjectGradeLesson.has(codeKey)) {
          const info = dbBySubjectGradeLesson.get(codeKey);
          matchedId = info.classroom_id;
          subjectCode = info.subject_code || getSubjectCode(info.subject, info.grade);
          lessonCode = info.lesson_code;
        } else {
          subjectCode = getSubjectCode(subject, grade);
          lessonCode = rawCode;
        }
      }
    }

    // Build target directory
    let targetDir = null;
    if (matchedId && coursesClassroomMap.has(matchedId)) {
      targetDir = coursesClassroomMap.get(matchedId);
    } else {
      let u = 'u1';
      let l = 'l1';
      if (lessonCode) {
        const uMatch = lessonCode.match(/u(\d+)/i) || lessonCode.match(/c(\d+)/i);
        const lMatch = lessonCode.match(/l(\d+)/i) || lessonCode.match(/tocl(\d+)/i);
        if (uMatch) u = `u${uMatch[1]}`;
        if (lMatch) l = `l${lMatch[1]}`;
      }
      const finalSubject = subjectCode || 'unknown';
      const finalId = matchedId || filename.replace(/\.(?:maic\.)?zip$/i, '');
      targetDir = `classrooms/${finalSubject}/${u}/${l}/${finalId}`;
    }

    if (SUBJECT_FILTER && !targetDir.toLowerCase().includes(SUBJECT_FILTER)) {
      continue;
    }

    tasks.push({
      sourceKey: zipKey,
      classroomId: matchedId,
      filename,
      targetDir,
      targetZipKey: `${targetDir}/classroom.zip`,
      targetOriginalZipKey: `${targetDir}/${filename}`,
    });
  }

  console.log(`   ↳ Queued ${tasks.length} ZIP migration tasks.`);

  // 5. Execute Migration with Worker Pool
  console.log(`\n⚡ Phase 5: Migrating ZIP archives to "courses" (${CONCURRENCY} workers)...\n`);

  let processed = 0;
  let copied = 0;
  let skipped = 0;
  let errors = 0;
  const startTime = Date.now();

  async function checkExists(key) {
    try {
      const checkUrl = `${COURSES_URL}/${encodeURI(key).replace(/%2F/g, '/')}`;
      const res = await coursesClient.fetch(checkUrl, { method: 'HEAD' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function worker(workerId, queue) {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;

      try {
        if (SKIP_EXISTING) {
          const alreadyExists = await checkExists(task.targetZipKey);
          if (alreadyExists) {
            skipped++;
            processed++;
            continue;
          }
        }

        if (DRY_RUN) {
          copied++;
        } else {
          let success = false;
          let lastError = null;

          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              // 1. Fetch ZIP from harby
              const sourceUrl = `${HARBY_URL}/${encodeURI(task.sourceKey).replace(/%2F/g, '/')}`;
              const sourceRes = await harbyClient.fetch(sourceUrl);

              if (!sourceRes.ok) {
                lastError = new Error(`Fetch failed with status ${sourceRes.status}`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
                continue;
              }

              const bodyBuffer = await sourceRes.arrayBuffer();

              // 2. Put standard classroom.zip in courses
              const putUrl = `${COURSES_URL}/${encodeURI(task.targetZipKey).replace(/%2F/g, '/')}`;
              const putRes = await coursesClient.fetch(putUrl, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/zip',
                  'Cache-Control': 'public, max-age=31536000, immutable',
                },
                body: bodyBuffer,
              });

              if (putRes.ok) {
                copied++;
                success = true;

                // Optional: delete from harby if requested
                if (DELETE_SOURCE) {
                  await harbyClient.fetch(sourceUrl, { method: 'DELETE' });
                }
                break;
              } else {
                lastError = new Error(`Put failed with status ${putRes.status}`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
              }
            } catch (err) {
              lastError = err;
              await new Promise(r => setTimeout(r, 1000 * attempt));
            }
          }

          if (!success) {
            errors++;
            console.error(`\n❌ [Failed after 3 attempts] ${task.sourceKey}: ${lastError?.message || 'unknown'}`);
          }
        }
      } catch (err) {
        errors++;
        console.error(`\n❌ [Error] ${task.sourceKey}: ${err.message}`);
      }

      processed++;
      if (processed % 10 === 0 || processed === tasks.length) {
        const pct = ((processed / tasks.length) * 100).toFixed(1);
        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (processed / Math.max(1, elapsedSec)).toFixed(1);
        process.stdout.write(`\r[${pct}%] Processed ${processed}/${tasks.length} | Copied: ${copied} | Skipped: ${skipped} | Errors: ${errors} | Rate: ${rate} files/sec (${elapsedSec}s)`);
      }
    }
  }

  const queue = [...tasks];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i, queue));
  }

  await Promise.all(workers);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n════════════════════════════════════════════════════════════════════════════`);
  console.log(`🎉 MIGRATION FINISHED in ${totalTime}s`);
  console.log(`   Total Tasks: ${tasks.length}`);
  console.log(`   Copied:      ${copied}`);
  console.log(`   Skipped:     ${skipped}`);
  console.log(`   Errors:      ${errors}`);
  console.log(`════════════════════════════════════════════════════════════════════════════\n`);
}

migrateHarbyZips().catch(e => {
  console.error('Fatal Error:', e);
  process.exit(1);
});
