/**
 * Cloudflare Pages Function — Private Courses R2 Proxy
 * Serves private HTML lesson files, classroom JSONs, and TTS voice audio with Range support.
 */

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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Extract requested key from wildcards
  const pathParts = params.path;
  const key = Array.isArray(pathParts)
    ? pathParts.join('/')
    : (pathParts || '');

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing object key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cleanKey = decodeURIComponent(key).replace(/^\/+/, '');
  const mime = getMimeType(cleanKey);
  const rangeHeader = request.headers.get('Range');

  // 1. Try Direct R2 Binding (COURSES)
  if (env.COURSES) {
    try {
      const getOptions: R2GetOptions = {};
      if (rangeHeader) {
        // Parse range header e.g. "bytes=0-1024"
        const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (match) {
          const offset = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : undefined;
          const length = end !== undefined ? end - offset + 1 : undefined;
          getOptions.range = { offset, length };
        }
      }

      const obj = await env.COURSES.get(cleanKey, getOptions);
      if (obj) {
        const headers = new Headers();
        headers.set('Content-Type', mime);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'private, max-age=3600');
        if (obj.httpEtag) headers.set('ETag', obj.httpEtag);

        if ('range' in obj && obj.range) {
          headers.set('Content-Range', `bytes ${obj.range.offset}-${obj.range.offset + obj.size - 1}/${obj.size}`);
          return new Response(obj.body, { status: 206, headers });
        }

        headers.set('Content-Length', String(obj.size));
        return new Response(obj.body, { status: 200, headers });
      }
    } catch (_err) {
      // Fall through to S3 client
    }
  }

  // 2. Try HARBY Binding if in legacy classrooms
  if (env.HARBY && cleanKey.startsWith('classrooms/')) {
    try {
      const obj = await env.HARBY.get(cleanKey);
      if (obj) {
        const headers = new Headers();
        headers.set('Content-Type', mime);
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'private, max-age=3600');
        return new Response(obj.body, { status: 200, headers });
      }
    } catch (_err) {}
  }

  // 3. Fallback to Public R2 Domain
  try {
    const publicUrl = `https://pub-a7d6ac39d1654484ad48d9a264e93d51.r2.dev/${encodeURI(cleanKey).replace(/%2F/g, '/')}`;
    const pubHeaders: Record<string, string> = {};
    if (rangeHeader) pubHeaders['Range'] = rangeHeader;

    const pubRes = await fetch(publicUrl, {
      method: 'GET',
      headers: pubHeaders,
    });

    if (pubRes.ok || pubRes.status === 206) {
      const headers = new Headers(pubRes.headers);
      headers.set('Content-Type', mime);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'private, max-age=3600');
      return new Response(pubRes.body, {
        status: pubRes.status,
        headers,
      });
    }
  } catch (_e) {}

  return new Response(JSON.stringify({ error: 'Not found', key: cleanKey }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
};
