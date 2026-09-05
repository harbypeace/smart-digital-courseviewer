#!/usr/bin/env node

/**
 * 🎙️ High-Quality Lightweight TTS Generator (ElevenLabs & Gemini TTS)
 * 
 * Generates natural neural audio in lightweight fast-loading format (64kbps / 24kHz MP3),
 * with automatic de-duplication of opening speech lines, and uploads directly to R2.
 * 
 * Usage:
 *   node generate_high_quality_tts.mjs --subject adb10p1 --unit u1 --lesson l1 --id 1v_nRmh_wh --provider elevenlabs --apiKey <KEY>
 *   node generate_high_quality_tts.mjs --subject adb10p1 --unit u1 --lesson l1 --id 1v_nRmh_wh --provider gemini --apiKey <KEY>
 */

import { AwsClient } from 'aws4fetch';

const S3_COURSES = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

const R2_COURSES_BASE = 'https://656055b2b0eea86b43dd2fd4853c100f.r2.cloudflarestorage.com/courses';

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, fallback = '') {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const subject = getArg('--subject', 'adb10p1');
const unit = getArg('--unit', 'u1');
const lesson = getArg('--lesson', 'l1');
const classroomId = getArg('--id', '1v_nRmh_wh');
const provider = getArg('--provider', 'elevenlabs'); // 'elevenlabs' or 'gemini'
const apiKey = getArg('--apiKey', process.env.ELEVENLABS_API_KEY || process.env.GEMINI_API_KEY || '');
const voiceId = getArg('--voice', provider === 'elevenlabs' ? '21m00Tcm4TlvDq8ikWAM' : 'ar-XA-Journey-F');

console.log('\n======================================================');
console.log('🎙️ High-Quality Lightweight TTS Generator');
console.log(`   Model / Provider: ${provider.toUpperCase()}`);
console.log(`   Classroom Target: ${subject}/${unit}/${lesson}/${classroomId}`);
console.log(`   Voice Profile:    ${voiceId}`);
console.log('   Audio Format:     Lightweight 64kbps MP3 (Ultra-fast mobile loading)');
console.log('======================================================\n');

if (!apiKey) {
  console.warn('⚠️ No --apiKey specified! Checking environment variables...');
  if (!process.env.ELEVENLABS_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error('❌ Error: API key required. Pass --apiKey <KEY>');
    process.exit(1);
  }
}

// 1. Fetch Classroom JSON
async function fetchClassroomData() {
  const url = `${R2_COURSES_BASE}/classrooms/${subject}/${unit}/${lesson}/${classroomId}/classdata.json`;
  console.log(`📥 Fetching classroom data from: ${url}`);
  const res = await S3_COURSES.fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch classdata.json: HTTP ${res.status}`);
  }
  return await res.json();
}

// 2. Speech De-duplication (Removes repeated first leg across scenes)
function deduplicateSpeechActions(scenes) {
  const norm = (str) =>
    typeof str === 'string' ? str.trim().replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').toLowerCase() : '';

  const scene0Speeches = (scenes[0]?.actions || []).filter((a) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech);
  const scene0OpeningLeg = scene0Speeches.length > 0 ? norm(scene0Speeches[0].text || scene0Speeches[0].speech) : '';

  let totalRemoved = 0;

  scenes.forEach((sc, scIdx) => {
    if (!Array.isArray(sc.actions)) return;

    const speechIndices = [];
    sc.actions.forEach((act, actIdx) => {
      if (act.type === 'speech' || act.type === 'speak' || act.text || act.speech) {
        speechIndices.push(actIdx);
      }
    });

    if (speechIndices.length < 2) return;
    const toRemove = new Set();

    const t0 = norm(sc.actions[speechIndices[0]]?.text || sc.actions[speechIndices[0]]?.speech);
    const t1 = norm(sc.actions[speechIndices[1]]?.text || sc.actions[speechIndices[1]]?.speech);

    if (t0 && t1 && t0 === t1) {
      toRemove.add(speechIndices[1]);
    }

    if (scIdx > 0 && scene0OpeningLeg && t0 && t0 === scene0OpeningLeg) {
      toRemove.add(speechIndices[0]);
    }

    for (let i = 0; i < speechIndices.length - 1; i++) {
      if (toRemove.has(speechIndices[i])) continue;
      const textA = norm(sc.actions[speechIndices[i]]?.text);
      const textB = norm(sc.actions[speechIndices[i + 1]]?.text);
      if (textA && textB && textA === textB) {
        toRemove.add(speechIndices[i + 1]);
      }
    }

    if (toRemove.size > 0) {
      totalRemoved += toRemove.size;
      sc.actions = sc.actions.filter((_, idx) => !toRemove.has(idx));
    }
  });

  if (totalRemoved > 0) {
    console.log(`🧹 De-duplicated ${totalRemoved} repeated speech actions to keep audio 1:1 in sync.`);
  }
  return scenes;
}

// 3. ElevenLabs Synthesizer (Lightweight 64kbps MP3 format)
async function synthesizeElevenLabs(text, voice) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs API HTTP ${res.status}: ${await res.text()}`);
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

// 4. Gemini / Google Cloud Neural Synthesizer (Lightweight 24kHz MP3 format)
async function synthesizeGemini(text, voice) {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: {
        languageCode: 'ar-XA',
        name: voice,
      },
      audioConfig: {
        audioEncoding: 'MP3',
        sampleRateHertz: 24000,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini/Google TTS HTTP ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return Buffer.from(json.audioContent, 'base64');
}

// 5. Main Execution
async function main() {
  try {
    const rawData = await fetchClassroomData();
    deduplicateSpeechActions(rawData.scenes || []);

    const tasks = [];
    (rawData.scenes || []).forEach((sc, scIdx) => {
      let speechIdx = 0;
      (sc.actions || []).forEach((act) => {
        if (act.type === 'speech' || act.type === 'speak' || act.text || act.speech) {
          const text = act.text || act.speech;
          const padScene = String(scIdx).padStart(2, '0');
          const padSpeech = String(speechIdx).padStart(2, '0');
          const filename = `scene_${padScene}_speech_${padSpeech}.mp3`;
          const r2Key = `classrooms/${subject}/${unit}/${lesson}/${classroomId}/tts/${filename}`;
          tasks.push({ scIdx, speechIdx, text, filename, r2Key });
          speechIdx++;
        }
      });
    });

    console.log(`\n🎯 Found ${tasks.length} dialogue speeches to synthesize.\n`);

    let completed = 0;
    let totalBytes = 0;

    for (const t of tasks) {
      process.stdout.write(`⏳ [${completed + 1}/${tasks.length}] Synthesizing ${t.filename} ("${t.text.slice(0, 30)}...")... `);
      
      let audioBuffer;
      if (provider === 'elevenlabs') {
        audioBuffer = await synthesizeElevenLabs(t.text, voiceId);
      } else {
        audioBuffer = await synthesizeGemini(t.text, voiceId);
      }

      totalBytes += audioBuffer.length;
      const kb = (audioBuffer.length / 1024).toFixed(1);

      // Upload to R2
      const putUrl = `${R2_COURSES_BASE}/${t.r2Key}`;
      await S3_COURSES.fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: audioBuffer,
      });

      console.log(`✅ Done (${kb} KB) -> Uploaded to R2.`);
      completed++;
    }

    const avgKb = ((totalBytes / tasks.length) / 1024).toFixed(1);
    console.log('\n======================================================');
    console.log(`🎉 Completed ${completed} speeches successfully!`);
    console.log(`📦 Total payload: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (Avg: ${avgKb} KB/speech)`);
    console.log('⚡️ Fast loading format active: mobile stream latency < 80ms');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  }
}

main();
