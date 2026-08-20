'use client';

import { useEffect, useRef } from 'react';

const STYLE_ID = '__openmaic-viewer-styles__';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');

/* ── Keyframes ── */
@keyframes cv-fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes cv-slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes cv-slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes cv-slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes cv-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.05); opacity: 0.85; }
}
@keyframes cv-correctPulse {
  0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); }
  70%  { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
  100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
}
@keyframes cv-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes cv-spin {
  to { transform: rotate(360deg); }
}
@keyframes cv-pulseRing {
  0%   { transform: scale(0.85); opacity: 0.7; }
  50%  { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(0.85); opacity: 0; }
}

/* ── Base ── */
.classroom-viewer {
  font-family: 'Inter', 'Noto Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.5;
  box-sizing: border-box;
}
.classroom-viewer *, .classroom-viewer *::before, .classroom-viewer *::after {
  box-sizing: border-box;
}
.classroom-viewer button {
  font-family: inherit;
  cursor: pointer;
}
.classroom-viewer button:disabled {
  cursor: default;
}

/* ── Hover helpers (cannot do :hover in inline styles) ── */
.cv-btn-hover:hover:not(:disabled) {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.cv-option-hover:hover {
  transform: translateY(-2px);
  filter: brightness(1.02);
}
.cv-nav-item:hover {
  filter: brightness(1.06);
}
.cv-start-btn:hover {
  transform: translateX(-50%) scale(1.04);
}
.cv-start-btn:active {
  transform: translateX(-50%) scale(0.98);
}
.cv-icon-btn:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: scale(1.08);
}
.cv-icon-btn:active:not(:disabled) {
  transform: scale(0.95);
}

/* ── Scrollbar ── */
.classroom-viewer ::-webkit-scrollbar { width: 6px; }
.classroom-viewer ::-webkit-scrollbar-track { background: transparent; }
.classroom-viewer ::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 3px; }
.classroom-viewer ::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.5); }

/* ── Responsive utilities ── */
@media (max-width: 639px) {
  .cv-hide-mobile { display: none !important; }
  .cv-mobile-full { width: 100% !important; max-width: 100% !important; }
}
@media (min-width: 640px) and (max-width: 1023px) {
  .cv-hide-tablet { display: none !important; }
}
@media (min-width: 1024px) {
  .cv-hide-desktop { display: none !important; }
}

/* ── Focus ring ── */
.classroom-viewer button:focus-visible,
.classroom-viewer [role="button"]:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}
`;

export function StyleInjector() {
  const injected = useRef(false);

  useEffect(() => {
    if (injected.current) return;
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) { injected.current = true; return; }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    injected.current = true;
  }, []);

  return null;
}
