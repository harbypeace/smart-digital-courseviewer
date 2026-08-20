/**
 * Cloudflare Pages Middleware — Security, JWT Authentication & CORS Gatekeeper
 * 
 * Option A: Signed JWT Tokens (Web Crypto HMAC-SHA256)
 * - Validates JWT tokens from Authorization header, ?token= param, or cookie.
 * - Protects private course content, classrooms, and audio assets.
 * - Supports course-level authorization (allowedCourses whitelist).
 */

import { verifyJwt, extractJwtFromRequest, isCourseAuthorized, type JwtPayload } from '../src/lib/jwt-auth';

interface Env {
  ALLOWED_ORIGINS?: string;
  JWT_SECRET?: string;
  REQUIRE_AUTH?: string;
}

export const onRequest: PagesFunction<Env, string, { user?: JwtPayload }> = async (context) => {
  const { request, env, next, data } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const origin = request.headers.get('Origin') || '';

  const configuredOrigins = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:8788',
    'https://courseviewer.pages.dev',
  ];

  const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...configuredOrigins])];

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

  const matchedOrigin = isAllowedOrigin(origin) ? origin : (origin || '*');

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': matchedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Authorization',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
    'Access-Control-Max-Age': '86400',
  };

  // 1. Handle CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // 2. JWT Authentication Check (Option A)
  // Protected API routes: /api/courses/*, /api/classroom-data, /api/custom-voice, /api/classroom-zip/*
  const isProtectedApi =
    pathname.startsWith('/api/courses/') ||
    pathname.startsWith('/api/classroom-data') ||
    pathname.startsWith('/api/custom-voice') ||
    pathname.startsWith('/api/classroom-zip/');

  const jwtSecret = env.JWT_SECRET;
  const requireAuth = env.REQUIRE_AUTH === 'true' || Boolean(jwtSecret);

  if (isProtectedApi && jwtSecret && requireAuth) {
    const token = extractJwtFromRequest(request);

    if (!token) {
      return new Response(
        JSON.stringify({
          status: 'error',
          code: 'UNAUTHORIZED',
          error: 'Authentication required. Please provide a valid signed JWT token via Authorization header, ?token= parameter, or cookie.',
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'WWW-Authenticate': 'Bearer error="invalid_token", error_description="Missing JWT token"',
          },
        }
      );
    }

    const verification = await verifyJwt(token, jwtSecret);
    if (!verification.valid || !verification.payload) {
      return new Response(
        JSON.stringify({
          status: 'error',
          code: 'INVALID_TOKEN',
          error: verification.error || 'Invalid or expired JWT token',
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
            'WWW-Authenticate': `Bearer error="invalid_token", error_description="${verification.error || 'Verification failed'}"`,
          },
        }
      );
    }

    // Check Course Access Whitelist if subject is in query
    const subjectParam = url.searchParams.get('subject') || '';
    if (subjectParam && !isCourseAuthorized(verification.payload, subjectParam)) {
      return new Response(
        JSON.stringify({
          status: 'error',
          code: 'FORBIDDEN',
          error: `Access to course subject '${subjectParam}' is not permitted for this user account.`,
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }
      );
    }

    // Attach user payload to context data
    data.user = verification.payload;
  }

  // 3. Execute downstream handler
  const response = await next();

  // 4. Inject CORS and Security Headers
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    newHeaders.set(k, v);
  }
  newHeaders.set('X-Content-Type-Options', 'nosniff');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
