---
name: courseviewer-api
description: Guide for using, extending, and maintaining the Cloudflare Pages CourseViewer API (/api/classroom-data, /api/courses, /api/classroom-zip, /pages, /api/custom-voice, /api/health). Use when developing frontend clients, modifying edge functions, adding backend endpoints, testing API routes, or configuring R2 storage and authentication.
---

# CourseViewer API & Cloudflare Functions Playbook

Complete technical reference and operational guide for using, developing, extending, and maintaining the CourseViewer API (`courseviewer.lms-yemen.com`).

---

## 1. Architectural Overview

The CourseViewer backend runs as **Cloudflare Pages Functions** (V8 runtime at the edge) backed by Cloudflare R2 object storage.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Client / Mobile / LMS                         │
│  (CourseViewer Web, LMS-Yemen Iframe, WebView, Mobile Download Mgr)   │
└─────────────────────────────────┬──────────────────────────────────────┘
                                  │ HTTPS (with CORS + CSP frame-ancestors)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Pages Edge Router                         │
│               (functions/_middleware.ts: Auth & CORS)                  │
├─────────────────┬─────────────────┬─────────────────┬──────────────────┤
│ /api/health     │ /api/classroom- │ /api/courses/*  │ /api/custom-voice│
│  (Diagnostics)  │  data (Manifest)│ /api/classroom- │  (TTS & Audio    │
│                 │                 │  zip/* (ZIP)    │   Overrides)     │
└────────┬────────┴────────┬────────┴────────┬────────┴────────┬─────────┘
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
┌──────────────────┐  ┌──────────────────────────────────────────────────┐
│ Cloudflare Pages │  │            Cloudflare R2 Object Storage          │
│ Function Runtime │  │  • COURSES Bucket: Classroom manifests & assets │
│ (Worker V8 Edge) │  │  • HARBY Bucket: User uploaded custom voices     │
└──────────────────┘  └──────────────────────────────────────────────────┘
```

### Key Bindings & Variables (`wrangler.jsonc`)
- `COURSES`: R2 bucket binding pointing to `courses` (classrooms, manifests, `.maic.zip`).
- `HARBY`: R2 bucket binding pointing to `harby` (custom audio overrides, voice recordings).
- `ALLOWED_ORIGINS`: Comma-separated allowlist for CORS preflight.
- `JWT_SECRET`: Secret key for JWT Bearer token validation (configured via `wrangler pages secret put JWT_SECRET`).
- `REQUIRE_AUTH`: If `true`, fails closed (HTTP 503) when `JWT_SECRET` is unset.

---

## 2. API Endpoints Reference ("How to Use")

### 2.1 GET `/api/health`
Health and diagnostics endpoint. Used by deployment verifiers, uptime monitors, and LMS health probes.

- **Method**: `GET`, `HEAD`
- **Auth**: None (Public)
- **Response Headers**: `Cache-Control: no-store`
- **Response `200 OK`**:
```json
{
  "status": "ok",
  "service": "courseviewer-pages",
  "version": "2.1.0",
  "timestamp": "2026-11-24T20:21:49.236Z",
  "auth": {
    "configured": false,
    "required": false
  },
  "storage": {
    "coursesBinding": true,
    "harbyBinding": true
  }
}
```

---

### 2.2 GET `/api/classroom-data`
Resolves and returns the normalized classroom DSL manifest (`classdata.json`) for interactive playback.

- **Method**: `GET`
- **Auth**: Optional/JWT depending on `REQUIRE_AUTH`.
- **Query Parameters**:
  | Parameter | Type | Required | Default | Description |
  | :--- | :--- | :--- | :--- | :--- |
  | `subject` | string | Recommended | `adb10p1` | Subject code (e.g. `adb10p1`, `bio10p1`, `chm11p1`). |
  | `unit` | string | Recommended | `u1` | Unit identifier (auto-normalized: `1` -> `u1`, `u01` -> `u1`). |
  | `lesson` | string | Recommended | `l1` | Lesson identifier (auto-normalized: `1` -> `l1`, `l01` -> `l1`). |
  | `id` / `classroomId` | string | Yes | — | Unique classroom identifier (e.g. `1v_nRmh_wh`). |
  | `zip` / `zipUrl` | string | Optional | — | Explicit `.maic.zip` archive key or URL in R2. |
  | `json` / `jsonUrl` | string | Optional | — | Explicit JSON path in R2. |

- **R2 Storage Resolution Order**:
  1. `classrooms/{subject}/{unit}/{lesson}/{id}/classdata.json`
  2. `courses/{subject}/{unit}/{lesson}/{id}/classdata.json`
  3. `classrooms/{id}/classdata.json`
  4. Inspection inside `{subject}/{unit}/{lesson}/{id}.maic.zip`
- **Response `200 OK`**:
```json
{
  "key": "classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json",
  "data": {
    "id": "1v_nRmh_wh",
    "version": "2.0",
    "stage": {
      "name": "الأدب في العصر الجاهلي",
      "width": 1280,
      "height": 720
    },
    "scenes": [
      {
        "id": "scene_0",
        "title": "مقدمة العصر الجاهلي",
        "content": { "canvas": { "elements": [] } },
        "actions": [
          {
            "type": "speech",
            "speaker": "المعلم",
            "text": "مرحباً بكم يا أبنائي في درسنا الأول...",
            "audioUrl": "/api/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/audio/speech_0.mp3"
          }
        ]
      }
    ]
  }
}
```

---

### 2.3 GET `/api/courses/*`
Direct course asset proxy and file streamer from the `COURSES` R2 bucket.

- **Method**: `GET`, `HEAD`
- **URL Pattern**: `/api/courses/{r2_object_key}`
- **Features**:
  - Supports HTTP 206 Partial Content (`Range: bytes=0-102400`) for audio/video streaming.
  - Automatically maps MIME types (`.json`, `.mp3`, `.wav`, `.webp`, `.png`, `.zip`).
  - Cache headers: `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`.
- **Example Usage**:
```bash
curl -I -H "Range: bytes=0-2048" \
  "https://courseviewer.lms-yemen.com/api/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/audio/scene_0_speech_0.mp3"
```

---

### 2.4 GET `/api/classroom-zip/data` & `/api/classroom-zip/media`
Progressive on-demand streamer that reads `.maic.zip` archives stored in R2 without downloading the whole archive on the client.

- **Manifest Endpoint**: `/api/classroom-zip/data?zip={zip_path_in_r2}`
  - Returns `classdata.json` inside the ZIP.
  - Rewrites all media URLs to point to `/api/classroom-zip/media`.
- **Media Endpoint**: `/api/classroom-zip/media?zip={zip_path}&file={asset_name}`
  - Streams specific media items (e.g. `audio/scene1.mp3`, `images/diagram.png`) from within the ZIP.
  - Supports HTTP 206 `Range` header.

---

### 2.5 GET `/pages/*`
Textbook page image proxy with CORS headers.

- **URL Pattern**: `/pages/{subject}/pages/page-{N}-w900.webp`
- **Standard Width Policy**: Standardized strictly to `w900` (`900px WebP`).
- **Target Backend**: `https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/`
- **Response Headers**:
  - `Access-Control-Allow-Origin: *`
  - `Cache-Control: public, max-age=86400`
  - `Content-Type: image/webp`

---

### 2.6 GET & POST `/api/custom-voice`
Custom TTS Voice Studio API for listing, testing, and overriding scene speech audio.

- **GET `/api/custom-voice`**:
  Returns available neural and custom voice profiles:
  ```json
  {
    "status": "ok",
    "voiceProfiles": [
      { "id": "ar-sa-naif", "name": "أستاذ نايف (سعودي فصيح)", "gender": "male", "lang": "ar-SA" },
      { "id": "ar-eg-salma", "name": "أستاذة سلمى (مصرية هادئة)", "gender": "female", "lang": "ar-EG" },
      { "id": "ar-jo-tariq", "name": "أستاذ طارق (شامي واضح)", "gender": "male", "lang": "ar-JO" },
      { "id": "custom-upload", "name": "صوت مخصص", "gender": "custom", "lang": "ar" }
    ]
  }
  ```
- **POST `/api/custom-voice`**:
  Uploads base64 audio and saves the override to R2 bucket `HARBY`:
  ```json
  {
    "action": "customize_voice",
    "subject": "adb10p1",
    "unit": "u1",
    "lesson": "l1",
    "classroomId": "1v_nRmh_wh",
    "sceneIndex": 0,
    "speechIndex": 0,
    "audioBase64": "data:audio/mp3;base64,...",
    "voiceProfileId": "ar-sa-naif"
  }
  ```

---

## 3. Security, CORS & Iframe Policy

In `functions/_middleware.ts` and `public/_headers`:

1. **Iframe Embedding for LMS Yemen**:
   - `X-Frame-Options` is **never set to `SAMEORIGIN`** (because `lms-yemen.com` and `courseviewer.lms-yemen.com` are distinct hostnames).
   - `Content-Security-Policy`:
     ```http
     Content-Security-Policy: frame-ancestors 'self' https://lms-yemen.com https://*.lms-yemen.com http://localhost:* http://127.0.0.1:*
     ```
2. **CORS Allowlist**:
   Allows `https://lms-yemen.com`, `https://*.lms-yemen.com`, and local development origins (`http://localhost:*`, `http://127.0.0.1:*`).
3. **JWT Authentication (Option A Policy)**:
   - Evaluated by `authorizeRequest()` in `functions/lib/auth.ts`.
   - Enabled when `JWT_SECRET` is set in environment secrets.
   - Requires header: `Authorization: Bearer <token>`.

---

## 4. How to Update or Add an API Endpoint

Follow this exact procedure whenever updating or creating backend endpoints.

### Step 1: Create or Modify the Route File in `functions/`
Cloudflare Pages uses file-based routing:
- `functions/api/my-feature.ts` -> `/api/my-feature`
- `functions/api/my-feature/[[path]].ts` -> `/api/my-feature/*` (wildcard/catch-all)

**Boilerplate Template (`functions/api/my-feature.ts`)**:
```typescript
import { authorizeRequest, type AuthEnv } from '../lib/auth';

interface Env extends AuthEnv {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  // 1. CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 2. Auth Check (if protected)
  const auth = await authorizeRequest(request, env);
  if (auth.response) return auth.response;

  // 3. Handle Business Logic
  try {
    const url = new URL(request.url);
    const queryParam = url.searchParams.get('myParam');

    // Example R2 access:
    // const file = await env.COURSES?.get('my-key.json');

    return new Response(JSON.stringify({ status: 'ok', data: { queryParam } }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ status: 'error', error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

### Step 2: Update Local Preview Server (`serve_preview.mjs`)
To maintain 100% parity between local tests (`http://127.0.0.1:8788`) and live edge execution:
1. Open `serve_preview.mjs`.
2. Add the route under the request handler:
   ```javascript
   if (pathname === '/api/my-feature') {
     // Implement mock or live S3 fallback logic
     res.writeHead(200, { 'Content-Type': 'application/json' });
     res.end(JSON.stringify({ status: 'ok' }));
     return;
   }
   ```

### Step 3: Run Validation Gates
Never deploy without passing all verification gates:
```bash
# 1. Typecheck edge functions
npm run typecheck:functions

# 2. Typecheck frontend
npm run typecheck

# 3. Test security headers and endpoints
node test_security_headers.mjs
node test_pages_health.mjs
```

### Step 4: Deploy to Production
Per project rules:
1. Production environment is locked to branch **`master`**.
2. Commit on `main`, merge to `master`, and push:
   ```bash
   git checkout master
   git merge main
   git push origin master
   git checkout main
   ```
3. Direct CLI deploy:
   ```bash
   npm run build
   npx wrangler pages deploy dist --branch master --project-name courseviewer-cf-pages --commit-dirty=true
   ```

---

## 5. Client Integration & Offline Cache Consumption

### Using `useDownloadManager` with the API
When downloading lessons for offline use:
```typescript
import { useDownloadManager } from '@/hooks/useDownloadManager';

const { downloadLessonWithOptions } = useDownloadManager();

// Downloads classroom manifest + TTS audio AND 900px WebP pages
await downloadLessonWithOptions(
  subjectCode,   // 'adb10p1'
  unitCode,      // 'u1'
  lessonCode,    // 'l1'
  classroomId,   // '1v_nRmh_wh'
  undefined,     // optional zipUrl
  {
    includeClassroom: true, // Calls /api/classroom-data & caches in IndexedDB
    includePages: true,     // Calls /pages/{subject}/pages/page-{N}-w900.webp in CacheStorage
    startPage: 1,
    pageCount: 15,
  }
);
```

---

## 6. Common Issues & Troubleshooting

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **HTTP 401 Unauthorized** | `REQUIRE_AUTH=true` is set and valid JWT token was not provided in `Authorization: Bearer <token>`. | Pass a signed JWT in request headers or unset `REQUIRE_AUTH`. |
| **HTTP 503 AUTH_NOT_CONFIGURED** | `REQUIRE_AUTH=true` but `JWT_SECRET` was not provided to Cloudflare Pages secrets. | Run `npx wrangler pages secret put JWT_SECRET`. |
| **Iframe Blocked on LMS Yemen** | `X-Frame-Options: SAMEORIGIN` was accidentally added. | Remove `X-Frame-Options` and preserve CSP `frame-ancestors 'self' https://lms-yemen.com https://*.lms-yemen.com`. |
| **Wrangler Deploy Stalls on Upload** | Large sourcemap `.map` files in `dist/`. | Ensure `sourcemap: false` in `vite.config.ts`. Production build should contain ~345 files instead of 650+. |
| **Printed Pages 404 on Mobile** | Client requested a non-standard image width (e.g. 600px or 1200px) that was not cached. | Enforce strictly `w900.webp` images in both online and offline modes. |
