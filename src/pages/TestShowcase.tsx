import React, { useState } from 'react';
import {
  BookOpen,
  MonitorPlay,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  CheckCircle2,
  XCircle,
  Zap,
  FileArchive,
  Upload,
} from 'lucide-react';
import { cleanUnitCode, cleanLessonCode } from '../lib/utils';

type ActiveTab = 'classroom' | 'zip' | 'printed' | 'html' | 'diagnostics';

const CLASSROOM_PRESETS = [
  {
    id: 'FtoY-ugPEF',
    label: 'أدب 10 - درس 2: المعلقات',
    subject: 'adb10p1',
    unit: 'u1',
    lesson: 'l2',
    classroomId: 'FtoY-ugPEF',
    start: 16,
    end: 20,
    scenes: 20,
  },
  {
    id: 'Gd3-ORVDr8',
    label: 'أدب 10 - درس 3: خصائص الشعر',
    subject: 'adb10p1',
    unit: 'u1',
    lesson: 'l3',
    classroomId: 'Gd3-ORVDr8',
    start: 21,
    end: 25,
    scenes: 24,
  },
  {
    id: '1v_nRmh_wh',
    label: 'أدب 10 - درس 1: العصر الجاهلي',
    subject: 'adb10p1',
    unit: 'u1',
    lesson: 'l1',
    classroomId: '1v_nRmh_wh',
    start: 11,
    end: 15,
    scenes: 23,
  },
  {
    id: 'KbOpmXdyXa',
    label: 'أحياء 10 - درس 1: مظاهر الحياة',
    subject: 'bio10p1',
    unit: 'u1',
    lesson: 'l1',
    classroomId: 'KbOpmXdyXa',
    start: 9,
    end: 13,
    scenes: 12,
  },
  {
    id: 'ha_S-1rMCe',
    label: 'أحياء 10 - درس 2: الكائن الحي',
    subject: 'bio10p1',
    unit: 'u1',
    lesson: 'l2',
    classroomId: 'ha_S-1rMCe',
    start: 14,
    end: 18,
    scenes: 16,
  },
  {
    id: 'fiKPGkSoOb',
    label: 'كيمياء 11 - درس 1: المجموعة الثالثة',
    subject: 'chm11p1',
    unit: 'u1',
    lesson: 'l1',
    classroomId: 'fiKPGkSoOb',
    start: 11,
    end: 16,
    scenes: 12,
  },
  {
    id: 'dMLnMKX3RM',
    label: 'فيزياء 10 - درس 1: القوة والحركة',
    subject: 'phy10p1',
    unit: 'u1',
    lesson: 'l1',
    classroomId: 'dMLnMKX3RM',
    start: 11,
    end: 16,
    scenes: 14,
  },
  {
    id: '4qmbpHtVkV',
    label: 'رياضيات 10 - درس 1: القضية المنطقية',
    subject: 'math10p1',
    unit: 'u1',
    lesson: 'l1',
    classroomId: '4qmbpHtVkV',
    start: 11,
    end: 15,
    scenes: 11,
  },
];

const ZIP_PRESETS = [
  {
    id: 'test-classroom',
    label: 'حزمة درس نموذجية (test-classroom.zip)',
    url: '/samples/test-classroom.zip',
    description: 'تحتوي على صوتيات MP3 ومخطط manifest.json',
  },
  {
    id: 'quantum-computing',
    label: 'الحوسبة الكمومية (quantum-computing.maic.zip)',
    url: '/samples/quantum-computing.maic.zip',
    description: 'حزمة تفاعلية OpenMAIC مع مؤثرات سينمائية',
  },
];

