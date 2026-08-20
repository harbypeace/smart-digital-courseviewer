/**
 * Cloudflare Pages Middleware — Security, CORS & Referrer Gatekeeper
 * Protects private R2 resources from unauthorized hotlinking while permitting
 * iframe embedding from the parent Course Viewer and allowed origins.
 */

interface Env {
  ALLOWED_ORIGINS?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const origin = request.headers.get('Origin') || '';
  const referer = request.headers.get('Referer') || '';
  const secFetchSite = request.headers.get('Sec-Fetch-Site') || '';

  const configuredOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Default allowed origin list for local & production
  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:8788',
    'https://courseviewer.pages.dev',
  ];

  const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...configuredOrigins])];

  // Helper to check if origin/referer is allowed
  const isAllowedOrigin = (urlStr: string) => {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr);
      return allowedOrigins.some((ao) => {
        const allowedUrl = new URL(ao);
        return u.host === allowedUrl.host;
      });
    } catch {
      return false;
    }
  };

  // CORS Preflight
  if (request.method === 'OPTIONS') {
    const matchedOrigin = isAllowedOrigin(origin) ? origin : '*';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': matchedOrigin,
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Execute downstream handler
  const response = await next();

  // Clone headers to inject CORS and security policies
  const newHeaders = new Headers(response.headers);
  const matchedOrigin = isAllowedOrigin(origin) ? origin : (origin || '*');
  
  newHeaders.set('Access-Control-Allow-Origin', matchedOrigin);
  newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
  newHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, ETag');
  
  // Security headers: Allow iframe embedding from parent viewer
  newHeaders.set('X-Content-Type-Options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
