# Cloudflare Pages API Guide

This manual explains how to interact with the backend endpoints of the CourseViewer platform from any client application (e.g., a React frontend, mobile app, or another server). 

The base URL for these endpoints is your production domain (e.g., `https://courseviewer.lms-yemen.com`).

---

## Authentication and storage defaults

When `JWT_SECRET` is configured on the Pages deployment, all classroom, HTML lesson, course-proxy, ZIP, and custom-voice endpoints require a valid signed HS256 JWT. Printed pages, public page images, thumbnails, the catalog, and health discovery remain public. A token may be supplied through an `Authorization: Bearer <token>` header, the `?token=<token>` query parameter used by iframe/audio embeds, or a `jwt_token` cookie.

The token payload may include `role: "teacher"` or `role: "admin"` for unrestricted access, or `allowedCourses: ["adb10p1", "bio10p1"]` to restrict access by subject. Configure `ALLOW_PUBLIC_R2_FALLBACK=false` in production; public R2 fallback is available only as an explicit migration diagnostic option.

```bash
curl -H "Authorization: Bearer $COURSEVIEWER_JWT" \
  "https://courseviewer.lms-yemen.com/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh"
```

If `REQUIRE_AUTH=true` is set without `JWT_SECRET`, protected requests fail closed with `AUTH_NOT_CONFIGURED` rather than falling back to anonymous access.

---

## 1. Pages Health & Deployment Discovery
**Endpoint:** `/api/health`
**Methods:** `GET`, `HEAD`

This public endpoint verifies that the Pages runtime is responding and reports non-sensitive deployment diagnostics. It does not expose JWT secrets, bucket names, object keys, or user data.

```bash
curl "https://courseviewer.lms-yemen.com/api/health"
```

The response includes the service version, timestamp, whether authentication is configured and required, and whether the expected R2 bindings are available. The response is marked `Cache-Control: no-store` so monitoring systems observe the current runtime state.

---

## 2. Classroom Data Resolver
**Endpoint:** `/api/classroom-data`  
**Methods:** `GET`, `POST`

This endpoint fetches and normalizes the core classroom JSON (`classdata.json`) for a specific lesson, automatically updating relative media paths to absolute streaming URLs (via the R2 proxy).

### Request Parameters (Query String or JSON Body)
*   `subject` (e.g., `adb10p1`)
*   `unit` (e.g., `u1`)
*   `lesson` (e.g., `l1`)
*   `id` or `classroomId` (e.g., `1v_nRmh_wh`)

### Example `GET` Request
```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-data?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh"
```

### Example Response
```json
{
  "status": "ok",
  "key": "classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json",
  "data": {
    "id": "1v_nRmh_wh",
    "stage": {
      "name": "الأدب في العصر الجاهلي"
    },
    "scenes": [ ... ] // Audio paths here will point to /api/courses/...
  }
}
```

---

## 3. Secure Media Proxy (R2)
**Endpoint:** `/api/courses/*`  
**Methods:** `GET`, `HEAD`

This endpoint acts as a secure, range-aware proxy for files stored in the private R2 bucket. It's automatically used by the Classroom Data Resolver to serve MP3s, images, and other assets.

### Usage
Simply append the R2 bucket object key to the endpoint.

### Example Request
```bash
# Streaming a scene's TTS audio file:
curl -I "https://courseviewer.lms-yemen.com/api/courses/classrooms/adb10p1/u1/l1/1v_nRmh_wh/tts/scene_00_speech_00.mp3"
```
*Note: This endpoint supports HTTP `206 Partial Content` (Range requests), making it ideal for `<audio>` and `<video>` tags in web apps.*

---

## 4. ZIP File Streamer
**Endpoint:** `/api/classroom-zip/*`  
**Methods:** `GET`

This powerful utility extracts specific files from an archived `.zip` classroom *on-the-fly* without downloading the entire ZIP file.

### A. Fetching the Classroom JSON from a ZIP
**Path:** `/api/classroom-zip/data`  
Extracts the manifest/classroom data and rewrites media URLs to point back to the ZIP streaming endpoint.

