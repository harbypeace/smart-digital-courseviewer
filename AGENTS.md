# Project Guidelines & Critical Memory (CourseViewer)

This document contains essential architectural rules and operational requirements for the CourseViewer project (`courseviewer.lms-yemen.com`).

---

## 1. Cloudflare Pages Production Deployment & Branch Rules
- **Production Branch**: The Cloudflare Pages production environment is locked to the **`master`** branch.
- **Preview Branch**: Pushing to the **`main`** branch only creates temporary **Preview** deployments and will **NOT** update the live production domain (`courseviewer.lms-yemen.com`).
- **How to Deploy Production**:
  1. Commit changes to `main`.
  2. Switch to `master`, merge `main`, and push to `master`:
     ```bash
     git checkout master
     git merge main
     git push origin master
     git checkout main
     ```
  3. Direct CLI deployment alternative:
     ```bash
     npm run build
     npx wrangler pages deploy dist --branch master --project-name courseviewer-cf-pages --commit-dirty=true
     ```
- **Caching**: Pushing to `master` on GitHub automatically purges Cloudflare's edge cache for the custom production domain.

---

## 2. LMS-Yemen Iframe Embedding & CORS Policy
- **Never use `X-Frame-Options: SAMEORIGIN`**: Because `courseviewer.lms-yemen.com` and `lms-yemen.com` are different hostnames, `SAMEORIGIN` blocks modern browsers from displaying the viewer in an iframe on the LMS platform.
- **CSP Frame-Ancestors**: Always maintain the following CSP header in `functions/_middleware.ts` and `public/_headers`:
  ```http
  Content-Security-Policy: frame-ancestors 'self' https://lms-yemen.com https://*.lms-yemen.com http://localhost:* http://127.0.0.1:*
  ```
- **CORS Allowed Origins**: In `functions/_middleware.ts` and `wrangler.jsonc`, always allow `https://lms-yemen.com` and subdomains (`*.lms-yemen.com`), in addition to local development ports.

---

## 3. Local Development (`vite.config.ts`)
- In `vite.config.ts`, the local dev proxy (`/api` and `/pages`) should point to the local backend server:
  ```ts
  proxy: {
    '/api': { target: 'http://localhost:8788', changeOrigin: true },
    '/pages': { target: 'http://localhost:8788', changeOrigin: true },
  }
  ```
- Do not commit production proxy URLs in `vite.config.ts`.

---

## 4. Mobile Viewport & Sidebar Auto-Hide
- On mobile devices (`window.innerWidth < 768`), the **Script Panel** (`showScriptPanel`) and the **Scenes Sidebar** (`showScenesSidebar`) in `src/pages/ClassroomPlayerPage.tsx` must automatically hide after **3 seconds** of inactivity.
- Any touch (`onTouchStart`), pointer down (`onPointerDown`), or scroll (`onScroll`) inside the sidebars resets the 3-second timer.
- Both sidebars render as responsive overlay drawers using `fixed right-0 top-0 bottom-16 w-80 max-w-[85vw] border-l border-slate-800` on mobile.
