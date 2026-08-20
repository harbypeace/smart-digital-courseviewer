/**
 * 🔐 Zero-Dependency JWT Authentication Utility (Web Crypto API)
 * Compatible with Cloudflare Workers, Cloudflare Pages Functions, Browser, and Node.js
 */

export interface JwtPayload {
  sub?: string;
  role?: 'student' | 'teacher' | 'admin' | string;
  allowedCourses?: string[]; // e.g. ['adb10p1', 'bio10p1'] or ['*'] for all
  exp?: number; // Unix timestamp in seconds
  iat?: number; // Unix timestamp in seconds
  [key: string]: unknown;
}

export interface JwtVerifyResult {
  valid: boolean;
  payload?: JwtPayload;
  error?: string;
}

function base64UrlEncode(str: string | Uint8Array): string {
  let base64 = '';
  if (typeof str === 'string') {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  } else {
    let binary = '';
    for (let i = 0; i < str.byteLength; i++) {
      binary += String.fromCharCode(str[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function getHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    [usage]
  );
}

/**
 * 🔑 Create a signed JWT Token using HMAC-SHA256
 */
export async function createJwt(
  payload: JwtPayload,
  secret: string,
  expiresInSeconds: number = 86400
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: payload.iat || now,
    exp: payload.exp || now + expiresInSeconds,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${headerB64}.${payloadB64}`;

  const key = await getHmacKey(secret, 'sign');
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuffer));

  return `${message}.${signatureB64}`;
}

/**
 * 🛡️ Verify and decode a JWT Token using HMAC-SHA256
 */
export async function verifyJwt(token: string, secret: string): Promise<JwtVerifyResult> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is missing or empty' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid JWT structure (must have 3 parts)' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const message = `${headerB64}.${payloadB64}`;

  try {
    // 1. Verify Signature
    const key = await getHmacKey(secret, 'verify');
    const signatureStr = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    let binarySig = atob(signatureStr + '==='.slice((signatureStr.length + 3) % 4));
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(message));
    if (!isValid) {
      return { valid: false, error: 'Invalid token signature' };
    }

    // 2. Decode and Validate Payload
    const payloadJson = base64UrlDecode(payloadB64);
    const payload: JwtPayload = JSON.parse(payloadJson);

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: `Token expired at timestamp ${payload.exp} (current: ${now})` };
    }

    if (payload.iat && payload.iat > now + 300) {
      return { valid: false, error: 'Token issued in the future (clock skew error)' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Token verification failed' };
  }
}

/**
 * 🔍 Extract JWT token from Request (Authorization header, ?token= param, or Cookie)
 */
export function extractJwtFromRequest(request: Request): string | null {
  // 1. Authorization: Bearer <token>
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  // 2. URL search params: ?token=... or ?jwt=...
  try {
    const url = new URL(request.url);
    const tokenParam = url.searchParams.get('token') || url.searchParams.get('jwt');
    if (tokenParam) return tokenParam.trim();
  } catch (_e) {}

  // 3. Cookies: jwt_token=... or token=...
  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:jwt_token|token)=([^;]+)/);
    if (match && match[1]) return decodeURIComponent(match[1].trim());
  }

  return null;
}

/**
 * 📚 Check if user's token allows access to a specific course subject
 */
export function isCourseAuthorized(payload: JwtPayload | undefined, subjectCode: string): boolean {
  if (!payload) return false;
  if (payload.role === 'admin' || payload.role === 'teacher') return true;
  if (!payload.allowedCourses || payload.allowedCourses.length === 0) return true; // Default allow all if not restricted
  if (payload.allowedCourses.includes('*')) return true;

  const target = subjectCode.toLowerCase().trim();
  return payload.allowedCourses.some((c) => c.toLowerCase().trim() === target);
}
