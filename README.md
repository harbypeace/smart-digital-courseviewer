# 🎓 CourseViewer & Cloudflare Pages + Worker (Standalone)

A high-performance, full-stack digital textbook, interactive lesson HTML, virtual classroom, and audio streaming platform powered by **Cloudflare Pages** and **Cloudflare Workers**.

---

## 🚀 Features

- **📖 Printed Pages Viewer**:
  - Seamless continuous zero-gap reading flow.
  - Floating translucent toolbar with small, clean icons (Vertical continuous, Horizontal single page, Horizontal dual-spread).
  - Floating transparent navigation buttons on left and right edges.
  - In-page high-resolution double-click image lightbox with interactive zoom and keyboard navigation.
  - Live scroll-synchronized page counter.

- **🎙️ OpenMAIC Virtual Classroom Player**:
  - Interactive multi-scene classroom playback with synchronized speech text.
  - AI Voice TTS and original ZIP audio switcher.
  - Voice Studio for teacher audio upload and voice customization.
  - Interactive script sidebar with automatic auto-scroll to the speaking dialogue.
  - Mutually-exclusive sidebars (Script on Left, Scenes Drawer on Left in RTL).

- **⚡ Cloudflare Pages & Worker API**:
  - `/api/classroom-data`: Resolves and serves parsed classroom JSON.
  - `/api/courses/...`: Proxies R2 storage for HTML lessons, images, and audio.
  - `/api/custom-voice`: Handles custom teacher audio uploads and voice profiles.
  - `/api/classroom-zip/...`: Streams media from classroom ZIP bundles.

---

## 📂 Project Structure

```
cloudflarepages/
├── src/                          # React Frontend Application
│   ├── pages/
│   │   ├── PrintedPagesViewer.tsx# Redesigned Printed Pages Book Reader
│   │   ├── ClassroomPlayerPage.tsx# OpenMAIC Classroom Player
│   │   ├── HtmlLessonViewer.tsx  # HTML Lesson Viewer
│   │   └── TestShowcase.tsx      # Test & Diagnostic Dashboard
│   ├── lib/                      # Utilities & universal loaders
│   └── index.css                 # Tailwind CSS styles
├── functions/                    # Cloudflare Pages Functions (API routes)
│   └── api/
│       ├── classroom-data.ts
│       ├── custom-voice.ts
│       └── courses/
├── worker/                       # Cloudflare Worker Standalone Backend
│   ├── src/index.ts              # Worker routing & S3/R2 client
│   └── wrangler.jsonc            # Worker configuration
├── packages/@openmaic/           # Vendored OpenMAIC Core Packages
│   ├── dsl/                      # DSL Schema & Types
│   ├── renderer/                 # Scene & Slide Renderer
│   └── viewer/                   # Classroom Player Component
├── patch_packages.mjs            # Standalone package build & patch utility
└── package.json                  # Standalone dependencies
```

---

## 🛠️ Development & Build

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Core Packages & App
```bash
npm run patch:packages
# or
npm run build
```

### 3. Run Development Server
```bash
# Vite Local Preview & API Mock:
node serve_preview.mjs

# Cloudflare Pages Dev (with R2 bindings):
npm run pages:dev
```

### 4. Deploy to Cloudflare
```bash
# Deploy Pages:
npx wrangler pages deploy dist

# Deploy Worker Backend:
cd worker && npx wrangler deploy
```

---

## 📄 License
MIT
