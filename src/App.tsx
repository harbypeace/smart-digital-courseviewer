import { lazy, Suspense, useEffect, useState } from 'react';

const PrintedPagesViewer = lazy(() =>
  import('./pages/PrintedPagesViewer').then(({ PrintedPagesViewer: component }) => ({ default: component })),
);
const ClassroomPlayerPage = lazy(() =>
  import('./pages/ClassroomPlayerPage').then(({ ClassroomPlayerPage: component }) => ({ default: component })),
);
const HtmlLessonViewer = lazy(() =>
  import('./pages/HtmlLessonViewer').then(({ HtmlLessonViewer: component }) => ({ default: component })),
);
const TestShowcase = lazy(() =>
  import('./pages/TestShowcase').then(({ TestShowcase: component }) => ({ default: component })),
);

function getInitialRoute(): string {
  if (typeof window === 'undefined') return 'classroom';
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode')?.toLowerCase();
  const view = params.get('view')?.toLowerCase();

  if (path === '/html' || path.startsWith('/html/') || mode === 'html' || view === 'html') {
    return 'html';
  }
  if (path.includes('/printed-pages') || path.includes('/lesson/') || mode === 'printed' || view === 'printed') {
    return 'printed';
  }
  if (path.includes('/test') || mode === 'test' || view === 'test') {
    return 'test';
  }
  return 'classroom';
}

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-4 text-sm shadow-2xl">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300/30 border-t-cyan-300" />
        <span>جاري تحميل الواجهة...</span>
      </div>
    </div>
  );
}

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<string>(getInitialRoute);

  useEffect(() => {
    const handlePopState = () => setCurrentRoute(getInitialRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <Suspense fallback={<RouteLoading />}>
      {currentRoute === 'html' ? <HtmlLessonViewer /> : null}
      {currentRoute === 'printed' ? <PrintedPagesViewer /> : null}
      {currentRoute === 'test' ? <TestShowcase /> : null}
      {currentRoute === 'classroom' ? <ClassroomPlayerPage /> : null}
    </Suspense>
  );
}
