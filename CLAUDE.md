# 📘 CourseViewer Developer Manual (`CLAUDE.md`)

> **Comprehensive Architecture, Development, Security, and API Guide for Developers & AI Agents**

---

## 🏗️ 1. Project Overview & Architecture

**Smart Digital CourseViewer** is a high-performance, full-stack digital textbook, interactive HTML lesson, virtual classroom, and audio streaming platform powered by **Cloudflare Pages** and **Cloudflare Workers**.

```
smart-digital-courseviewer/
├── src/                          # ⚛️ Frontend React Application (React 19 + Vite 8 + Tailwind)
│   ├── pages/
│   │   ├── PrintedPagesViewer.tsx# 📖 Public Digital Textbook Reader
│   │   ├── ClassroomPlayerPage.tsx# 🎙️ OpenMAIC Virtual Classroom Player
│   │   ├── HtmlLessonViewer.tsx  # 📑 Interactive HTML Lesson Viewer
│   │   └── TestShowcase.tsx      # 🧪 Diagnostic & Testing Dashboard
│   ├── lib/
│   │   ├── jwt-auth.ts           # 🔐 Zero-dependency Web Crypto JWT utility
│   │   ├── utils.ts              # 🧭 URL candidate generators & prefix cleaners
│   │   └── universal-loader.ts   # 📦 Universal ZIP/JSON/Manifest loader
│   └── index.css                 # 🎨 Tailwind CSS & typography
│
├── functions/                    # ⚡ Cloudflare Pages Functions (Edge API)
│   ├── _middleware.ts            # 🛡️ CORS, Security & JWT Gatekeeper
│   └── api/
│       ├── classroom-data.ts     # /api/classroom-data resolver
│       ├── custom-voice.ts       # /api/custom-voice studio & upload
│       ├── courses/              # /api/courses/* private R2 proxy
│       └── classroom-zip/        # /api/classroom-zip/* progressive ZIP streamer
│
├── worker/                       # ☁️ Standalone Cloudflare Worker Backend
│   ├── src/
│   │   ├── index.ts              # Unified Worker routing engine
│   │   └── jwt.ts                # Web Crypto JWT authentication
│   ├── wrangler.jsonc            # Worker R2 bindings & configuration
│   ├── package.json              # Worker dependencies (aws4fetch)
│   └── test_comprehensive_worker.mjs # 17 automated Worker tests
│
├── packages/@openmaic/           # 📦 Vendored Core Packages (100% Standalone)
│   ├── dsl/                      # Stage, Scene, Action schema & guards
│   ├── renderer/                 # Scene Canvas, Slides, Shapes & Charts
│   └── viewer/                   # Classroom Player Component
│
├── patch_packages.mjs            # 🔨 Standalone package build & sync utility
├── serve_preview.mjs             # 🌐 Local preview server with live R2 proxy
└── package.json                  # Standalone dependencies
```

---

## 🔐 2. Security & Access Control Model

### 🛡️ Public vs. Protected Resources

| Resource Type | Security Level | Auth Required? | Endpoint / Storage |
|:---|:---:|:---:|:---|
| **📖 Printed Book Pages** | 🟢 **Public** | ❌ **No Security** | `/printed-pages`, `/pages/{key}`, `coursesimages` CDN |
| **🖼️ Course Cover Thumbnails** | 🟢 **Public** | ❌ **No Security** | `/thumbnails/{subject}.webp`, `/api/thumbnails` |
| **🏥 Health & Discovery API** | 🟢 **Public** | ❌ **No Security** | `/api/health`, `/` |
| **🎙️ Classroom Scene Data** | 🔴 **Protected** | ✅ **JWT Required** | `/api/classroom-data`, `/classrooms/.../classdata.json` |
| **🎵 Voiceover TTS Audio** | 🔴 **Protected** | ✅ **JWT Required** | `/api/courses/classrooms/.../tts/*.mp3` |
| **📑 Interactive HTML Lessons** | 🔴 **Protected** | ✅ **JWT Required** | `/api/courses/{subject}/{lesson}.html` |
| **🎙️ Voice Studio Audio Upload**| 🔴 **Protected** | ✅ **JWT Required** | `/api/custom-voice` |
| **📦 ZIP Streamer** | 🔴 **Protected** | ✅ **JWT Required** | `/api/classroom-zip/data`, `/api/classroom-zip/media` |

---

### 🔑 Option A: Signed JWT Tokens (Web Crypto HMAC-SHA256)

When `JWT_SECRET` is configured in environment variables, protected endpoints enforce token verification.

#### Token Payload Schema:
```json
{
  "sub": "user_student_123",
  "role": "student",
  "allowedCourses": ["adb10p1", "bio10p1"],
  "exp": 1724123456,
  "iat": 1724037056
}
```

- **Role `admin` or `teacher`**: Universal access to all course materials.
- **`allowedCourses: ['*']`**: Unrestricted access to all subjects.
- **`allowedCourses: ['adb10p1', ...]`**: Access restricted to listed subject codes.

#### Token Delivery Options:
1. **HTTP Header**: `Authorization: Bearer <token>`
2. **URL Query Param**: `?token=<token>` (Used for `iframe` embeds and `<audio>` tags)
3. **Cookie**: `jwt_token=<token>`

