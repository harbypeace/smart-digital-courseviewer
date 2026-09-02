import { authorizeRequest, getSubjectFromRequest, isPublicPath, type AuthEnv } from './lib/auth';

interface Env extends AuthEnv {
  ALLOWED_ORIGINS?: string;
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');
  const configuredOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowOrigin = configuredOrigins.length === 0
    ? (requestOrigin || '*')
    : requestOrigin && configuredOrigins.includes(requestOrigin)
      ? requestOrigin
      : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
    'Access-Control-Max-Age': '86400',
    ...(requestOrigin ? { Vary: 'Origin' } : {}),
  };
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(getCorsHeaders(request, env))) {
    headers.set(key, value);
  }
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') {
    return withCors(new Response('Method not allowed', { status: 405 }), request, env);
  }

  const path = new URL(request.url).pathname;
  if (!isPublicPath(path)) {
    const auth = await authorizeRequest(request, env, getSubjectFromRequest(request));
    if (auth.response) return withCors(auth.response, request, env);
  }

  return withCors(await next(), request, env);
};
