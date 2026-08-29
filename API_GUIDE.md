# Cloudflare Pages API Guide

This manual explains how to interact with the backend endpoints of the CourseViewer platform from any client application (e.g., a React frontend, mobile app, or another server). 

The base URL for these endpoints is your production domain (e.g., `https://courseviewer.lms-yemen.com`).

---

## 1. Classroom Data Resolver
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

## 2. Secure Media Proxy (R2)
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

## 3. ZIP File Streamer
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

## 4. Custom Voice & TTS Studio
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
