import {
  extractJwtFromRequest,
  isCourseAuthorized,
  verifyJwt,
  type JwtPayload,
} from '../../src/lib/jwt-auth';

export interface AuthEnv {
  JWT_SECRET?: string;
  REQUIRE_AUTH?: string;
}

export interface AuthContext {
  payload?: JwtPayload;
  token?: string;
}

function isTruthy(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

function jsonError(status: number, code: string, error: string): Response {
  return new Response(JSON.stringify({ status: 'error', code, error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Enforces the repository's Option A JWT policy. Authentication is enabled when
 * JWT_SECRET is configured, or explicitly required with REQUIRE_AUTH=true.
 * This keeps local Pages development usable while making production fail closed
 * when an operator opts into mandatory auth without providing a secret.
 */
export async function authorizeRequest(
  request: Request,
  env: AuthEnv,
  subjectCode = '',
): Promise<{ response: Response | null; context?: AuthContext }> {
  const secret = env.JWT_SECRET?.trim();
  const required = Boolean(secret) || isTruthy(env.REQUIRE_AUTH);

  if (!required) {
    return { response: null, context: {} };
  }

  if (!secret) {
    return {
      response: jsonError(
        503,
        'AUTH_NOT_CONFIGURED',
        'Authentication is required but JWT_SECRET is not configured on this deployment.',
      ),
    };
  }

  const token = extractJwtFromRequest(request);
  if (!token) {
    return {
      response: jsonError(
        401,
        'UNAUTHORIZED',
        'Authentication required. Provide a signed JWT in Authorization, ?token=, or jwt_token cookie.',
      ),
    };
  }

  const verification = await verifyJwt(token, secret);
  if (!verification.valid || !verification.payload) {
    return {
      response: jsonError(401, 'INVALID_TOKEN', verification.error || 'Invalid or expired JWT token'),
    };
  }

  if (subjectCode && !isCourseAuthorized(verification.payload, subjectCode)) {
    return {
      response: jsonError(
        403,
        'FORBIDDEN',
        `Access to course subject '${subjectCode}' is not permitted for this user account.`,
      ),
    };
  }

  return { response: null, context: { payload: verification.payload, token } };
}

export function getSubjectFromRequest(request: Request): string {
  const url = new URL(request.url);
  const querySubject = url.searchParams.get('subject') || url.searchParams.get('subjectCode');
  if (querySubject) return querySubject;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'api' && segments[1] === 'courses') {
    if (segments[2] === 'classrooms' || segments[2] === 'classroom-zip') return segments[3] || '';
    return segments[2] || '';
  }

  if (segments[0] === 'classroom' || segments[0] === 'classrooms') {
    return segments.length >= 4 ? segments[1] : '';
  }

  return '';
}

export function isPublicPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return (
    p === '/' ||
    p === '/404' ||
    p === '/api/health' ||
    p === '/printed-pages' ||
    p === '/api/printed-pages' ||
    p.startsWith('/lesson/') ||
    p.startsWith('/pages/') ||
    p.startsWith('/thumbnails/') ||
    p === '/api/thumbnails' ||
    p.startsWith('/assets/') ||
    p === '/catalog.html' ||
    p === '/favicon.ico' ||
    p === '/robots.txt' ||
    p === '/index.html'
  );
}
