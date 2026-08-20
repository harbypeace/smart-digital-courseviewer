/**
 * Comprehensive migration script:
 * 1. Indexes all existing classroom directories in bucket "courses" by classroomId.
 * 2. Scans bucket "harby" for all TTS audio files under "classroom_tts/".
 * 3. Matches classroomId and copies the TTS audio files directly into:
 *    "courses" -> classrooms/{subject}/u{N}/l{M}/{classroomId}/tts/{filename.mp3}
 */

async function migrateHarbyTts() {
  const { AwsClient } = await import('aws4fetch');

  // Harby Client
  const harbyClient = new AwsClient({
    accessKeyId: '115e5ab22e3038a46bfc4ec8d423eb44',
    secretAccessKey: 'cbadbe67c8bcfc786f2e5b540a1249cd723baf0c575ff69f940851dd2665d89c',
    service: 's3',
    region: 'auto',
  });

  // Courses Client
  const coursesClient = new AwsClient({
    accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
    secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
    service: 's3',
    region: 'auto',
  });

  const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';
  const COURSES_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/courses`;
  const HARBY_URL = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/harby`;

  console.log('⚡️ Phase 1: Indexing classrooms directory tree in bucket "courses"...');

  const classroomPathMap = new Map(); // classroomId -> "classrooms/adb10p1/u1/l1/1v_nRmh_wh"
  let token = null;

  do {
    let url = `${COURSES_URL}?prefix=classrooms%2F&max-keys=1000`;
    if (token) url += `&continuation-token=${encodeURIComponent(token)}`;

    const res = await coursesClient.fetch(url);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);

    for (const key of keys) {
      // e.g. classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json
      const parts = key.split('/');
      if (parts.length >= 5) {
        const classId = parts[4];
        const dirPath = parts.slice(0, 5).join('/');
        if (!classroomPathMap.has(classId)) {
          classroomPathMap.set(classId, dirPath);
        }
      }
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    token = nextTokenMatch ? nextTokenMatch[1] : null;
    process.stdout.write(`\rIndexed ${classroomPathMap.size} unique classrooms...`);
  } while (token);

  console.log(`\n✅ Indexed ${classroomPathMap.size} unique classrooms in "courses" bucket.`);

  console.log('\n⚡️ Phase 2: Scanning all TTS audio files in bucket "harby"...');

  let harbyToken = null;
  const ttsItems = [];

  do {
    let url = `${HARBY_URL}?prefix=classroom_tts%2F&max-keys=1000`;
    if (harbyToken) url += `&continuation-token=${encodeURIComponent(harbyToken)}`;

    const res = await harbyClient.fetch(url);
    const xml = await res.text();
    const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map(m => m[1]);

    for (const key of keys) {
      // e.g. classroom_tts/adab/u1l1/1v_nRmh_wh/intro_speech.mp3
      const parts = key.split('/');
      if (parts.length >= 4) {
        const classId = parts[3];
        const filename = parts.slice(4).join('/') || parts[3];
        ttsItems.push({ key, classId, filename: parts[parts.length - 1] });
      }
    }

    const nextTokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
    harbyToken = nextTokenMatch ? nextTokenMatch[1] : null;
    process.stdout.write(`\rFound ${ttsItems.length} TTS audio files in "harby"...`);
  } while (harbyToken);

  console.log(`\n🎯 Total TTS files to copy: ${ttsItems.length}`);

  console.log('\n⚡️ Phase 3: Copying TTS audio files to matching classroom folders in "courses"...');

  let processed = 0;
  let copied = 0;
  let skipped = 0;
  let errors = 0;
  const CONCURRENCY = 40;

  async function worker(workerId, queue) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      let targetDir = classroomPathMap.get(item.classId);
      let targetKey = '';

      if (targetDir) {
        targetKey = `${targetDir}/tts/${item.filename}`;
      } else {
        // Fallback relative structure
        const sub = item.key.replace('classroom_tts/', 'classrooms/');
        targetKey = sub;
      }

      try {
        // Stream fetch from harby
        const sourceUrl = `${HARBY_URL}/${encodeURI(item.key).replace(/%2F/g, '/')}`;
        const sourceRes = await harbyClient.fetch(sourceUrl);

        if (sourceRes.ok) {
          const bodyBuffer = await sourceRes.arrayBuffer();
          // Put into courses bucket
          const putUrl = `${COURSES_URL}/${encodeURI(targetKey).replace(/%2F/g, '/')}`;
          const putRes = await coursesClient.fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
            body: bodyBuffer,
          });

          if (putRes.ok) {
            copied++;
          } else {
            errors++;
          }
        } else {
          skipped++;
        }
      } catch (err) {
        errors++;
      }

      processed++;
      if (processed % 100 === 0 || processed === ttsItems.length) {
        const pct = ((processed / ttsItems.length) * 100).toFixed(1);
        process.stdout.write(`\r[${pct}%] Processed ${processed}/${ttsItems.length} (Copied: ${copied}, Errors: ${errors})`);
      }
    }
  }

  const queue = [...ttsItems];
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push(worker(i, queue));
  }

  await Promise.all(workers);
  console.log(`\n\n🎉 Migration Complete! Successfully copied ${copied} TTS audio files into "courses" classroom folders.`);
}

migrateHarbyTts();
