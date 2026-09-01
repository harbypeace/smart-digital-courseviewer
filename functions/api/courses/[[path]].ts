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

function getRangeOptions(rangeHeader: string | null): R2GetOptions {
  const options: R2GetOptions = {};
  if (!rangeHeader) return options;

  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return options;
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isSafeInteger(offset) || (end !== undefined && !Number.isSafeInteger(end)) || (end !== undefined && end < offset)) {
    return options;
  }
  options.range = { offset, length: end === undefined ? undefined : end - offset + 1 };
  return options;
}

function objectResponse(request: Request, object: R2ObjectBody, mime: string): Response {
  const headers = new Headers();
  headers.set('Content-Type', mime);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=3600');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  if ('range' in object && object.range) {
    const rangeStart = 'suffix' in object.range
      ? Math.max(0, object.size - object.range.suffix)
      : (object.range.offset ?? 0);
    headers.set('Content-Range', `bytes ${rangeStart}-${rangeStart + object.size - 1}/${rangeStart + object.size}`);
    headers.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

function isEnabled(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
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
  const getOptions = getRangeOptions(rangeHeader);

  if (env.COURSES) {
    try {
      const object = await env.COURSES.get(cleanKey, getOptions);
      if (object) return objectResponse(request, object, mime);
    } catch (_error) {
      // Try the legacy classroom binding and optional diagnostic fallback.
    }
  }

  if (env.HARBY && cleanKey.startsWith('classrooms/')) {
    try {
      const object = await env.HARBY.get(cleanKey, getOptions);
      if (object) return objectResponse(request, object, mime);
    } catch (_error) {
      // Continue to the not-found response below.
    }
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
  }

  return new Response(JSON.stringify({ error: 'Not found', key: cleanKey }), {
    status: 404,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
