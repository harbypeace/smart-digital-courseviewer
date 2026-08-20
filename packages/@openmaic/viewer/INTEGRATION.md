# @openmaic/viewer — Universal Classroom Player

Standalone React component. Drop it into **any React app** (Next.js, Vite, CRA, Remix) to render
OpenMAIC classroom JSON. Zero server dependencies — the viewer runs entirely in the browser.

## What It Renders

| Content | How |
|---------|-----|
| **Slides** (text, shapes, images, charts, tables, LaTeX, code, video) | `@openmaic/renderer` SlideCanvas |
| **Teacher actions** (speech, spotlight, laser, whiteboard draw, video playback) | Built-in playback engine |
| **Quizzes** (multiple choice with click-to-reveal) | Built-in QuizScene |
| **Interactive widgets** (HTML iframes, simulations, diagrams) | Built-in InteractiveScene |
| **Whiteboard** (draw text/shapes/charts/lines/code, clear, delete) | SlideCanvas overlay |
| **TTS audio** (pre-generated MP3s or browser speechSynthesis) | Audio element / Web Speech API |
| **RTL** (Arabic, Farsi, Urdu) | Auto-detected from languageDirective |

---

## Quick Start

### 1. Copy 3 packages into your project

```bash
cp -r packages/@openmaic/viewer   your-project/packages/
cp -r packages/@openmaic/renderer your-project/packages/
cp -r packages/@openmaic/dsl      your-project/packages/
```

### 2. Add dependencies in your package.json

```json
{
  "dependencies": {
    "@openmaic/viewer": "workspace:*",
    "@openmaic/renderer": "workspace:*",
    "@openmaic/dsl": "workspace:*",
    "react": "^18 || ^19",
    "react-dom": "^18 || ^19",
    "motion": "^11 || ^12"
  }
}
```

Optional: `echarts` (charts), `shiki` (code highlighting), `katex` (math formulas).

### 3. Install & build

```bash
pnpm install
pnpm --filter @openmaic/renderer run build
pnpm --filter @openmaic/viewer run build
```

---

## Usage — Choose Your Loading Mode

### Mode 1: Bucket/Folder URL (simplest)

```tsx
import { ClassroomViewer } from '@openmaic/viewer';

// Folder contains: classroom.json + media/
<ClassroomViewer classroomUrl="https://my-bucket.r2.dev/classrooms/math-g7" />
```

### Mode 2: Direct JSON

```tsx
const data = await fetch('/api/classroom/math-g7').then(r => r.json());
<ClassroomViewer data={data} mediaBaseUrl="https://my-cdn.com/classrooms/math-g7/" />
```

### Mode 3: ZIP file

```tsx
// From URL
<ClassroomViewer zipUrl="https://my-cdn.com/math-g7.zip" />

// From <input type="file">
<input type="file" accept=".zip" onChange={e =>
  setBlob(e.target.files[0])
} />
<ClassroomViewer zipBlob={blob} />
```

### Full example: ZIP upload → render in dialog

```tsx
import { useState } from 'react';
import { ClassroomViewer } from '@openmaic/viewer';

function LessonPlayer() {
  const [blob, setBlob] = useState<Blob | null>(null);

  return (
    <div>
      <input type="file" accept=".zip" onChange={e => {
        const file = e.target.files?.[0];
        if (file) setBlob(file);
      }} />

      {blob && (
        <ClassroomViewer
          zipBlob={blob}
          dialog
          darkMode
          onClose={() => setBlob(null)}
        />
      )}
    </div>
  );
}
```

---

## All Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `classroomUrl` | `string` | — | Bucket folder URL. Fetches `<url>/classroom.json` |
| `data` | `ClassroomData` | — | Full classroom JSON object |
| `zipUrl` | `string` | — | ZIP file URL (must contain classroom.json) |
| `zipBlob` | `Blob` | — | ZIP file Blob (from `<input type="file">`) |
| `mediaBaseUrl` | `string` | — | Prefix for image/video/audio paths |
| `dialog` | `boolean` | `false` | Show as fullscreen modal overlay |
| `onClose` | `() => void` | — | Dialog close callback |
| `darkMode` | `boolean` | `false` | Dark theme |
| `startScene` | `number` | `0` | Start at scene index |
| `className` | `string` | — | Extra CSS class |