---

## 🗄️ 3. R2 Storage Bucket Standards (`u1/l1` Invariant)

Always adhere strictly to the clean short prefix standard (`u1/l1`). Never use legacy verbose folders (`bio10p1_c1/`).

| Resource | Bucket Name | Pattern | Example Key |
|:---|:---|:---|:---|
| **Cover Thumbnails** | `coursesimages` | `thumbnails/{subject}.webp` | `thumbnails/adb10p1.webp` |
| **Page Scans** | `coursesimages` | `{subject}/u{N}/l{M}/page-{P}-w{600\|900\|1200}.webp` | `adb10p1/u1/l1/page-11-w900.webp` |
| **Classroom Graph** | `courses` | `classrooms/{subject}/u{N}/l{M}/{id}/classdata.json` | `classrooms/adb10p1/u1/l1/1v_nRmh_wh/classdata.json` |
| **Classroom Speech**| `courses` | `classrooms/{subject}/u{N}/l{M}/{id}/speechtext.json`| `classrooms/adb10p1/u1/l1/1v_nRmh_wh/speechtext.json` |
| **TTS Audio** | `courses` | `classrooms/{subject}/u{N}/l{M}/{id}/tts/scene_{SS}_speech_{PP}.mp3` | `.../tts/scene_00_speech_00.mp3` |
| **HTML Lessons** | `courses` | `{subject}/{subject}_{unitLesson}.html` | `hadith11/hadith11_u1l1.html` |

---

## 📖 4. Frontend Component Reference

### 1. `PrintedPagesViewer.tsx` (Public Digital Textbook)
- **Zero-Gap Continuous Flow**: Seamless vertical reading without inter-page margins.
- **Floating Glassmorphic Toolbar**: Small icons for Continuous Vertical, Single Horizontal, and Dual-Spread book view.
- **Floating Transparent Navigation**: Glassmorphic `<` and `>` floating buttons on screen edges in horizontal modes.
- **Double-Click Fullscreen Lightbox**: Double-clicking any page opens high-resolution `1200w` image lightbox with zoom (`100%` ↔ `160%`) and keyboard navigation (`Esc`, `ArrowLeft`, `ArrowRight`).
- **Scroll-Synchronized Page Counter**: `IntersectionObserver` automatically tracks and updates the active page number as the user scrolls.

### 2. `ClassroomPlayerPage.tsx` (OpenMAIC Virtual Classroom)
- **Synchronized Script Sidebar**: Auto-scrolls dialogue cards to the currently speaking character in real-time.
- **Audio Routing**: Synchronized speech actions and AI TTS vs Original ZIP audio switcher.
- **Voice Studio**: Modal allowing teachers to record or upload custom voiceovers for any scene/speech.
- **Mutually-Exclusive Sidebars**: Script on Left, Scenes Drawer on Left in RTL layout.

### 3. `HtmlLessonViewer.tsx` (Interactive HTML Lessons)
- **Multi-Candidate Fallback**: Tries standard naming variations in order until finding the lesson.
- **Native Base URL Injection**: Injects `<base href="...">` targeting `coursesimages` CDN so relative assets load natively.
- **Hover Controls**: Minimalist reload, print, and fullscreen overlay.

---

## 🛠️ 5. Development & Testing Commands

### Build & Package Sync
```bash
# Build core packages & Cloudflare Pages frontend
npm run patch:packages
# or
npm run build
```

### Run Local Development Server
```bash
# Local preview server with live R2 proxy (Port 8788)
node serve_preview.mjs

# Cloudflare Pages Dev (with local R2 bindings)
npm run pages:dev
```

### Run Automated Test Suites
```bash
# Test JWT Security & Access Control (12 tests)
node test_jwt_security.mjs

# Test Cloudflare Pages API Functions (8 tests)
node test_pages_endpoints.mjs

# Test Multiple Classroom Subjects (8 tests)
node test_multiple_classrooms.mjs

# Test Progressive ZIP Streaming (5 tests)
node test_zip_streaming.mjs

# Test Cloudflare Worker Backend (17 tests)
node worker/test_comprehensive_worker.mjs
```

---

## 🚀 6. Cloudflare Deployment

### 1. Deploy Cloudflare Pages (Frontend + Functions)
```bash
npx wrangler pages deploy dist --project-name=courseviewer
```

### 2. Deploy Cloudflare Worker (Backend Engine)
```bash
cd worker
npx wrangler deploy
```

---

## 🌐 7. Quick Test URLs (Local Preview)

- **📖 Printed Pages (Public)**:  
  `http://localhost:8788/printed-pages?subject=adb10p1&unit=u1&lesson=l1&start=11&end=15`
- **🎙️ Classroom Player**:  
  `http://localhost:8788/classroom?subject=adb10p1&unit=u1&lesson=l1&id=1v_nRmh_wh`
- **📑 HTML Lesson**:  
  `http://localhost:8788/html?subject=hadith11&unit=u1&lesson=l1`
- **🧪 Test Showcase Dashboard**:  
  `http://localhost:8788/`