export function TestShowcase() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('classroom');
  const [subject, setSubject] = useState('adb10p1');
  const [unit, setUnit] = useState('u1');
  const [lesson, setLesson] = useState('l2');
  const [startPage, setStartPage] = useState(16);
  const [endPage, setEndPage] = useState(20);
  const [classroomId, setClassroomId] = useState('FtoY-ugPEF');
  const [customHtml, setCustomHtml] = useState('');
  const [zipUrl, setZipUrl] = useState('/samples/test-classroom.zip');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Diagnostic states
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResults, setDiagResults] = useState<any[]>([]);

  const applyPreset = (preset: typeof CLASSROOM_PRESETS[0]) => {
    setSubject(preset.subject);
    setUnit(preset.unit);
    setLesson(preset.lesson);
    setStartPage(preset.start);
    setEndPage(preset.end);
    setClassroomId(preset.classroomId);
  };

  const printedUrl = `/printed-pages?subject=${encodeURIComponent(subject)}&unit=${encodeURIComponent(unit)}&lesson=${encodeURIComponent(lesson)}&start=${startPage}&end=${endPage}`;
  const classroomUrl = `/classroom?subject=${encodeURIComponent(subject)}&unit=${encodeURIComponent(unit)}&lesson=${encodeURIComponent(lesson)}&id=${encodeURIComponent(classroomId)}`;
  const zipStreamUrl = `/classroom?mode=zip&zipUrl=${encodeURIComponent(zipUrl)}`;
  const htmlUrl = `/html?subject=${encodeURIComponent(subject)}&unit=${encodeURIComponent(unit)}&lesson=${encodeURIComponent(lesson)}${customHtml ? `&file=${encodeURIComponent(customHtml)}` : ''}`;

  const currentEmbedUrl =
    activeTab === 'classroom'
      ? classroomUrl
      : activeTab === 'zip'
      ? zipStreamUrl
      : activeTab === 'printed'
      ? printedUrl
      : htmlUrl;

  const copyIframeCode = () => {
    const code = `<iframe src="${window.location.origin}${currentEmbedUrl}" width="100%" height="750px" style="border:none;border-radius:12px;overflow:hidden;" allow="autoplay; fullscreen"></iframe>`;
    navigator.clipboard.writeText(code);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    const results: any[] = [];

    // Test 1: ZIP manifest streaming
    try {
      const zUrl = `/api/classroom-zip/data?zip=${encodeURIComponent(zipUrl)}`;
      const t0 = performance.now();
      const res = await fetch(zUrl);
      const duration = Math.round(performance.now() - t0);
      const json = await res.json();
      results.push({
        name: 'ZIP Stream Manifest API',
        url: zUrl,
        status: res.status,
        duration: `${duration}ms`,
        ok: res.ok,
        note: json.data?.stage?.name ? `Stage: "${json.data.stage.name}" (${json.data.scenes?.length} scenes)` : undefined,
        type: 'ZIP Streamer',
      });
    } catch (e: any) {
      results.push({ name: 'ZIP Stream Manifest', ok: false, error: e.message });
    }

    // Test 2: Classroom data resolver
    try {
      const cUrl = `/api/classroom-data?subject=${subject}&unit=${unit}&lesson=${lesson}&id=${classroomId}`;
      const t0 = performance.now();
      const res = await fetch(cUrl);
      const duration = Math.round(performance.now() - t0);
      const json = await res.json();
      results.push({
        name: `Classroom Resolver (${classroomId})`,
        url: cUrl,
        status: res.status,
        duration: `${duration}ms`,
        ok: res.ok,
        note: json.data?.stage?.name ? `Stage: "${json.data.stage.name}" (${json.data.scenes?.length} scenes)` : undefined,
        type: 'Private API',
      });
    } catch (e: any) {
      results.push({ name: 'Classroom Resolver', ok: false, error: e.message });
    }

    // Test 3: Public images CDN
    try {
      const imgUrl = `https://pub-82c5ce36837a4c7e8093a3bb8ff74057.r2.dev/${subject}/${unit}/${lesson}/page-${startPage}-w900.webp`;
      const t0 = performance.now();
      const res = await fetch(imgUrl, { method: 'HEAD' });
      const duration = Math.round(performance.now() - t0);
      results.push({
        name: 'Public Images CDN (coursesimages)',
        url: imgUrl,
        status: res.ok ? 200 : res.status,
        duration: `${duration}ms`,
        ok: res.ok,
        type: 'Public Asset',
      });
    } catch (e: any) {
      results.push({ name: 'Public Images CDN', ok: false, error: e.message });
    }

    setDiagResults(results);
    setDiagRunning(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 flex flex-col gap-6" dir="rtl">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 p-5 bg-slate-900/95 border border-slate-800 rounded-3xl backdrop-blur shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <span>مشغل الغرف الصفية والبث التفاعلي</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold">
                Cloudflare Pages
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              بث مباشر للمشاهد والصوتيات من قواعد بيانات R2 وحزم ZIP المضغوطة مشهداً بمشهد (Progressive Scene Streaming)
            </p>
          </div>
        </div>

        {/* Preset Quick Selectors */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/90 p-2 rounded-2xl border border-slate-800">
          <span className="text-[11px] text-slate-400 font-bold px-2 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            الغرف المتاحة:
          </span>
          <select
            value={classroomId}
            onChange={(e) => {
              const selected = CLASSROOM_PRESETS.find((p) => p.classroomId === e.target.value);
              if (selected) applyPreset(selected);
            }}
            className="bg-slate-800 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-700 outline-none focus:border-cyan-500"
          >
            {CLASSROOM_PRESETS.map((p) => (
              <option key={p.id} value={p.classroomId}>
                {p.label} ({p.scenes} مشهد)
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Navigation Tabs ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('classroom')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'classroom'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>1. الغرفة الصفية (R2 ClassID)</span>
          </button>

          <button
            onClick={() => setActiveTab('zip')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'zip'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <FileArchive className="w-4 h-4" />
            <span>2. بث حزم ZIP مشهداً بمشهد (ZIP Streamer)</span>
          </button>

          <button
            onClick={() => setActiveTab('printed')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'printed'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>3. صفحات الكتاب المطبوع</span>
          </button>

          <button
            onClick={() => setActiveTab('html')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'html'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <MonitorPlay className="w-4 h-4" />
            <span>4. الدرس التفاعلي HTML</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
              activeTab === 'diagnostics'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>5. فحص البث والشبكة</span>
          </button>
        </div>

        {activeTab !== 'diagnostics' && (
          <div className="flex items-center gap-2">
            <button
              onClick={copyIframeCode}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold rounded-lg border border-slate-800 flex items-center gap-1.5 transition"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'تم نسخ كود الـ iframe!' : 'نسخ كود iframe'}</span>
            </button>

            <a
              href={currentEmbedUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>فتح في صفحة مستقلة</span>
            </a>
          </div>
        )}
      </div>

      {/* ── ZIP Stream Controls (When ZIP tab active) ── */}
      {activeTab === 'zip' && (
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <FileArchive className="w-4 h-4 text-amber-400" />
              نماذج ZIP جاهزة للبث:
            </span>
            {ZIP_PRESETS.map((zp) => (
              <button
                key={zp.id}
                onClick={() => setZipUrl(zp.url)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition border ${
                  zipUrl === zp.url
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
                }`}
              >
                {zp.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            <input
              type="text"
              value={zipUrl}
              onChange={(e) => setZipUrl(e.target.value)}
              placeholder="أدخل رابط حزمة ZIP أو مسارها..."
              className="flex-1 bg-slate-950 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-800 outline-none focus:border-amber-500 font-mono"
            />
          </div>
        </div>
      )}

      {/* ── Main Preview Container ── */}
      <main className="flex-1 flex flex-col min-h-[750px]">
        {activeTab !== 'diagnostics' ? (
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col min-h-[750px]">
            <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></span>
                <span>المعاينة التفاعلية المباشرة ({activeTab.toUpperCase()})</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500 truncate max-w-md">{currentEmbedUrl}</span>
            </div>

            <div className="flex-1 w-full h-[750px] min-h-[750px] bg-slate-950 relative">
              <iframe
                key={currentEmbedUrl}
                src={currentEmbedUrl}
                title="Viewer Preview"
                className="w-full h-full min-h-[750px] border-none"
                allow="autoplay; fullscreen; microphone"
              />
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-white">فحص تكامل البث وطبقة الأمان</h3>
                <p className="text-xs text-slate-400">
                  اختبار استجابة نقاط النهاية للـ ZIP Streamer والـ CDN العام (`coursesimages`)
                </p>
              </div>
              <button
                onClick={runDiagnostics}
                disabled={diagRunning}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 disabled:opacity-50"
              >
                <Cpu className="w-4 h-4" />
                <span>{diagRunning ? 'جاري الفحص...' : 'بدء فحص الشبكة'}</span>
              </button>
            </div>

            {diagResults.length > 0 && (
              <div className="grid gap-3">
                {diagResults.map((r, i) => (
                  <div
                    key={i}
                    className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {r.ok ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                      )}
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{r.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            {r.type}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate max-w-lg">{r.url}</div>
                      </div>
                    </div>

                    <div className="text-left">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          r.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {r.status || 'Error'} ({r.duration || '-'})
                      </span>
                      {r.note && <div className="text-[10px] text-slate-400 mt-1">{r.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
