import React, { useState, useEffect, useRef } from 'react';
import {
  cleanUnitCode,
  cleanLessonCode,
  generatePrivateHtmlCandidates,
  PUBLIC_R2_IMAGES,
  COURSE_FOLDERS,
} from '../lib/utils';
import { Loader2, AlertCircle, RefreshCw, Maximize2, Minimize2, Printer } from 'lucide-react';

export function HtmlLessonViewer() {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);

  const fetchHtml = async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams(window.location.search);
    const s = params.get('subject') || 'hadith11';
    const u = cleanUnitCode(params.get('unit') || 'u1');
    const l = cleanLessonCode(params.get('lesson') || 'l1');
    const folder = params.get('folder') || COURSE_FOLDERS[s] || s;
    const file = params.get('file') || params.get('html') || (folder ? `${folder}/${folder}_${u}${l}.html` : undefined);

    const candidates = generatePrivateHtmlCandidates(s, u, l, file || undefined, folder);
    let resolvedHtml: string | null = null;
    let resolvedUrl: string = '';

    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const text = await res.text();
          if (
            text &&
            text.trim().length > 0 &&
            !text.startsWith('{"error"') &&
            !text.includes('"File not found"') &&
            !text.includes('"Lesson not found"') &&
            !text.includes('"HTML file not found"') &&
            (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('<div') || text.includes('<style') || text.includes('<body'))
          ) {
            resolvedHtml = text;
            resolvedUrl = url;
            break;
          }
        }
      } catch (_e) {}
    }

    if (!resolvedHtml) {
      setError(`تعذر العثور على ملف الدرس HTML لمادة (${s}) - الوحدة (${u}) - الدرس (${l})`);
      setLoading(false);
      return;
    }

    try {
      let html = resolvedHtml;
      setActiveUrl(resolvedUrl);
      const publicBaseUrl = `${PUBLIC_R2_IMAGES}/${s}/${u}/${l}/`;

      // Inject base tag so all relative assets (images, css, scripts) resolve natively
      if (!html.includes('<base ') && !html.includes('<base>')) {
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head><base href="${publicBaseUrl}">`);
        } else {
          html = `<base href="${publicBaseUrl}">` + html;
        }
      }

      setHtmlContent(html);
    } catch (err: any) {
      console.error('HTML fetch error:', err);
      setError(err?.message || 'فشل تحميل الدرس HTML');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHtml();
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-screen min-h-screen bg-slate-950 text-slate-100 overflow-hidden relative"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      dir="rtl"
    >
      {/* ── Minimalist Floating Action Controls (Hover Overlay) ── */}
      <aside
        className={`fixed top-3 left-3 z-50 flex items-center gap-1.5 p-1 bg-slate-900/85 backdrop-blur border border-slate-800 rounded-2xl shadow-xl transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-30 hover:opacity-100'
        }`}
      >
        <button
          onClick={fetchHtml}
          className="p-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition"
          title="إعادة التحميل"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            const iframe = document.querySelector('iframe');
            iframe?.contentWindow?.print();
          }}
          className="p-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition"
          title="طباعة الصفحة"
        >
          <Printer className="w-4 h-4" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition"
          title="ملء الشاشة"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </aside>

      {/* ── Full-Page Direct HTML Renderer ── */}
      {loading && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center p-6 bg-slate-950">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          <div className="text-sm font-bold text-slate-200">جاري جلب صفحة الدرس التفاعلي HTML...</div>
        </div>
      )}

      {error && !loading && (
        <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950">
          <div className="max-w-md p-6 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-sm font-black text-rose-200">تعذر تحميل صفحة HTML</h3>
            <p className="text-xs text-rose-300/80 leading-relaxed font-mono">{error}</p>
            <button
              onClick={fetchHtml}
              className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {!loading && !error && htmlContent && (
        <iframe
          srcDoc={htmlContent}
          title="الدرس التفاعلي"
          className="w-full h-full min-h-screen border-none m-0 p-0 block bg-white"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        />
      )}
    </div>
  );
}
