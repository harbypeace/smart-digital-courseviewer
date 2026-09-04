interface Env {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
  JWT_SECRET?: string;
  REQUIRE_AUTH?: string;
}

function isEnabled(value?: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ status: 'error', code: 'METHOD_NOT_ALLOWED' }), {
      status: 405,
      headers: { 'Allow': 'GET, HEAD', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const payload = {
    status: 'ok',
    service: 'courseviewer-pages',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    auth: {
      configured: Boolean(env.JWT_SECRET),
      required: Boolean(env.JWT_SECRET) || isEnabled(env.REQUIRE_AUTH),
    },
    storage: {
      coursesBinding: Boolean(env.COURSES),
      harbyBinding: Boolean(env.HARBY),
    },
  };

  return new Response(request.method === 'HEAD' ? null : JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
