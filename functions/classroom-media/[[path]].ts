/**
 * Cloudflare Pages Function — Classroom Media Proxy & Fallback
 * 
 * If a media file (image/video) is pre-downloaded in public/classroom-media/,
 * Cloudflare Pages serves it directly as a static asset.
 * If not present statically, this function transparently fetches and caches
 * it from the upstream OpenMAIC CDN (following any temporary redirects).
 */

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const pathParts = params.path;
  const mediaPath = Array.isArray(pathParts) ? pathParts.join('/') : (pathParts || '');

  if (!mediaPath) {
    return new Response(JSON.stringify({ error: 'Missing media path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstreamUrl = `https://open.maic.chat/api/classroom-media/${mediaPath}`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      redirect: 'follow',
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Cloudflare-Pages-MediaProxy',
        'Accept': request.headers.get('Accept') || '*/*',
      },
    });

    if (!upstreamRes.ok) {
      return new Response(`Media not found: ${upstreamRes.status}`, { status: upstreamRes.status });
    }

    const headers = new Headers(upstreamRes.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=604800, immutable');

    return new Response(upstreamRes.body, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err?.message || 'Unknown error'}`, { status: 502 });
  }
};