```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-zip/data?zip=/samples/test-classroom.zip"
```

### B. Streaming Media from inside the ZIP
**Path:** `/api/classroom-zip/media`  
Fetches a specific file (e.g., an MP3 or image) from inside the ZIP.

```bash
curl "https://courseviewer.lms-yemen.com/api/classroom-zip/media?zip=/samples/test-classroom.zip&file=media/scene_01.mp3"
```

---

## 5. Custom Voice & TTS Studio
**Endpoint:** `/api/custom-voice`  
**Methods:** `GET`, `POST`  
**CORS:** Enabled (`*`)

This endpoint handles custom voice interactions, including uploading custom audio overrides, fetching voice profiles, and previewing TTS.

### A. Fetch Voice Profiles (`GET`)
Retrieves the list of available TTS voices.
```bash
curl "https://courseviewer.lms-yemen.com/api/custom-voice"
```

### B. Execute Studio Actions (`POST`)
Accepts either `application/json` or `multipart/form-data`. 

**Common Payload Fields:**
*   `action`: The action to perform (`upload_audio`, `customize_voice`, `preview_speech`).
*   `subject`, `unit`, `lesson`, `classroomId`: The target classroom.
*   `sceneIndex`, `speechIndex`: The target scene and speech block.

#### Action: `upload_audio`
Uploads a base64-encoded audio file to override a specific speech block.
```json
{
  "action": "upload_audio",
  "subject": "adb10p1",
  "unit": "u1",
  "lesson": "l1",
  "classroomId": "1v_nRmh_wh",
  "sceneIndex": 0,
  "speechIndex": 0,
  "audioBase64": "data:audio/mp3;base64,//NExAAAAANIAAAAAExB..."
}
```

#### Action: `customize_voice`
Sets TTS parameters for a specific request.
```json
{
  "action": "customize_voice",
  "voiceProfileId": "ar-sa-naif",
  "speed": 1.2,
  "pitch": 1.0,
  "subject": "adb10p1",
  "unit": "u1",
  "lesson": "l1",
  "classroomId": "1v_nRmh_wh"
}
```

#### Action: `preview_speech`
Simulates generating a TTS preview for arbitrary text.
```json
{
  "action": "preview_speech",
  "voiceProfileId": "ar-eg-salma",
  "text": "مرحباً بك في الدرس الأول",
  "speed": 1.0,
  "pitch": 1.0
}
```

---

## 6. Interactive HTML Lesson Viewer
**Endpoint:** `/html` (query-param route)
**Methods:** `GET`

The React viewer resolves the supplied lesson file through the private courses proxy and renders the lesson in an iframe. It tries an explicit `file` first, then the repository’s standard subject/folder naming conventions.

```bash
# The token may also be supplied through an Authorization header in a normal API client.
open "https://courseviewer.lms-yemen.com/html?subject=hadith11&unit=u1&lesson=l1&file=hadith11/hadith11_u1l1.html&token=$COURSEVIEWER_JWT"
```

The iframe source is kept same-origin so its relative CSS, JavaScript, image, and audio references continue to resolve through the protected proxy. Use the viewer toolbar to retry resolution or open the resolved lesson in a separate tab.

---

## 7. Printed Book Pages Reader
**Endpoint:** `/printed-pages` (or `/api/printed-pages`)  
**Methods:** `GET`

This endpoint serves the HTML viewer for the printed textbook pages. It dynamically loads the page images for a specified subject, unit, lesson, and page range. It is ideal for embedding the book reader into another application via an `iframe`.

### Request Parameters (Query String)
*   `subject` (e.g., `adb10p1` or `bio10p1`)
*   `unit` (e.g., `u1`)
*   `lesson` (e.g., `l1`)
*   `start` (Starting page number, e.g., `11`)
*   `end` (Ending page number, e.g., `15`)
*   `total` (Alternative to start/end: specifies total pages to load, e.g., `5`)

### Example `GET` Request
```bash
# Get the printed pages HTML for Adab Grade 10, Pages 11-15:
curl "https://courseviewer.lms-yemen.com/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15"
```
