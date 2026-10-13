/**
 * Cloudflare Pages Function — Private Courses R2 Proxy.
 *
 * Protected objects are served from R2 bindings. The public R2 fallback is
 * deliberately opt-in for local migration diagnostics and must never be
 * enabled implicitly in a production deployment.
 */

interface Env {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
  ALLOW_PUBLIC_R2_FALLBACK?: string;
}

const PUBLIC_R2_COURSES = 'https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev';
const PUBLIC_OPENMAIC_MEDIA = 'https://open.maic.chat/api/classroom-media';

function getMimeType(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p.endsWith('.json')) return 'application/json; charset=utf-8';
  if (p.endsWith('.html') || p.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (p.endsWith('.css')) return 'text/css; charset=utf-8';
  if (p.endsWith('.js') || p.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (p.endsWith('.mp3')) return 'audio/mpeg';
  if (p.endsWith('.wav')) return 'audio/wav';
  if (p.endsWith('.ogg')) return 'audio/ogg';
  if (p.endsWith('.mp4')) return 'video/mp4';
  if (p.endsWith('.zip') || p.endsWith('.maic.zip')) return 'application/zip';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
  if (p.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function decodeSafeKey(encodedKey: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(encodedKey);
  } catch (_error) {
    return null;
  }

  const clean = decoded.replace(/^\/+/, '');
  if (!clean || clean.includes('\\') || /[\u0000-\u001f\u007f]/.test(clean)) return null;
  const segments = clean.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;
  return clean;
}

interface ParsedByteRange {
  offset: number;
  length: number;
  end: number;
}

function parseRangeHeader(rangeHeader: string | null, totalSize: number): ParsedByteRange | null {
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) return null;

  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/i);
  if (match) {
    const offset = parseInt(match[1], 10);
    const rawEnd = match[2] ? parseInt(match[2], 10) : undefined;
    const end = rawEnd !== undefined && !isNaN(rawEnd) ? Math.min(rawEnd, totalSize - 1) : totalSize - 1;
    if (!isNaN(offset) && offset >= 0 && offset <= end && offset < totalSize) {
      return { offset, length: end - offset + 1, end };
    }
    return null;
  }

  const suffixMatch = rangeHeader.match(/^bytes=-(\d+)$/i);
  if (suffixMatch) {
    const suffix = parseInt(suffixMatch[1], 10);
    if (!isNaN(suffix) && suffix > 0) {
      const offset = Math.max(0, totalSize - suffix);
      const end = totalSize - 1;
      return { offset, length: end - offset + 1, end };
    }
  }

  return null;
}

