/**
 * Cloudflare Pages Function — Progressive Scene-by-Scene ZIP Streamer
 * 
 * Endpoints:
 * 1. /api/classroom-zip/data?zip=... 
 *    -> Extracts manifest/classroom JSON and rewrites media URLs for lazy streaming.
 * 2. /api/classroom-zip/media?zip=...&file=... 
 *    -> Streams individual scene assets on-demand with HTTP 206 Range support and Edge Caching.
 */

import JSZip from 'jszip';
import { AwsClient } from 'aws4fetch';

interface Env {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
}

const R2_ACCOUNT_ID = '656055b2b0eea86b43dd2fd4853c100f';

const S3_COURSES_CLIENT = new AwsClient({
  accessKeyId: 'f942f0be0f3d93ab1e338b10e896bd78',
  secretAccessKey: 'b7b862585c23e3fa2149ee0a919ba7a3f4c6bc0992d8f3cbc0b1a4f9c2ad55aa',
  service: 's3',
  region: 'auto',
});

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    webp: 'image/webp',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    json: 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

async function fetchZipBuffer(requestUrl: URL, zipParam: string, env: Env): Promise<ArrayBuffer | null> {
  const cleanZip = zipParam.replace(/^\/+/, '');

  // 1. If relative to origin (e.g. /samples/test-classroom.zip)
  if (zipParam.startsWith('/') || zipParam.startsWith('./') || zipParam.startsWith('samples/')) {
    const originUrl = new URL(zipParam.startsWith('/') ? zipParam : `/${cleanZip}`, requestUrl.origin);
    try {
      const res = await fetch(originUrl.toString());
      if (res.ok) return await res.arrayBuffer();
    } catch (_e) {}
  }

  // 2. If full external URL
  if (zipParam.startsWith('http://') || zipParam.startsWith('https://')) {
    try {
      const res = await fetch(zipParam);
      if (res.ok) return await res.arrayBuffer();
    } catch (_e) {}
  }

  // 3. From R2 COURSES bucket binding
  if (env.COURSES) {
    try {
      const obj = await env.COURSES.get(cleanZip);
      if (obj) return await obj.arrayBuffer();
    } catch (_e) {}
  }

  // 4. From public R2 dev domain
  try {
    const publicUrl = `https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/${encodeURI(cleanZip).replace(/%2F/g, '/')}`;
    const pubRes = await fetch(publicUrl, { method: 'GET' });
    if (pubRes.ok) return await pubRes.arrayBuffer();
  } catch (_e) {}

  return null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const pathSegments = (params.path as string[] || []).join('/');

  const zipParam = url.searchParams.get('zip') || url.searchParams.get('zipUrl') || '';
  const fileParam = url.searchParams.get('file') || '';

  if (!zipParam) {
    return new Response(JSON.stringify({ error: 'Missing required "zip" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Mode 1: Individual Scene Media Streaming (/api/classroom-zip/media) ──
  if (pathSegments.includes('media') || fileParam) {
    if (!fileParam) {
      return new Response(JSON.stringify({ error: 'Missing required "file" parameter for media extraction' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check Cloudflare edge cache
    const cacheKey = new Request(url.toString(), request);
    const cache = (caches as any).default;
    if (cache && request.method === 'GET' && !request.headers.get('Range')) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    const zipBuffer = await fetchZipBuffer(url, zipParam, env);
    if (!zipBuffer) {
      return new Response(JSON.stringify({ error: 'Failed to load ZIP archive' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const zip = await JSZip.loadAsync(zipBuffer);
    const cleanFileName = fileParam.replace(/^\/+/, '');
    const candidateFiles = [
      cleanFileName,
      fileParam,
      cleanFileName.split('/').pop() || cleanFileName,
      `audio/${cleanFileName.split('/').pop()}`,
      `media/${cleanFileName.split('/').pop()}`,
      `images/${cleanFileName.split('/').pop()}`,
    ];

    let matchedFile: JSZip.JSZipObject | null = null;
    for (const c of candidateFiles) {
      const f = zip.file(c);
      if (f && !f.dir) {
        matchedFile = f;
        break;
      }
    }

    if (!matchedFile) {
      // Regex search as fallback
      const baseName = cleanFileName.split('/').pop() || cleanFileName;
      const found = zip.file(new RegExp(`${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
      if (found && found.length > 0) {
        matchedFile = found[0];
      }
    }

    if (!matchedFile) {
      return new Response(JSON.stringify({ error: `File not found in ZIP: ${fileParam}` }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileArrayBuffer = await matchedFile.async('arraybuffer');
    const totalSize = fileArrayBuffer.byteLength;
    const contentType = getMimeType(matchedFile.name);
    const rangeHeader = request.headers.get('Range');

    // Handle HTTP 206 Range requests for audio/video streaming
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${totalSize}` },
        });
      }

      const chunk = fileArrayBuffer.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Content-Length': String(chunk.byteLength),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    const response = new Response(fileArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(totalSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
        'ETag': `W/"zip-${totalSize}-${matchedFile.name}"`,
      },
    });

    if (cache && request.method === 'GET') {
      context.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  }

  // ── Mode 2: Classroom Manifest Extraction & URL Rewriting (/api/classroom-zip/data) ──
  const zipBuffer = await fetchZipBuffer(url, zipParam, env);
  if (!zipBuffer) {
    return new Response(JSON.stringify({ error: 'Failed to fetch ZIP archive from source' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const zip = await JSZip.loadAsync(zipBuffer);

  // Find manifest or classroom JSON
  const manifestFile = zip.file(/(?:^|\/)manifest\.json$/i)[0] ||
                       zip.file(/(?:^|\/)classroom\.json$/i)[0] ||
                       zip.file(/(?:^|\/)classdata\.json$/i)[0] ||
                       zip.file(/\.json$/i)[0];

  if (!manifestFile) {
    return new Response(JSON.stringify({ error: 'No manifest.json or classroom.json found inside ZIP archive' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jsonText = await manifestFile.async('string');
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: `JSON parse error: ${e.message}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper to construct lazy media stream URL
  const buildMediaUrl = (fileRef: string) => {
    if (!fileRef || /^(http|data:|blob:)/.test(fileRef)) return fileRef;
    const cleanRef = fileRef.replace(/^\/+/, '');
    return `/api/classroom-zip/media?zip=${encodeURIComponent(zipParam)}&file=${encodeURIComponent(cleanRef)}`;
  };

  // Rewrite slide images & videos
  if (Array.isArray(parsed.scenes)) {
    parsed.scenes.forEach((scene: any) => {
      if (scene.type === 'slide' && scene.content?.canvas?.elements) {
        scene.content.canvas.elements.forEach((el: any) => {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            el.src = buildMediaUrl(el.src);
          }
        });
      }

      // Rewrite speech audio and visual overlays
      if (Array.isArray(scene.actions)) {
        scene.actions.forEach((act: any) => {
          if (act.type === 'speech' || act.type === 'speak') {
            if (act.audioUrl) act.audioUrl = buildMediaUrl(act.audioUrl);
            if (act.audioRef) act.audioUrl = buildMediaUrl(act.audioRef);
            if (act.visualUrl) act.visualUrl = buildMediaUrl(act.visualUrl);
          }
        });
      }
    });
  }

  // Return the transformed ClassroomData
  return new Response(JSON.stringify({
    status: 'ok',
    format: 'zip-stream',
    zip: zipParam,
    data: parsed,
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