---

## Media Path Resolution

Images, videos, and audio use relative paths in the classroom JSON. The viewer resolves them using `mediaBaseUrl`:

```
Priority:
1. Already absolute (http://, data:, blob:) → used as-is
2. mediaBaseUrl prop → prepended
3. Derived from classroomUrl → auto
4. Raw relative path → may not resolve without a base
```

This applies to:
- Image `src` in slide elements
- Video `src` in slide elements
- `audioUrl` in speech actions

---

## TTS / Audio Playback

For each `speech` action:

1. **`audioUrl` is set** → plays the MP3/WAV file
2. **No `audioUrl`** → falls back to browser `speechSynthesis` (Web Speech API)

Generate audio files with the CLI:
```bash
npx tsx scripts/generate-for-lms.ts --input lessons.json --output ./output/ --tts
```

Audio files go to `output/<lesson-id>/media/`. Host them alongside `classroom.json`.

---

## Supported Action Types

| Action | Effect |
|--------|--------|
| `speech` | Displays text in floating bubble, plays audio URL or browser TTS |
| `spotlight` | Dims all elements except the target (3 seconds) |
| `laser` | Points at target element with laser dot (2 seconds) |
| `play_video` | Plays video element on slide (5 second placeholder) |
| `wb_open` | Opens whiteboard overlay |
| `wb_draw_text` | Draws text on whiteboard |
| `wb_draw_shape` | Draws rectangle/circle/triangle |
| `wb_draw_chart` | Draws bar/line/pie/etc chart |
| `wb_draw_latex` | Draws LaTeX math formula |
| `wb_draw_table` | Draws data table |
| `wb_draw_line` | Draws line/arrow |
| `wb_draw_code` | Draws syntax-highlighted code block |
| `wb_edit_code` | Edits existing code block lines |
| `wb_clear` | Removes all whiteboard elements |
| `wb_delete` | Removes specific element by ID |
| `wb_close` | Closes whiteboard |
| `discussion` | Pauses for class discussion (1 second) |

---

## Scene Types

| Type | Rendered as |
|------|------------|
| `slide` | SlideCanvas (text, images, shapes, charts, tables, LaTeX, code) |
| `quiz` | Click-to-reveal multiple choice |
| `interactive` | Iframe with widget HTML or URL |
| `pbl` | Placeholder (project-based learning) |

---

## RTL Support

Automatic. When `stage.languageDirective` contains "Arabic", "العربية", "Farsi", or "Urdu", sets `dir="rtl"` on the container.

---

## ZIP Structure

```
lesson-math-g7.zip
├── classroom.json       ← required
└── media/
    ├── audio-001.mp3    ← optional TTS files
    ├── audio-002.mp3
    └── img-001.png      ← optional generated images
```

---

## Exports

```tsx
import {
  ClassroomViewer,       // component
  loadFromZip,           // load classroom from ZIP Blob
  extractMediaFromZip,   // extract media files as Object URLs
} from '@openmaic/viewer';

import type {
  ClassroomData,
  ClassroomViewerProps,
  Action,
} from '@openmaic/viewer';
```

---

## Bucket CORS

If hosting on R2/S3, configure CORS to allow your app's origin:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank slides | `pnpm --filter @openmaic/renderer run build` |
| `@openmaic/viewer` not found | Verify `workspace:*` in package.json, run `pnpm install` |
| Images not showing | Set `mediaBaseUrl` or verify absolute URLs in JSON |
| No RTL | Verify `stage.languageDirective` contains "Arabic" |
| TTS blocked | Browser requires user gesture — click Play first |
| ZIP not loading | JSZip is auto-bundled; no extra install needed |
| Type errors | `pnpm --filter @openmaic/viewer run build` |
| CORS errors | Configure bucket CORS policy |
