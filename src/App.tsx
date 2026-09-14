import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { captureAndScrubAuthToken } from './lib/utils';

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

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_error: Error): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CourseViewer route failed to render', error, info.componentStack);
  }

  handleRetry = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 px-6 text-slate-100">
        <section role="alert" className="w-full max-w-md rounded-3xl border border-rose-400/20 bg-rose-950/30 p-7 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-400/15 text-2xl text-rose-200">!</div>
          <h1 className="text-lg font-bold">تعذر تشغيل الواجهة</h1>
          <p className="mt-3 text-sm leading-7 text-rose-100/75">حدث خطأ غير متوقع أثناء تحميل الدرس. أعد المحاولة، وإذا استمر الخطأ تواصل مع مسؤول النظام.</p>
          <button type="button" onClick={this.handleRetry} className="mt-6 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 active:scale-95">إعادة المحاولة</button>
        </section>
      </main>
    );
  }
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
    captureAndScrubAuthToken();
    const handlePopState = () => setCurrentRoute(getInitialRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return (
    <AppErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
      {currentRoute === 'html' ? <HtmlLessonViewer /> : null}
      {currentRoute === 'printed' ? <PrintedPagesViewer /> : null}
      {currentRoute === 'test' ? <TestShowcase /> : null}
      {currentRoute === 'classroom' ? <ClassroomPlayerPage /> : null}
      </Suspense>
    </AppErrorBoundary>
  );
}
