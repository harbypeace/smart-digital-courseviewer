import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, FileCode2, Loader2, RefreshCw } from 'lucide-react';
import {
  appendAuthToken,
  cleanLessonCode,
  cleanUnitCode,
  COURSE_FOLDERS,
  generatePrivateHtmlCandidates,
} from '../lib/utils';

function cleanCandidatePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/^api\/courses\//, '');
}

function getPageParams() {
  const params = new URLSearchParams(window.location.search);
  const subject = params.get('subject') || 'hadith11';
  const unit = cleanUnitCode(params.get('unit') || 'u1');
  const lesson = cleanLessonCode(params.get('lesson') || 'l1');
  const file = params.get('file') || params.get('html') || '';
  const title = params.get('title') || params.get('lesson_title') || `${subject} · ${unit} ${lesson}`;
  return { subject, unit, lesson, file, title };
}

export function HtmlLessonViewer() {
  const pageParams = useMemo(getPageParams, []);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(true);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSource = candidates[activeIndex] || '';
  const authenticatedSource = currentSource ? appendAuthToken(currentSource) : '';

  const buildCandidates = () => {
    const { subject, unit, lesson, file } = pageParams;
    const folder = COURSE_FOLDERS[subject] || subject;
    const generated = generatePrivateHtmlCandidates(subject, unit, lesson, file || undefined, folder);
    const explicit = file
      ? `/api/courses/${cleanCandidatePath(file)}?subject=${encodeURIComponent(subject)}`
      : '';
    const sameOrigin = generated.filter((candidate) => candidate.startsWith('/api/courses/'));
    const fallback = [
      `/api/courses/${folder}/${folder}_${unit}${lesson}.html?subject=${encodeURIComponent(subject)}`,
      `/api/courses/${subject}/${subject}_${unit}${lesson}.html?subject=${encodeURIComponent(subject)}`,
      `/api/courses/${folder}/${folder}${unit}${lesson}.html?subject=${encodeURIComponent(subject)}`,
    ];
    return [...new Set([explicit, ...sameOrigin, ...fallback].filter(Boolean))];
  };

  const resolveLesson = async () => {
    setIsResolving(true);
    setFrameLoaded(false);
    setError(null);
    setActiveIndex(0);

    const nextCandidates = buildCandidates();
    setCandidates(nextCandidates);

    for (let index = 0; index < nextCandidates.length; index += 1) {
      const candidate = appendAuthToken(nextCandidates[index]);
      try {
        const response = await fetch(candidate, { method: 'HEAD', cache: 'no-store' });
        if (response.ok) {
          setActiveIndex(index);
          setIsResolving(false);
          return;
        }
      } catch (_error) {
        // Try the next naming convention.
      }
    }

    setIsResolving(false);
    setError('لم يتم العثور على ملف الدرس التفاعلي. تحقق من subject و unit و lesson أو من مسار file.');
  };

  useEffect(() => {
    void resolveLesson();
  }, []);

  const handleFrameError = () => {
    if (activeIndex < candidates.length - 1) {
      setFrameLoaded(false);
      setActiveIndex((index) => index + 1);
      return;
    }
    setError('تعذر عرض الدرس التفاعلي. قد يكون الملف غير متاح أو انتهت صلاحية جلسة الوصول.');
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="h-14 shrink-0 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl flex items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/')}
            className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95"
            aria-label="العودة"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex items-center gap-2">
            <span className="rounded-lg bg-cyan-500/15 p-1.5 text-cyan-300"><FileCode2 className="h-4 w-4" /></span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold">{pageParams.title}</h1>
              <p className="truncate text-[10px] uppercase tracking-[0.2em] text-slate-500">Interactive lesson · {pageParams.subject}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void resolveLesson()}
            className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95"
            aria-label="إعادة التحميل"
          >
            <RefreshCw className={`h-4 w-4 ${isResolving ? 'animate-spin' : ''}`} />
          </button>
          {authenticatedSource && (
            <a
              href={authenticatedSource}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95"
              aria-label="فتح الدرس في نافذة جديدة"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      </header>

      <section className="relative flex-1 min-h-0 bg-slate-900/60">
        {(isResolving || (!frameLoaded && authenticatedSource && !error)) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-5 py-4 text-sm text-slate-300 shadow-2xl">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
              <span>جاري تجهيز الدرس التفاعلي...</span>
            </div>
          </div>
        )}

        {error ? (
          <div className="flex h-full min-h-[420px] items-center justify-center p-6 text-center">
            <div className="max-w-md rounded-3xl border border-rose-400/20 bg-rose-950/30 p-7 shadow-2xl">
              <FileCode2 className="mx-auto mb-4 h-10 w-10 text-rose-300" />
              <h2 className="mb-2 text-base font-bold text-rose-100">تعذر تحميل الدرس</h2>
              <p className="text-sm leading-7 text-rose-200/75">{error}</p>
              <button
                type="button"
                onClick={() => void resolveLesson()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-400 active:scale-95"
              >
                <RefreshCw className="h-4 w-4" /> إعادة المحاولة
              </button>
            </div>
          </div>
        ) : authenticatedSource ? (
          <iframe
            key={authenticatedSource}
            title={pageParams.title}
            src={authenticatedSource}
            onLoad={() => { setFrameLoaded(true); setIsResolving(false); }}
            onError={handleFrameError}
            className="h-full min-h-[calc(100vh-3.5rem)] w-full border-0 bg-white"
            referrerPolicy="same-origin"
          />
        ) : null}
      </section>
    </main>
  );
}