function objectResponse(request: Request, object: R2ObjectBody, mime: string, totalSize?: number): Response {
  const headers = new Headers();
  headers.set('Content-Type', mime);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  const rangeHeader = request.headers.get('Range');
  const fullSize = typeof totalSize === 'number' && !isNaN(totalSize) ? totalSize : object.size;

  // 1. If no Range requested, return standard 200 OK (never 206)
  if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
    headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  }

  // 2. Parse range header
  const parsed = parseRangeHeader(rangeHeader, fullSize);
  if (!parsed) {
    const offsetMatch = rangeHeader.match(/^bytes=(\d+)-/i);
    if (offsetMatch && parseInt(offsetMatch[1], 10) >= fullSize) {
      headers.set('Content-Range', `bytes */${fullSize}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  }

  // 3. Return RFC-compliant 206 Partial Content
  headers.set('Content-Range', `bytes ${parsed.offset}-${parsed.end}/${fullSize}`);
  headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
}

function isEnabled(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

async function fetchLegacyPublicAudio(cleanKey: string, request: Request, env?: Env): Promise<Response | null> {
  const match = cleanKey.match(/^classrooms\/([^/]+)\/(u\d+)\/(l\d+)\/([^/]+)\/tts\/scene_(\d+)_speech_(\d+)\.mp3$/i);
  if (!match) return null;

  const [, subject, unit, lesson, classroomId, sceneIndexText, speechIndexText] = match;
  try {
    let manifest: any = null;
    const manifestKey = `classrooms/${subject}/${unit}/${lesson}/${classroomId}/classdata.json`;
    if (env?.COURSES) {
      try {
        const obj = await env.COURSES.get(manifestKey);
        if (obj) manifest = await obj.json();
      } catch (_e) {}
    }

    if (!manifest) {
      const manifestUrl = `${PUBLIC_R2_COURSES}/${manifestKey}`;
      const manifestResponse = await fetch(manifestUrl);
      if (manifestResponse.ok) manifest = await manifestResponse.json();
    }

    if (!manifest) return null;

    const sceneIndex = Number(sceneIndexText);
    const speechIndex = Number(speechIndexText);
    const actions = Array.isArray(manifest?.scenes?.[sceneIndex]?.actions)
      ? manifest.scenes[sceneIndex].actions.filter((action: any) => action?.type === 'speech' || action?.type === 'speak' || action?.audio || action?.audioUrl || action?.url)
      : [];
    const action = actions[speechIndex];
    const raw = action?.audioUrl || action?.url || action?.audioRef || '';
    const matchId = String(raw).match(/(?:^|\/)audio\/([^/?#]+)\.(?:mp3|wav)/i);
    const audioId = action?.audioId || matchId?.[1] || (raw && !String(raw).startsWith('http') ? String(raw).split('/').pop()?.replace(/\.(mp3|wav)$/i, '') : '');
    if (!audioId) return null;

    // Check R2 courses bucket first
    if (env?.COURSES) {
      try {
        const audioKey = `classrooms/${subject}/${unit}/${lesson}/${classroomId}/audio/${audioId}.mp3`;
        const obj = await env.COURSES.get(audioKey);
        if (obj) return objectResponse(request, obj, 'audio/mpeg');

        const audioWavKey = `classrooms/${subject}/${unit}/${lesson}/${classroomId}/audio/${audioId}.wav`;
        const wavObj = await env.COURSES.get(audioWavKey);
        if (wavObj) return objectResponse(request, wavObj, 'audio/wav');
      } catch (_e) {}
    }

    const audioUrl = `${PUBLIC_OPENMAIC_MEDIA}/${encodeURIComponent(classroomId)}/audio/${encodeURIComponent(audioId)}.mp3`;
    const headers = new Headers();
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);
    const audioResponse = await fetch(audioUrl, { method: request.method, headers });
    if (!audioResponse.ok && audioResponse.status !== 206) return null;
    const responseHeaders = new Headers(audioResponse.headers);
    responseHeaders.set('Content-Type', 'audio/mpeg');
    responseHeaders.set('Cache-Control', 'private, max-age=3600');
    responseHeaders.set('Accept-Ranges', 'bytes');
    return new Response(request.method === 'HEAD' ? null : audioResponse.body, {
      status: audioResponse.status,
      headers: responseHeaders,
    });
  } catch (_error) {
    return null;
  }
}

async function getBucketObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  mime: string
): Promise<Response | null> {
  const rangeHeader = request.headers.get('Range');
  try {
    if (!rangeHeader || !/^bytes=/i.test(rangeHeader)) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      if (mime.startsWith('audio/') && obj.size < 64) return null;
      return objectResponse(request, obj, mime, obj.size);
    }

    const head = await bucket.head(key);
    if (!head) return null;
    if (mime.startsWith('audio/') && head.size < 64) return null;

    const parsed = parseRangeHeader(rangeHeader, head.size);
    if (!parsed) {
      const offsetMatch = rangeHeader.match(/^bytes=(\d+)-/i);
      if (offsetMatch && parseInt(offsetMatch[1], 10) >= head.size) {
        const headers = new Headers();
        headers.set('Content-Range', `bytes */${head.size}`);
        return new Response(null, { status: 416, headers });
      }
      const obj = await bucket.get(key);
      if (!obj) return null;
      return objectResponse(request, obj, mime, head.size);
    }

    const obj = await bucket.get(key, { range: { offset: parsed.offset, length: parsed.length } });
    if (!obj) return null;
    return objectResponse(request, obj, mime, head.size);
  } catch (_e) {
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const pathParts = params.path;
  const encodedKey = Array.isArray(pathParts) ? pathParts.join('/') : (pathParts || '');
  const cleanKey = decodeSafeKey(encodedKey);
  if (!cleanKey) {
    return new Response(JSON.stringify({ error: 'Invalid or missing object key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const mime = getMimeType(cleanKey);
  const rangeHeader = request.headers.get('Range');

  if (env.COURSES) {
    const res = await getBucketObject(env.COURSES, cleanKey, request, mime);
    if (res) return res;

    // Check alternate audio format (.mp3 <-> .wav)
    if (cleanKey.endsWith('.mp3')) {
      const altKey = cleanKey.replace(/\.mp3$/i, '.wav');
      const altRes = await getBucketObject(env.COURSES, altKey, request, 'audio/wav');
      if (altRes) return altRes;
    } else if (cleanKey.endsWith('.wav')) {
      const altKey = cleanKey.replace(/\.wav$/i, '.mp3');
      const altRes = await getBucketObject(env.COURSES, altKey, request, 'audio/mpeg');
      if (altRes) return altRes;
    }
  }

  if (env.HARBY && cleanKey.startsWith('classrooms/')) {
    const res = await getBucketObject(env.HARBY, cleanKey, request, mime);
    if (res) return res;
  }

  if (isEnabled(env.ALLOW_PUBLIC_R2_FALLBACK)) {
    try {
      const publicUrl = `${PUBLIC_R2_COURSES}/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
      const publicHeaders: HeadersInit = {};
      if (rangeHeader) publicHeaders.Range = rangeHeader;
      const publicResponse = await fetch(publicUrl, { method: request.method, headers: publicHeaders });
      if (publicResponse.ok || publicResponse.status === 206) {
        const headers = new Headers(publicResponse.headers);
        headers.set('Content-Type', mime);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'private, max-age=3600');
        return new Response(request.method === 'HEAD' ? null : publicResponse.body, {
          status: publicResponse.status,
          headers,
        });
      }
    } catch (_error) {
      // Return a consistent not-found response.
    }

    const legacyAudio = await fetchLegacyPublicAudio(cleanKey, request, env);
    if (legacyAudio) return legacyAudio;
  }

  // Also try legacy audio resolver if key matches the tts pattern
  const legacyAudio = await fetchLegacyPublicAudio(cleanKey, request, env);
  if (legacyAudio) return legacyAudio;

  // Fallback for direct audio assets: classrooms/.../audio/{filename}
  const audioMatch = cleanKey.match(/^classrooms\/([^/]+)\/(u\d+)\/(l\d+)\/([^/]+)\/audio\/([^/]+)$/i);
  if (audioMatch) {
    const [, , , , classroomId, audioFile] = audioMatch;
    try {
      const audioUrl = `${PUBLIC_OPENMAIC_MEDIA}/${encodeURIComponent(classroomId)}/audio/${encodeURIComponent(audioFile)}`;
      const headers = new Headers();
      if (rangeHeader) headers.set('Range', rangeHeader);
      const audioRes = await fetch(audioUrl, { method: request.method, headers });
      if (audioRes.ok || audioRes.status === 206) {
        const resHeaders = new Headers(audioRes.headers);
        resHeaders.set('Content-Type', mime);
        resHeaders.set('Cache-Control', 'private, max-age=3600');
        resHeaders.set('Accept-Ranges', 'bytes');
        return new Response(request.method === 'HEAD' ? null : audioRes.body, {
          status: audioRes.status,
          headers: resHeaders,
        });
      }
    } catch (_e) {}
  }

  return new Response(JSON.stringify({ error: 'Not found', key: cleanKey }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
