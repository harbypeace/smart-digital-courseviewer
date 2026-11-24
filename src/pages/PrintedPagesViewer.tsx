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
  Download,
  HardDrive,
  CheckCircle2,
  Trash2,
  Database,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useDownloadManager } from '../hooks/useDownloadManager';
import { getPageImageObjectUrl } from '../lib/storage/media-cache';
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
  const [startPage, setStartPage] = useState(0);
  const [endPage, setEndPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);

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

  // Offline Caching & Selective Download State
  const [localPageUrls, setLocalPageUrls] = useState<Map<number, string>>(new Map());
  const [isOfflinePlaying, setIsOfflinePlaying] = useState<boolean>(false);
  const [showDownloadModal, setShowDownloadModal] = useState<boolean>(false);
  const [optIncludePages, setOptIncludePages] = useState<boolean>(true);
  const [optIncludeClassroom, setOptIncludeClassroom] = useState<boolean>(true);
  const [pagesDownloadProgress, setPagesDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isClassroomCached, setIsClassroomCached] = useState<boolean>(false);
  const downloadManager = useDownloadManager();

  // Mobile responsiveness, 3-second auto-hide & swipe navigation
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [toolbarVisible, setToolbarVisible] = useState<boolean>(true);
  const toolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const resetToolbarAutoHide = useCallback(() => {
    if (toolbarTimerRef.current) {
      clearTimeout(toolbarTimerRef.current);
      toolbarTimerRef.current = null;
    }
    setToolbarVisible(true);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      toolbarTimerRef.current = setTimeout(() => {
        setToolbarVisible(false);
      }, 3000);
    }
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());

  // Parse URL search parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    // Support path-based URLs: /lesson/:subject/:unit/:lesson or /printed-pages/:subject/:unit/:lesson
    const pathMatch = pathname.match(/\/(?:lesson|printed-pages)\/([^/]+)(?:\/([^/]+)\/([^/]+))?(?:\/(\d+))?(?:\/(\d+))?/i);
    let pathSubject = '';
    let pathUnit = '';
    let pathLesson = '';
    let pathStart = '';
    let pathEnd = '';

    if (pathMatch) {
      pathSubject = pathMatch[1] !== 'index.html' ? pathMatch[1] : '';
      pathUnit = pathMatch[2] || '';
      pathLesson = pathMatch[3] || '';
      pathStart = pathMatch[4] || '';
      pathEnd = pathMatch[5] || '';
    }

    const s = params.get('subject') || pathSubject || 'adb10p1';
    const u = cleanUnitCode(params.get('unit') || pathUnit || 'u1');
    const l = cleanLessonCode(params.get('lesson') || pathLesson || 'l1');
    const startParam = params.get('start');
    const endParam = params.get('end') || params.get('total');
    const start = startParam !== null ? parseInt(startParam, 10) : (pathStart !== '' ? parseInt(pathStart, 10) : 0);
    const end = endParam !== null ? parseInt(endParam, 10) : (pathEnd !== '' ? parseInt(pathEnd, 10) : (start + 10));
    const pageParam = params.get('page');
    const initialPage = pageParam !== null ? parseInt(pageParam, 10) : start;
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

  const refreshLocalPages = useCallback(async () => {
    if (typeof window === 'undefined') return;
    try {
      const status = await downloadManager.checkPagesStatus(subject, unit, lesson, startPage, endPage);
      const map = new Map<number, string>();
      for (const p of status.cachedPages) {
        const objUrl = await getPageImageObjectUrl(subject, unit, lesson, p);
        if (objUrl) map.set(p, objUrl);
      }
      setLocalPageUrls(map);
      setIsOfflinePlaying(status.isFullyCached);

      const hasClassroom = await downloadManager.checkIsDownloaded(subject, unit, lesson, `${subject}_${unit}_${lesson}`);
      setIsClassroomCached(hasClassroom);
    } catch {}
  }, [subject, unit, lesson, startPage, endPage, downloadManager]);

  useEffect(() => {
    refreshLocalPages();
  }, [refreshLocalPages]);

  // Touch Swipe Handlers for mobile page flipping
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
    }
    resetToolbarAutoHide();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;

    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0) {
        goToPrevPage();
      } else {
        goToNextPage();
      }
    }
  };

  const getPageSrc = (pageNum: number, widthOverride?: 600 | 900 | 1200) => {
    if (localPageUrls.has(pageNum)) {
      return localPageUrls.get(pageNum)!;
    }
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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={resetToolbarAutoHide}
      onScroll={resetToolbarAutoHide}
      className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 select-none overflow-hidden relative"
      dir="rtl"
    >
      {/* ── Sleek Floating Toolbar (Glassmorphic pill at top-center with small icons) ── */}
      <aside
        onPointerDown={resetToolbarAutoHide}
        className={`fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 bg-slate-900/85 backdrop-blur-xl border border-slate-700/60 shadow-2xl rounded-2xl transition-all duration-300 max-w-[95vw] overflow-x-auto ${
          isMobile && !toolbarVisible
            ? 'opacity-0 -translate-y-12 pointer-events-none'
            : 'opacity-100 translate-y-0'
        }`}
      >
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

        <div className="h-4 w-px bg-slate-700/70 mx-0.5"></div>

        {/* Offline Badge */}
        {isOfflinePlaying && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 shrink-0"
            title="يتم عرض جميع الصفحات من الذاكرة المحلية لجهازك بدون إنترنت"
          >
            <HardDrive className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">محلي</span>
          </div>
        )}

        {/* Download Manager Trigger */}
        <button
          onClick={() => setShowDownloadModal(true)}
          className={`p-1.5 rounded-lg transition shrink-0 relative ${
            showDownloadModal
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
              : pagesDownloadProgress || downloadManager.isDownloading
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
              : isOfflinePlaying
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
          }`}
          title="مدير التنزيلات والتشغيل بدون إنترنت"
        >
          <Download className="w-3.5 h-3.5" />
          {(pagesDownloadProgress || downloadManager.isDownloading) && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-950 animate-ping" />
          )}
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
                      alt={`صفحة ${pageNum}`}
                      className="w-full h-auto max-w-full object-contain block shadow-xl transition-transform hover:brightness-105"
                      loading="eager"
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
      {/* ── Selective Download Manager Modal ── */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">مدير التنزيلات والتشغيل بدون إنترنت</h3>
                  <p className="text-[11px] text-slate-400">حفظ صفحات الكتاب المطبوع والغرفة الصفية على جهازك</p>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {/* Lesson Context Badge */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black text-white">
                    {subject} · {cleanUnitCode(unit)} / {cleanLessonCode(lesson)}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-800/40">
                  ص {startPage} إلى ص {endPage} ({totalPages} صفحة)
                </span>
              </div>

              {/* Options Header */}
              <div className="text-xs font-bold text-slate-400 pt-1">
                حدد العناصر التي ترغب في حفظها على جهازك (الافتراضي تنزيل الكل):
              </div>

              {/* Option 1: 900px WebP Printed Pages */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  optIncludePages
                    ? 'bg-slate-950/90 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={optIncludePages}
                      onChange={(e) => setOptIncludePages(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                    />
                    <div>
                      <h4 className="text-xs font-black text-white flex items-center gap-2">
                        <span>صفحات الكتاب المطبوع (دقة 900px WebP فقط)</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                          900px
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        تنزيل الصفحات من ص {startPage} إلى ص {endPage} بدقة 900px WebP المحسنة للسرعة وتوفير المساحة مع وضوح عالي.
                      </p>
                    </div>
                  </label>

                  {localPageUrls.size > 0 && (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>محفوظة ({localPageUrls.size} ص)</span>
                      </span>
                      <button
                        onClick={async () => {
                          await downloadManager.deletePagesOnly(subject, unit, lesson, startPage, endPage);
                          await refreshLocalPages();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-bold transition flex items-center gap-1 border border-rose-500/30"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف الصفحات</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Option 2: Interactive Classroom */}
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  optIncludeClassroom
                    ? 'bg-slate-950/90 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={optIncludeClassroom}
                      onChange={(e) => setOptIncludeClassroom(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                    />
                    <div>
                      <h4 className="text-xs font-black text-white">الغرفة الصفية التفاعلية للدرس (Classroom & Audio)</h4>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        تنزيل المشاهد التفاعلية، حوارات المعلم الذكي (TTS)، والرسوم التوضيحية للتشغيل الكامل بدون إنترنت.
                      </p>
                    </div>
                  </label>

                  {isClassroomCached && (
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="text-emerald-400 font-bold text-xs flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>محفوظة محلياً</span>
                      </span>
                      <button
                        onClick={async () => {
                          await downloadManager.deleteLesson(subject, unit, lesson, `${subject}_${unit}_${lesson}`);
                          await refreshLocalPages();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] font-bold transition flex items-center gap-1 border border-rose-500/30"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف الغرفة</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Display */}
              {pagesDownloadProgress && (
                <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري تنزيل صفحات الكتاب (900px WebP): ص {pagesDownloadProgress.current} من {pagesDownloadProgress.total}...</span>
                    </span>
                    <span className="font-mono">
                      {Math.round((pagesDownloadProgress.current / pagesDownloadProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-200 rounded-full"
                      style={{
                        width: `${(pagesDownloadProgress.current / pagesDownloadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {downloadManager.isDownloading && (
                <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-800/60 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري تنزيل وحفظ الغرفة الصفية...</span>
                    </span>
                    <span className="font-mono">{downloadManager.activeTask?.progress || 0}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-all duration-200 rounded-full"
                      style={{ width: `${downloadManager.activeTask?.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Storage Stats Bar */}
              {downloadManager.storageStats && (
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="font-bold text-slate-300">المساحة المحلية المستخدمة</span>
                    </div>
                    <span className="font-mono text-slate-400 text-[11px]">
                      {(downloadManager.storageStats.usedBytes / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            2,
                            (downloadManager.storageStats.usedBytes / (downloadManager.storageStats.quotaBytes || 1)) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{downloadManager.storageStats.isPersisted ? 'الحفظ الدائم مُفعل' : 'الحفظ الافتراضي'}</span>
                    </span>
                    {!downloadManager.storageStats.isPersisted && (
                      <button
                        onClick={() => downloadManager.enablePersistentStorage()}
                        className="text-cyan-400 hover:text-cyan-300 font-bold underline"
                      >
                        طلب حفظ دائم
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {optIncludePages && optIncludeClassroom
                  ? 'سيتم تنزيل الكل (الصفحات 900px + الغرفة الصفية)'
                  : optIncludePages
                  ? 'سيتم تنزيل صفحات الكتاب المطبوع فقط (900px)'
                  : optIncludeClassroom
                  ? 'سيتم تنزيل الغرفة الصفية التفاعلية فقط'
                  : 'يرجى تحديد عنصر واحد على الأقل'}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDownloadModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
                >
                  إغلاق
                </button>
                <button
                  disabled={
                    (!optIncludePages && !optIncludeClassroom) ||
                    Boolean(pagesDownloadProgress) ||
                    downloadManager.isDownloading
                  }
                  onClick={async () => {
                    if (optIncludePages) {
                      setPagesDownloadProgress({ current: 0, total: totalPages });
                      await downloadManager.downloadLessonPages(
                        subject,
                        unit,
                        lesson,
                        startPage,
                        endPage,
                        (curr, tot) => setPagesDownloadProgress({ current: curr, total: tot })
                      );
                      setPagesDownloadProgress(null);
                      await refreshLocalPages();
                    }
                    if (optIncludeClassroom) {
                      await downloadManager.downloadLesson({
                        subject,
                        unit,
                        lesson,
                        classroomId: `${subject}_${unit}_${lesson}`,
                        title: `درس ${lesson} (${subject})`,
                      });
                      await refreshLocalPages();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black shadow-lg shadow-cyan-500/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {pagesDownloadProgress || downloadManager.isDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري التنزيل...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {optIncludePages && optIncludeClassroom ? 'تنزيل الكل الآن' : 'تنزيل المحدد الآن'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
