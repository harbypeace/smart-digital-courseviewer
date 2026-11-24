# Cloudflare Pages CourseViewer API Guide

Complete technical reference and operational manual for consuming, embedding, extending, and updating backend endpoints and client storage on the CourseViewer platform (`courseviewer.lms-yemen.com`).

---

## 1. Architectural Overview & Base URLs

CourseViewer runs as a globally distributed **Cloudflare Pages** application powered by **Cloudflare Pages Functions** (V8 runtime at the edge) and backed by **Cloudflare R2** private object storage.

- **Production Domain:** `https://courseviewer.lms-yemen.com`
- **Cloudflare Pages Edge Domain:** `https://courseviewer-cf-pages.pages.dev`
- **Local Preview Server:** `http://localhost:8788` (or `http://127.0.0.1:8788`)
- **Vite Dev Server:** `http://localhost:5173`

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Consumers & Embedding                           │
│  • LMS-Yemen (Iframe embedding on https://lms-yemen.com)              │
│  • Mobile WebView & Capacitor / Cordova Apps                          │
│  • Browser Client with Local Offline Storage (IndexedDB + Cache)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (CORS + CSP frame-ancestors)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Cloudflare Pages Edge Router                      │
│                  (functions/_middleware.ts: Auth & CORS)               │
├──────────────────┬──────────────────┬─────────────────┬────────────────┤
│  /api/health     │  /api/classroom- │  /api/courses/* │ /api/custom-   │
│  (Diagnostics)   │   data           │  /api/classroom-│  voice         │
│                  │  (DSL Manifest)  │   zip/* (ZIP)   │ (TTS Studio)   │
├──────────────────┴──────────────────┼─────────────────┴────────────────┤
│  /printed-pages (Book Reader)       │  /pages/* (900px WebP Proxy)     │
│  /classroom (Interactive Player)    │  /classroom-media/*              │
└────────┬────────────────────────────┴────────┬─────────────────────────┘
         │                                     │
         ▼                                     ▼
┌──────────────────┐               ┌─────────────────────────────────────┐
│ Cloudflare Pages │               │     Cloudflare R2 Object Storage    │
│ Functions Engine │               │ • COURSES: Classrooms & Manifests   │
│ (Worker V8 Edge) │               │ • HARBY: Custom audio overrides     │
└──────────────────┘               └─────────────────────────────────────┘
```

---

## 2. Authentication, CORS & Iframe Security

### 2.1 JWT Authentication (Option A Policy)
When `JWT_SECRET` is configured in Cloudflare Pages environment secrets, protected endpoints (`/api/classroom-data`, `/api/courses/*`, `/api/classroom-zip/*`, `/api/custom-voice`) require a signed HS256 JWT.

A token may be supplied via:
1. `Authorization: Bearer <token>` header (standard API clients).
2. Query parameter: `?token=<token>` (useful for `<audio>`, `<video>`, and `<iframe>` embeds).
3. Cookie: `jwt_token=<token>`.

#### Token Payload Claims:
```json
{
  "sub": "user_12345",
  "role": "teacher",
  "allowedCourses": ["adb10p1", "bio10p1"],
  "exp": 1795000000
}
```
*Note: Public endpoints like `/api/health`, `/pages/*` (textbook page images), and static UI assets remain accessible without authentication.*

### 2.2 LMS-Yemen Iframe Embedding & CSP Rules
- **NEVER use `X-Frame-Options: SAMEORIGIN`**: Because `courseviewer.lms-yemen.com` and `lms-yemen.com` are different hostnames, `SAMEORIGIN` prevents browsers from embedding the viewer inside the LMS.
- **Content-Security-Policy**: Configured in `functions/_middleware.ts` and `public/_headers`:
  ```http
  Content-Security-Policy: frame-ancestors 'self' https://lms-yemen.com https://*.lms-yemen.com http://localhost:* http://127.0.0.1:*
  ```
- **CORS Allowed Origins**: Allows `https://lms-yemen.com`, subdomains (`*.lms-yemen.com`), and local development ports (`http://localhost:*`, `http://127.0.0.1:*`).

---

## 3. Complete Endpoints Reference ("How to Use")

### 3.1 GET `/api/health`
Health probe and non-sensitive deployment discovery.

- **Methods:** `GET`, `HEAD`
- **Auth:** Public
- **Cache:** `Cache-Control: no-store`

#### Example Request:
```bash
curl "https://courseviewer.lms-yemen.com/api/health"
```

#### Response `200 OK`:
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

### 3.2 GET `/api/classroom-data`
Fetches and normalizes the interactive classroom JSON manifest (`classdata.json`) for a specific lesson, rewriting relative audio/media paths to absolute streaming URLs.

- **Methods:** `GET`, `POST`
- **Auth:** Optional / JWT (enforced when `REQUIRE_AUTH=true`)

#### Query Parameters:
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `subject` | string | Recommended | `adb10p1` | Subject code (e.g. `adb10p1`, `bio10p1`, `chm11p1`, `math10p1`). |
| `unit` | string | Recommended | `u1` | Unit code (auto-normalized: `1` -> `u1`, `u01` -> `u1`). |
| `lesson` | string | Recommended | `l1` | Lesson code (auto-normalized: `1` -> `l1`, `l01` -> `l1`). |
| `id` / `classroomId` | string | Yes | — | Unique classroom ID (e.g. `1v_nRmh_wh`). |
| `zip` / `zipUrl` | string | Optional | — | Explicit `.maic.zip` archive key in R2. |

#### Example Request:
```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh"
```

#### Response `200 OK`:
```json
{
  "status": "ok",
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

### 3.3 GET `/api/courses/*`
Secure, range-aware proxy for files stored in the private `COURSES` R2 bucket.

- **Methods:** `GET`, `HEAD`
- **Features:** Supports HTTP `206 Partial Content` (`Range` header) for fast seeking in audio (`.mp3`, `.wav`) and video assets.
- **Cache:** `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400`

#### Example Request:
```bash
curl -I -H "Range: bytes=0-1024" \
  "https://courseviewer.lms-yemen.com/api/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/audio/speech_0.mp3"
```

---

### 3.4 GET `/api/classroom-zip/*`
Progressive on-demand streamer that extracts files from `.maic.zip` archives without downloading the whole ZIP archive to the client.

#### A. Fetch Classroom Manifest from ZIP:
```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-zip/data?zip=samples/classroom.zip"
```

#### B. Stream Individual Asset from ZIP:
```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-zip/media?zip=samples/classroom.zip&file=media/scene_01.mp3"
```

---

### 3.5 GET `/pages/*`
Textbook page image proxy with CORS headers.

- **URL Pattern:** `/pages/{subject}/pages/page-{N}-w900.webp`
- **Standard Width Policy:** Standardized strictly to `w900` (`900px WebP`). Non-900px sizes are excluded to optimize bandwidth and client storage.
- **Target Backend:** `https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/`

#### Example Request:
```bash
curl -I "https://courseviewer.lms-yemen.com/pages/adb10p1/pages/page-1-w900.webp"
```

---

### 3.6 GET & POST `/api/custom-voice`
TTS Voice Studio API for listing voice profiles, previewing synthesized speech, and uploading custom voice audio overrides.

#### A. List Voice Profiles (`GET`):
```bash
curl "https://courseviewer.lms-yemen.com/api/custom-voice"
```
Returns available Azure/ElevenLabs/Gemini neural voices and custom profile IDs.

#### B. Upload Custom Audio Override (`POST`):
```bash
curl -X POST "https://courseviewer.lms-yemen.com/api/custom-voice" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "customize_voice",
    "subject": "adb10p1",
    "unit": "u1",
    "lesson": "l1",
    "classroomId": "1v_nRmh_wh",
    "sceneIndex": 0,
    "speechIndex": 0,
    "audioBase64": "data:audio/mp3;base64,//NExAAAAANIA...",
    "voiceProfileId": "ar-sa-naif"
  }'
```

---

### 3.7 GET `/classroom`
Standalone interactive classroom player page.

- **URL:** `https://courseviewer.lms-yemen.com/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh`
- **Offline Support:** Automatically checks `IndexedDB` and `CacheStorage` before making network calls. If downloaded, loads instantly with zero network requests.
- **Embedded Download Manager:** Floating download trigger button allows downloading classroom data and textbook pages directly to the device.

---

### 3.8 GET `/printed-pages` (or `/lesson/...`)
Seamless textbook book reader for printed pages.

- **URL:** `https://courseviewer.lms-yemen.com/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=1&end=15`
- **Query Parameters:**
  - `subject`: Course subject code (e.g. `adb10p1`).
  - `unit`: Unit code (e.g. `u1`).
  - `lesson`: Lesson code (e.g. `l1`).
  - `start`: First page number in range.
  - `end`: Last page number in range.
  - `total`: Total page count.
- **Touch & Mobile Gestures:**
  - Horizontal swipe left/right for page flipping on touchscreens.
  - 3-second auto-hiding navigation bar on mobile viewports (< 768px).

---

## 4. Client-Side Offline Storage & Download Manager

The CourseViewer client features an offline storage engine that enables offline playback in web browsers and mobile WebViews.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Local Storage Engine                            │
├───────────────────────────────────┬────────────────────────────────────┤
│           IndexedDB               │            CacheStorage            │
│    (CourseViewerLocalDB v1)       │     (courseviewer-media-v1)        │
├───────────────────────────────────┼────────────────────────────────────┤
│ • lessons (Manifests & metadata)  │ • Scene TTS Audio Blobs (.mp3)     │
│ • units (Aggregated units)        │ • Visual Media (Images, Diagrams)  │
│ • download_queue (Task states)    │ • 900px WebP Printed Pages         │
└───────────────────────────────────┴────────────────────────────────────┘
```

### 4.1 Selective Download Options
The Download Manager modal allows users to select which components to download (both checked by default):
1. **`[✓] الغرفة الصفية التفاعلية (Classroom DSL + Audio TTS)`**: Downloads classroom scene manifests and audio files.
2. **`[✓] صفحات الكتاب المطبوع بدقة 900px WebP (Textbook 900px Pages)`**: Downloads page images strictly at 900px WebP (`page-{N}-w900.webp`).

### 4.2 Programmatic Usage (`useDownloadManager` Hook)
```typescript
import { useDownloadManager } from '@/hooks/useDownloadManager';

function MyComponent() {
  const { downloadLessonWithOptions, deleteLesson, deletePagesOnly } = useDownloadManager();

  const handleDownload = async () => {
    await downloadLessonWithOptions(
      'adb10p1',    // subject
      'u1',         // unit
      'l1',         // lesson
      '1v_nRmh_wh', // classroomId
      undefined,    // optional zipUrl
      {
        includeClassroom: true, // Cache DSL + audio
        includePages: true,     // Cache 900px WebP textbook pages
        startPage: 1,
        pageCount: 15,
      }
    );
  };
}
```

---

## 5. How to Update or Extend the API (Developer Guide)

Follow this step-by-step workflow when adding or modifying backend API routes.

### Step 1: Add or Edit the Route in `functions/api/`
Cloudflare Pages uses file-based routing:
- `functions/api/new-endpoint.ts` -> `/api/new-endpoint`
- `functions/api/nested/[[path]].ts` -> `/api/nested/*`

```typescript
import { authorizeRequest, type AuthEnv } from '../lib/auth';

interface Env extends AuthEnv {
  COURSES?: R2Bucket;
  HARBY?: R2Bucket;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Handle CORS Preflight
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

  // Authorize Request
  const auth = await authorizeRequest(request, env);
  if (auth.response) return auth.response;

  // Execute Logic
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
```

### Step 2: Update Local Preview Server (`serve_preview.mjs`)
Ensure `serve_preview.mjs` handles the new route so local tests and automated verification suites run with 100% parity before deployment.

### Step 3: Run Verification Gates
Always run the complete test suite before deploying:
```bash
# 1. Typecheck functions and frontend
npm run typecheck:functions
npm run typecheck

# 2. Run unit and offline storage tests
node test_local_storage_db.mjs
node test_offline_printed_pages.mjs

# 3. Run live API and Playwright E2E tests
node test_multiple_classrooms.mjs
node test_pre_deployment_ui.mjs
```

### Step 4: Deploy to Production
Per [AGENTS.md](file:///D:/projects/cloudflarepages/AGENTS.md):
- **The production environment is locked to branch `master`.**
- Pushing to `main` creates Preview deployments only.
- To deploy production:
  ```bash
  git checkout master
  git merge main
  git push origin master
  git checkout main
  ```
- Or direct CLI deployment:
  ```bash
  npm run build
  npx wrangler pages deploy dist --branch master --project-name courseviewer-cf-pages --commit-dirty=true
  ```

---

## 6. Common Issues & Troubleshooting

| Error / Symptom | Cause | Solution |
| :--- | :--- | :--- |
| **HTTP 401 Unauthorized** | `REQUIRE_AUTH=true` is enabled but no JWT Bearer token was provided. | Provide `Authorization: Bearer <token>` or `?token=<token>`. |
| **HTTP 503 AUTH_NOT_CONFIGURED** | `REQUIRE_AUTH=true` is set, but `JWT_SECRET` was not provided to Cloudflare Pages. | Run `npx wrangler pages secret put JWT_SECRET`. |
| **Iframe Blocked in LMS Yemen** | `X-Frame-Options: SAMEORIGIN` was added. | Remove `X-Frame-Options`. Maintain CSP `frame-ancestors 'self' https://lms-yemen.com https://*.lms-yemen.com`. |
| **Wrangler Deploy Upload Stalls** | Source map `.map` files in `dist/`. | Verify `sourcemap: false` in `vite.config.ts` to keep the production bundle fast and lightweight (~345 files). |
| **Missing Textbook Page Offline** | Requested a non-standard page resolution (e.g. 600px or 1200px). | The offline system exclusively caches 900px WebP images (`page-{N}-w900.webp`). Ensure all page requests target `w900.webp`. |
