import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  BookOpen,
  LayoutList,
  Columns,
  Square,
  Printer,
  ImageOff,
  X,
} from 'lucide-react';
import {
  cleanUnitCode,
  cleanLessonCode,
  generatePageImageCandidates,
  generatePageImageUrl,
} from '../lib/utils';

export function PrintedPagesViewer() {
  const [subject, setSubject] = useState('adb10p1');
  const [unit, setUnit] = useState('u1');
  const [lesson, setLesson] = useState('l1');
  const [startPage, setStartPage] = useState(11);
  const [endPage, setEndPage] = useState(15);
  const [currentPage, setCurrentPage] = useState(11);

  // Layout mode: 'vertical' (seamless continuous flow) or 'horizontal' (page flip)
  const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
  const [spreadMode, setSpreadMode] = useState<'single' | 'dual'>('single');
  const [imgWidth, setImgWidth] = useState<600 | 900 | 1200>(900);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // In-page fullscreen lightbox modal for double-click viewing
  const [lightboxPage, setLightboxPage] = useState<number | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(100);

  // Candidate index tracking for error fallbacks
  const [candidateIdx, setCandidateIdx] = useState<Record<number, number>>({});
  const [failedPages, setFailedPages] = useState<Record<number, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Parse URL search parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get('subject') || 'adb10p1';
    const u = cleanUnitCode(params.get('unit') || 'u1');
    const l = cleanLessonCode(params.get('lesson') || 'l1');
    const start = parseInt(params.get('start') || '11', 10);
    const end = parseInt(params.get('end') || params.get('total') || '15', 10);
    const initialPage = parseInt(params.get('page') || String(start), 10);
    const mode = params.get('layout') || params.get('mode');

    setSubject(s);
    setUnit(u);
    setLesson(l);
    setStartPage(start);
    setEndPage(Math.max(start, end));
    setCurrentPage(Math.max(start, Math.min(initialPage, Math.max(start, end))));
    if (mode === 'horizontal' || mode === 'book') {
      setLayoutMode('horizontal');
    }
  }, []);

  const totalPages = Math.max(1, endPage - startPage + 1);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => {
      const step = spreadMode === 'dual' ? 2 : 1;
      return Math.min(endPage, prev + step);
    });
  }, [endPage, spreadMode]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => {
      const step = spreadMode === 'dual' ? 2 : 1;
      return Math.max(startPage, prev - step);
    });
  }, [startPage, spreadMode]);

  // Track active page in vertical continuous mode via IntersectionObserver
  useEffect(() => {
    if (layoutMode !== 'vertical') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page-num'));
            if (pageNum) {
              setCurrentPage(pageNum);
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        threshold: 0.4,
      }
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [layoutMode, totalPages, startPage]);

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxPage !== null) {
        if (e.key === 'Escape') setLightboxPage(null);
        else if (e.key === 'ArrowLeft') {
          setLightboxPage((p) => (p !== null ? Math.min(endPage, p + 1) : null));
        } else if (e.key === 'ArrowRight') {
          setLightboxPage((p) => (p !== null ? Math.max(startPage, p - 1) : null));
        }
        return;
      }

      if (layoutMode === 'horizontal') {
        if (e.key === 'ArrowLeft') goToNextPage();
        else if (e.key === 'ArrowRight') goToPrevPage();
      }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, lightboxPage, endPage, startPage, goToNextPage, goToPrevPage]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleImageError = (pageNum: number) => {
    const candidates = generatePageImageCandidates(subject, unit, lesson, pageNum, startPage, imgWidth);
    const currentIdx = candidateIdx[pageNum] || 0;
    if (currentIdx + 1 < candidates.length) {
      setCandidateIdx((prev) => ({ ...prev, [pageNum]: currentIdx + 1 }));
    } else {
      setFailedPages((prev) => ({ ...prev, [pageNum]: true }));
    }
  };

  const getPageSrc = (pageNum: number, widthOverride?: 600 | 900 | 1200) => {
    const candidates = generatePageImageCandidates(
      subject,
      unit,
      lesson,
      pageNum,
      startPage,
      widthOverride || imgWidth
    );
    const idx = candidateIdx[pageNum] || 0;
    return candidates[Math.min(idx, candidates.length - 1)];
  };

  const pagesList = Array.from({ length: totalPages }, (_, i) => startPage + i);

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 select-none overflow-hidden relative"
      dir="rtl"
    >
      {/* ── Sleek Floating Toolbar (Glassmorphic pill at top-center with small icons) ── */}
      <aside className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 shadow-2xl rounded-2xl transition-all hover:bg-slate-900/95 max-w-[95vw] overflow-x-auto">
        {/* Layout Modes */}
        <div className="flex items-center gap-1">
          {/* Vertical Continuous Mode */}
          <button
            onClick={() => setLayoutMode('vertical')}
            className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${
              layoutMode === 'vertical'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
            title="عرض رأسي متصل بدون فواصل"
          >
            <LayoutList className="w-4 h-4" />
            <span className="text-[11px] font-bold hidden md:inline">متصل</span>
          </button>

          {/* Horizontal Single Page */}
          <button
            onClick={() => {
              setLayoutMode('horizontal');
              setSpreadMode('single');
            }}
            className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${
              layoutMode === 'horizontal' && spreadMode === 'single'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
            title="عرض أفقي صفحة واحدة"
          >
            <Square className="w-4 h-4" />
            <span className="text-[11px] font-bold hidden md:inline">صفحة</span>
          </button>

          {/* Horizontal Double Pages (Spread) */}
          <button
            onClick={() => {
              setLayoutMode('horizontal');
              setSpreadMode('dual');
            }}
            className={`p-1.5 rounded-lg text-xs transition flex items-center gap-1 ${
              layoutMode === 'horizontal' && spreadMode === 'dual'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
            title="عرض أفقي صفحتان متقابلتان"
          >
            <Columns className="w-4 h-4" />
            <span className="text-[11px] font-bold hidden md:inline">صفحتان</span>
          </button>
        </div>

        <div className="h-4 w-px bg-slate-700/70 mx-0.5"></div>

        {/* Page Counter Badge */}
        <div className="px-2 py-0.5 rounded-lg bg-slate-950/70 border border-slate-800 text-[11px] font-mono font-bold text-cyan-400 flex items-center gap-1 shrink-0">
          <span>صفحة</span>
          <span className="text-white">{currentPage}</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400">{endPage}</span>
        </div>

        <div className="h-4 w-px bg-slate-700/70 mx-0.5"></div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="تصغير"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(100)}
            className="text-[10px] font-mono px-1 py-0.5 text-slate-300 hover:text-white rounded transition"
            title="إعادة ضبط 100%"
          >
            {zoomLevel}%
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
            title="تكبير"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-700/70 mx-0.5"></div>

        {/* Resolution Dropdown */}
        <select
          value={imgWidth}
          onChange={(e) => setImgWidth(Number(e.target.value) as any)}
          className="text-[11px] bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-1.5 py-1 outline-none focus:border-cyan-500 cursor-pointer"
          title="دقة الصور الممسوحة"
        >
          <option value={600}>600px</option>
          <option value={900}>900px</option>
          <option value={1200}>1200px (عالي)</option>
        </select>

        {/* Print Button */}
        <button
          onClick={() => window.print()}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          title="طباعة الصفحات"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
          title="ملء الشاشة (F)"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </aside>

      {/* ── Main Book Reader Canvas ── */}
      <main
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-slate-950 relative w-full h-full custom-scrollbar"
      >
        {/* ── Mode 1: Continuous Vertical Seamless Flow (Zero Gap) ── */}
        {layoutMode === 'vertical' && (
          <div
            className="w-full max-w-4xl mx-auto flex flex-col items-center pt-16 pb-20 transition-transform duration-200"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center' }}
          >
            {pagesList.map((pageNum) => (
              <div
                key={pageNum}
                id={`page-${pageNum}`}
                data-page-num={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                  else pageRefs.current.delete(pageNum);
                }}
                className="w-full relative group border-b border-slate-900/50 flex flex-col items-center justify-center p-0 m-0"
              >
                {/* Floating Discreet Page Badge */}
                <div className="absolute top-3 right-4 z-10 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-mono font-bold text-slate-300 border border-white/10 opacity-40 group-hover:opacity-100 transition-opacity pointer-events-none">
                  صفحة {pageNum}
                </div>

                {/* Page Image (Double-click to open in full page) */}
                <div
                  onDoubleClick={() => setLightboxPage(pageNum)}
                  className="w-full flex items-center justify-center bg-slate-950 cursor-zoom-in overflow-hidden"
                  title="انقر نقرًا مزدوجًا (Double Click) لعرض الصفحة بحجم كامل"
                >
                  {failedPages[pageNum] ? (
                    <div className="p-16 flex flex-col items-center justify-center text-slate-500 gap-2 text-center">
                      <ImageOff className="w-12 h-12 text-slate-600" />
                      <span className="text-xs font-bold">لا توجد صورة ممسوحة لصفحة {pageNum}</span>
                    </div>
                  ) : (
                    <img
                      src={getPageSrc(pageNum)}
                      srcSet={`${generatePageImageUrl(subject, unit, lesson, pageNum, 600)} 600w, ${generatePageImageUrl(subject, unit, lesson, pageNum, 900)} 900w, ${generatePageImageUrl(subject, unit, lesson, pageNum, 1200)} 1200w`}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 950px"
                      alt={`صفحة ${pageNum}`}
                      className="w-full h-auto max-w-full object-contain block shadow-xl transition-transform hover:brightness-105"
                      loading="lazy"
                      onError={() => handleImageError(pageNum)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Mode 2: Horizontal Page-Flip & Dual-Spread Mode ── */}
        {layoutMode === 'horizontal' && (
          <div className="w-full h-full flex items-center justify-center p-4 sm:p-8 pt-16 relative overflow-hidden">
            {/* Floating Transparent Navigation Buttons (Fixed on Left & Right) */}
            {/* Right Button (Previous in RTL) */}
            <button
              onClick={goToPrevPage}
              disabled={currentPage <= startPage}
              className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 p-3 sm:p-4 rounded-2xl bg-black/25 hover:bg-black/75 text-white/60 hover:text-white border border-white/10 hover:border-white/30 backdrop-blur-md shadow-2xl transition-all hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none"
              title="الصفحة السابقة"
            >
              <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>

            {/* Left Button (Next in RTL) */}
            <button
              onClick={goToNextPage}
              disabled={currentPage >= endPage}
              className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 p-3 sm:p-4 rounded-2xl bg-black/25 hover:bg-black/75 text-white/60 hover:text-white border border-white/10 hover:border-white/30 backdrop-blur-md shadow-2xl transition-all hover:scale-110 active:scale-95 disabled:opacity-0 disabled:pointer-events-none"
              title="الصفحة التالية"
            >
              <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
            </button>

            {/* Pages Canvas */}
            <div
              className="flex items-center justify-center gap-2 sm:gap-4 transition-transform duration-200"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
            >
              {/* Page 1 */}
              <div
                onDoubleClick={() => setLightboxPage(currentPage)}
                className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden max-w-[90vw] sm:max-w-2xl min-h-[500px] flex items-center justify-center cursor-zoom-in group"
                title="انقر نقرًا مزدوجًا (Double Click) لعرض الصفحة بحجم كامل"
              >
                <div className="absolute top-3 right-3 z-10 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur text-xs font-mono font-bold text-cyan-400 border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity">
                  صفحة {currentPage}
                </div>

                {failedPages[currentPage] ? (
                  <div className="p-12 flex flex-col items-center justify-center text-slate-500 gap-2 text-center">
                    <ImageOff className="w-12 h-12 text-slate-600" />
                    <span className="text-xs font-bold">لا توجد صورة لصفحة {currentPage}</span>
                  </div>
                ) : (
                  <img
                    src={getPageSrc(currentPage)}
                    alt={`صفحة ${currentPage}`}
                    className="max-h-[82vh] w-auto object-contain block hover:brightness-105 transition"
                    onError={() => handleImageError(currentPage)}
                  />
                )}
              </div>

              {/* Page 2 (Dual Spread) */}
              {spreadMode === 'dual' && currentPage + 1 <= endPage && (
                <div
                  onDoubleClick={() => setLightboxPage(currentPage + 1)}
                  className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden max-w-[90vw] sm:max-w-2xl min-h-[500px] flex items-center justify-center cursor-zoom-in group"
                  title="انقر نقرًا مزدوجًا (Double Click) لعرض الصفحة بحجم كامل"
                >
                  <div className="absolute top-3 right-3 z-10 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur text-xs font-mono font-bold text-emerald-400 border border-white/10 opacity-70 group-hover:opacity-100 transition-opacity">
                    صفحة {currentPage + 1}
                  </div>

                  {failedPages[currentPage + 1] ? (
                    <div className="p-12 flex flex-col items-center justify-center text-slate-500 gap-2 text-center">
                      <ImageOff className="w-12 h-12 text-slate-600" />
                      <span className="text-xs font-bold">لا توجد صورة لصفحة {currentPage + 1}</span>
                    </div>
                  ) : (
                    <img
                      src={getPageSrc(currentPage + 1)}
                      alt={`صفحة ${currentPage + 1}`}
                      className="max-h-[82vh] w-auto object-contain block hover:brightness-105 transition"
                      onError={() => handleImageError(currentPage + 1)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── In-Page Fullscreen Image Lightbox (Triggered on Double-Click) ── */}
      {lightboxPage !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxPage(null);
          }}
        >
          {/* Lightbox Topbar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-2xl backdrop-blur-md">
            <span className="text-xs font-mono font-bold text-cyan-400">
              صفحة {lightboxPage} من {endPage}
            </span>

            <div className="h-4 w-px bg-slate-700"></div>

            <button
              onClick={() => setLightboxZoom((z) => (z === 100 ? 160 : 100))}
              className="p-1 text-slate-300 hover:text-white rounded text-xs font-bold flex items-center gap-1 transition"
              title="تكبير / تصغير"
            >
              {lightboxZoom === 100 ? <ZoomIn className="w-3.5 h-3.5" /> : <ZoomOut className="w-3.5 h-3.5" />}
              <span>{lightboxZoom}%</span>
            </button>

            <div className="h-4 w-px bg-slate-700"></div>

            <button
              onClick={() => setLightboxPage(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="إغلاق العرض الكامل (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Floating Transparent Lightbox Navigation */}
          <button
            onClick={() => setLightboxPage((p) => (p !== null ? Math.max(startPage, p - 1) : null))}
            disabled={lightboxPage <= startPage}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-50 p-4 rounded-2xl bg-black/30 hover:bg-black/80 text-white/60 hover:text-white border border-white/10 hover:border-white/30 backdrop-blur-md shadow-2xl transition-all hover:scale-110 disabled:opacity-0 disabled:pointer-events-none"
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          <button
            onClick={() => setLightboxPage((p) => (p !== null ? Math.min(endPage, p + 1) : null))}
            disabled={lightboxPage >= endPage}
            className="fixed left-4 top-1/2 -translate-y-1/2 z-50 p-4 rounded-2xl bg-black/30 hover:bg-black/80 text-white/60 hover:text-white border border-white/10 hover:border-white/30 backdrop-blur-md shadow-2xl transition-all hover:scale-110 disabled:opacity-0 disabled:pointer-events-none"
            title="الصفحة التالية"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          {/* Fullscreen High-Res Image */}
          <div
            onDoubleClick={() => setLightboxZoom((z) => (z === 100 ? 160 : 100))}
            className="max-w-[95vw] max-h-[92vh] overflow-auto flex items-center justify-center p-2 cursor-zoom-in custom-scrollbar"
            title="انقر نقرًا مزدوجًا لتكبير/تصغير الصورة"
          >
            <img
              src={getPageSrc(lightboxPage, 1200)}
              alt={`صفحة ${lightboxPage}`}
              className="max-h-[90vh] max-w-[92vw] w-auto object-contain block rounded-lg shadow-2xl transition-transform duration-200"
              style={{ transform: `scale(${lightboxZoom / 100})` }}
              onError={() => handleImageError(lightboxPage)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
