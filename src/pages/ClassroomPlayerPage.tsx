import React, { useState, useEffect, useRef, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import { ClassroomViewer } from '@openmaic/viewer';
import type { ClassroomData } from '@openmaic/viewer';
import {
  loadUniversalFromZip,
  loadUniversalFromJson,
  loadUniversalFromClassId,
  revokeUniversalUrls,
} from '../lib/universal-loader';
import { cleanUnitCode, cleanLessonCode, PRIVATE_COURSES_PROXY } from '../lib/utils';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Maximize2,
  Minimize2,
  Sparkles,
  Upload,
  FileArchive,
  ListOrdered,
  MessageSquareQuote,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Search,
  Copy,
  Check,
  BookOpen,
  Mic,
  Music,
  Sliders,
  PanelLeftClose,
  PanelLeftOpen,
  Volume2,
  Radio,
  Settings2,
} from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ClassroomErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ClassroomViewer caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950 text-center">
          <div className="max-w-md p-6 bg-rose-950/40 border border-rose-800/60 rounded-2xl space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
            <h3 className="text-sm font-black text-rose-200">خطأ في تقديم المشهد التفاعلي</h3>
            <p className="text-xs text-rose-300/80 leading-relaxed font-mono">
              {this.state.error?.message || 'حدث خطأ غير متوقع أثناء معالجة عناصر الشريحة'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Normalizes audio URLs to either AI TTS Voiceovers or Original ZIP Audio
 */
function applyVoiceSource(
  raw: ClassroomData,
  source: 'tts' | 'original' | 'custom',
  subject: string,
  unit: string,
  lesson: string,
  classId: string,
  zipUrl?: string,
  customAudioMap?: Map<string, string>
): ClassroomData {
  if (!raw || typeof raw !== 'object') return raw;
  const clone = JSON.parse(JSON.stringify(raw));
  const u = cleanUnitCode(unit);
  const l = cleanLessonCode(lesson);
  const cId = classId || clone.id || 'classroom';
  const baseTts = `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/tts`;
  const defaultZip = zipUrl || `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/classroom.zip`;

  if (Array.isArray(clone.scenes)) {
    clone.scenes.forEach((sc: any, scIdx: number) => {
      if (Array.isArray(sc.actions)) {
        let speechIdx = 0;
        sc.actions.forEach((act: any) => {
          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl) {
            const padScene = String(scIdx).padStart(2, '0');
            const padSpeech = String(speechIdx).padStart(2, '0');
            const actionKey = `${scIdx}_${speechIdx}`;

            // Check if user uploaded a custom override for this speech
            if (customAudioMap && customAudioMap.has(actionKey)) {
              act.audioUrl = customAudioMap.get(actionKey);
            } else if (source === 'tts') {
              act.audioUrl = `${baseTts}/scene_${padScene}_speech_${padSpeech}.mp3`;
            } else {
              // Original ZIP audio
              const origFile = act.audioRef || act.audioId || `scene_${padScene}_speech_${padSpeech}`;
              const cleanName = origFile.endsWith('.mp3') ? origFile : `${origFile}.mp3`;
              act.audioUrl = `/api/classroom-zip/media?zip=${encodeURIComponent(defaultZip)}&file=audio/${encodeURIComponent(cleanName)}`;
            }
            speechIdx++;
          }
        });
      }
    });
  }

  return clone;
}

export function ClassroomPlayerPage() {
  const [rawData, setRawData] = useState<ClassroomData | null>(null);
  const [data, setData] = useState<ClassroomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('جاري تحميل الغرفة الصفية الذكية...');
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaBaseUrl, setMediaBaseUrl] = useState<string | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);

  // Playback & Sidebar State (Mutually Exclusive Sidebars)
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [voiceSource, setVoiceSource] = useState<'tts' | 'original' | 'custom'>('tts');
  const [showScriptPanel, setShowScriptPanel] = useState(true);
  const [showScenesSidebar, setShowScenesSidebar] = useState(false);
  const [showVoiceStudio, setShowVoiceStudio] = useState(false);
  const [scriptSearch, setScriptSearch] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  // Custom Voice Studio State
  const [customAudioMap, setCustomAudioMap] = useState<Map<string, string>>(new Map());
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState('ar-sa-naif');
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [selectedSceneForUpload, setSelectedSceneForUpload] = useState(0);
  const [selectedSpeechForUpload, setSelectedSpeechForUpload] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [voiceUploadSuccess, setVoiceUploadSuccess] = useState<string | null>(null);

  // Query params
  const [subjectCode, setSubjectCode] = useState('adb10p1');
  const [unitCode, setUnitCode] = useState('u1');
  const [lessonCode, setLessonCode] = useState('l1');
  const [classroomId, setClassroomId] = useState('1v_nRmh_wh');
  const [currentZipUrl, setCurrentZipUrl] = useState<string | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef<ClassroomData | null>(null);
  dataRef.current = data;

  const handleZipFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setLoadingMsg(`جاري استخراج حزمة الدرس: ${file.name}...`);
    try {
      const d = await loadUniversalFromZip(file);
      setRawData(d);
      const withVoice = applyVoiceSource(d, voiceSource, subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap);
      setData(withVoice);
      setActiveSceneIndex(0);
      setActiveActionIndex(0);
    } catch (err: any) {
      console.error('Local ZIP load error:', err);
      setError(err?.message || 'فشل استخراج ملف ZIP');
    } finally {
      setLoading(false);
    }
  }, [voiceSource, subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap]);

  const loadClassroom = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadingMsg('جاري جلب بيانات الدرس التفاعلي من الخادم الآمن...');

    const params = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;

    // Support path-based URLs: /classroom/:subject/:unit/:lesson/:id or /classroom/:id
    const pathMatch = pathname.match(/\/classroom(?:s)?\/([^/]+)(?:\/([^/]+)\/([^/]+)\/([^/]+))?/i);
    let pathSubject = '';
    let pathUnit = '';
    let pathLesson = '';
    let pathClassId = '';

    if (pathMatch) {
      if (pathMatch[4]) {
        pathSubject = pathMatch[1];
        pathUnit = pathMatch[2];
        pathLesson = pathMatch[3];
        pathClassId = pathMatch[4];
      } else if (pathMatch[1] && pathMatch[1] !== 'index.html') {
        pathClassId = pathMatch[1];
      }
    }

    const subject = params.get('subject') || pathSubject || 'adb10p1';
    const unit = cleanUnitCode(params.get('unit') || pathUnit || 'u1');
    const lesson = cleanLessonCode(params.get('lesson') || pathLesson || 'l1');
    const classId = params.get('id') || params.get('classroomId') || params.get('classId') || pathClassId || '1v_nRmh_wh';
    const zipUrl = params.get('zipUrl') || params.get('zip');
    const jsonUrl = params.get('jsonUrl') || params.get('json');

    setSubjectCode(subject);
    setUnitCode(unit);
    setLessonCode(lesson);
    setClassroomId(classId);
    setCurrentZipUrl(zipUrl || undefined);

    const calculatedMediaBase = `/api/courses/classrooms/${subject}/${unit}/${lesson}/${classId}/`;
    setMediaBaseUrl(calculatedMediaBase);

    try {
      // 1. If explicit ZIP URL provided (Progressive Streaming)
      if (zipUrl) {
        setLoadingMsg('جاري تهيئة البث المباشر لحزمة الدرس (ZIP Streaming)...');
        const d = await loadUniversalFromZip(zipUrl);
        setRawData(d);
        const withVoice = applyVoiceSource(d, voiceSource, subject, unit, lesson, classId, zipUrl, customAudioMap);
        setData(withVoice);
        setActiveSceneIndex(0);
        setActiveActionIndex(0);
        setLoading(false);
        return;
      }

      // 2. If explicit JSON URL provided
      if (jsonUrl) {
        setLoadingMsg('جاري تحميل ملف JSON...');
        const res = await fetch(jsonUrl);
        if (!res.ok) throw new Error(`فشل تحميل JSON: ${res.status}`);
        const text = await res.text();
        const d = await loadUniversalFromJson(text);
        setRawData(d);
        const withVoice = applyVoiceSource(d, voiceSource, subject, unit, lesson, classId, zipUrl || undefined, customAudioMap);
        setData(withVoice);
        setActiveSceneIndex(0);
        setActiveActionIndex(0);
        setLoading(false);
        return;
      }

      // 3. Load via Pages Function API resolver: /api/classroom-data
      if (classId || subject) {
        const query = new URLSearchParams({
          ...(subject ? { subject } : {}),
          ...(unit ? { unit } : {}),
          ...(lesson ? { lesson } : {}),
          ...(classId ? { id: classId } : {}),
        });

        const apiRes = await fetch(`/api/classroom-data?${query.toString()}`);
        if (apiRes.ok) {
          const resJson = (await apiRes.json()) as any;
          if (resJson?.data) {
            const raw = resJson.data;
            const parsed = raw.stage && Array.isArray(raw.scenes) ? (raw as ClassroomData) : await loadUniversalFromJson(JSON.stringify(raw));
            setRawData(parsed);
            const withVoice = applyVoiceSource(parsed, voiceSource, subject, unit, lesson, classId, zipUrl || undefined, customAudioMap);
            setData(withVoice);
            setActiveSceneIndex(0);
            setActiveActionIndex(0);
            setLoading(false);
            return;
          }
        }

        // 4. Direct private proxy candidates fallback
        if (subject && classId) {
          const directProxyUrl = `${PRIVATE_COURSES_PROXY}/classrooms/${subject}/${unit}/${lesson}/${classId}/classdata.json`;
          const directRes = await fetch(directProxyUrl);
          if (directRes.ok) {
            const text = await directRes.text();
            const d = await loadUniversalFromJson(text);
            setRawData(d);
            const withVoice = applyVoiceSource(d, voiceSource, subject, unit, lesson, classId, zipUrl || undefined, customAudioMap);
            setData(withVoice);
            setActiveSceneIndex(0);
            setActiveActionIndex(0);
            setLoading(false);
            return;
          }
        }

        // 5. Fallback via classId loader
        if (classId) {
          const d = await loadUniversalFromClassId(classId);
          setRawData(d);
          const withVoice = applyVoiceSource(d, voiceSource, subject, unit, lesson, classId, zipUrl || undefined, customAudioMap);
          setData(withVoice);
          setActiveSceneIndex(0);
          setActiveActionIndex(0);
          setLoading(false);
          return;
        }
      }

      throw new Error('لم يتم العثور على معلمات صالحة للغرفة الصفية (subject / classId).');
    } catch (err: any) {
      console.error('Classroom loading error:', err);
      setError(err?.message || 'حدث خطأ أثناء تحميل الغرفة الصفية');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [voiceSource, customAudioMap]);

  useEffect(() => {
    loadClassroom();
    return () => {
      if (dataRef.current) revokeUniversalUrls(dataRef.current);
    };
  }, [loadClassroom]);

  // Handle voice source switch
  const switchVoiceSource = (newSource: 'tts' | 'original' | 'custom') => {
    if (newSource === voiceSource) return;
    setVoiceSource(newSource);
    if (rawData) {
      const updated = applyVoiceSource(rawData, newSource, subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap);
      setData(updated);
    }
  };

  // Toggle Scenes Sidebar (and close script panel when open)
  const toggleScenesSidebar = () => {
    if (!showScenesSidebar) {
      setShowScenesSidebar(true);
      setShowScriptPanel(false);
    } else {
      setShowScenesSidebar(false);
    }
  };

  // Toggle Script Sidebar (and close scenes sidebar when open)
  const toggleScriptSidebar = () => {
    if (!showScriptPanel) {
      setShowScriptPanel(true);
      setShowScenesSidebar(false);
    } else {
      setShowScriptPanel(false);
    }
  };

  // Upload custom voice audio via Worker POST API
  const handleCustomAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVoice(true);
    setVoiceUploadSuccess(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const payload = {
          action: 'upload_audio',
          subject: subjectCode,
          unit: unitCode,
          lesson: lessonCode,
          classroomId,
          sceneIndex: selectedSceneForUpload,
          speechIndex: selectedSpeechForUpload,
          audioBase64: base64,
          voiceProfileId: selectedVoiceProfile,
          speed: speechSpeed,
          pitch: speechPitch,
        };

        const res = await fetch('/api/custom-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const resData = await res.json();
          const actionKey = `${selectedSceneForUpload}_${selectedSpeechForUpload}`;
          const newMap = new Map(customAudioMap);
          newMap.set(actionKey, resData.audioUrl || base64);
          setCustomAudioMap(newMap);

          if (rawData) {
            const updated = applyVoiceSource(rawData, 'custom', subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, newMap);
            setData(updated);
            setVoiceSource('custom');
          }

          setVoiceUploadSuccess('تم رفع الصوت المخصص وربطه بالمشهد بنجاح!');
          setTimeout(() => setVoiceUploadSuccess(null), 4000);
        } else {
          throw new Error(`Worker returned HTTP ${res.status}`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Custom voice upload failed:', err);
      alert('تعذر حفظ الصوت المخصص: ' + (err?.message || 'خطأ في الاتصال'));
    } finally {
      setIsUploadingVoice(false);
    }
  };

  // Apply Voice Profile Customizations via Worker POST API
  const handleApplyVoiceProfile = async () => {
    setIsUploadingVoice(true);
    try {
      const res = await fetch('/api/custom-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'customize_voice',
          subject: subjectCode,
          unit: unitCode,
          lesson: lessonCode,
          classroomId,
          voiceProfileId: selectedVoiceProfile,
          speed: speechSpeed,
          pitch: speechPitch,
        }),
      });

      if (res.ok) {
        setVoiceUploadSuccess('تم تطبيق ملف الصوت المخصص على الدرس بنجاح!');
        setTimeout(() => {
          setVoiceUploadSuccess(null);
          setShowVoiceStudio(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to apply voice profile:', err);
    } finally {
      setIsUploadingVoice(false);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const jumpToScene = (idx: number) => {
    setActiveSceneIndex(idx);
    setActiveActionIndex(0);
    setShowScenesSidebar(false);
    setShowScriptPanel(true);
  };

  const prevScene = () => {
    if (activeSceneIndex > 0) {
      setActiveSceneIndex((i) => i - 1);
      setActiveActionIndex(0);
      setShowScriptPanel(true);
      setShowScenesSidebar(false);
    }
  };

  const nextScene = () => {
    if (data?.scenes && activeSceneIndex < data.scenes.length - 1) {
      setActiveSceneIndex((i) => i + 1);
      setActiveActionIndex(0);
      setShowScriptPanel(true);
      setShowScenesSidebar(false);
    }
  };

  const handleProgress = useCallback((sceneIdx: number, actionIdx: number) => {
    setActiveSceneIndex((prev) => (prev !== sceneIdx ? sceneIdx : prev));
    setActiveActionIndex((prev) => (prev !== actionIdx ? actionIdx : prev));
  }, []);

  const copyFullScript = () => {
    if (!data?.scenes) return;
    const lines: string[] = [];
    lines.push(`=== ${data.stage?.name || 'سيناريو الدرس'} ===\n`);
    data.scenes.forEach((s, sIdx) => {
      lines.push(`\n--- [مشهد ${sIdx + 1}: ${s.title || 'بدون عنوان'}] ---`);
      (s.actions || []).forEach((a: any) => {
        if (a.type === 'speech' || a.type === 'speak' || a.text) {
          lines.push(`- ${a.text || a.speech || ''}`);
        }
      });
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  // Drag & drop handlers for local ZIP preview
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.zip') || file.name.endsWith('.maic.zip')) {
        handleZipFile(file);
      }
    }
  };

  const scenes = data?.scenes || [];
  const totalScenes = scenes.length;
  const currentScene = scenes[activeSceneIndex];
  const sceneActions = currentScene?.actions || [];
  
  // Map speeches with their original action index in the scene
  const currentSceneSpeeches = sceneActions
    .map((act: any, originalIndex: number) => ({ ...act, originalIndex }))
    .filter((a: any) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech);

  // Find currently active speech item (either exact action match or most recent speech)
  const activeSpeech = currentSceneSpeeches.reduce((prev: any, curr: any) => {
    if (curr.originalIndex <= activeActionIndex) return curr;
    return prev;
  }, currentSceneSpeeches[0]);

  // Calculate if classroom has multiple distinct voices
  const allSpeeches = scenes.flatMap((s: any) =>
    (s.actions || []).filter((a: any) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech)
  );
  const distinctVoices = new Set(allSpeeches.map((a: any) => a.voice).filter(Boolean));
  const hasMultipleVoices = (data?.stage?.agentIds && data.stage.agentIds.length > 1) || distinctVoices.size > 1 || customAudioMap.size > 0;

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden relative select-none ${
        isDragging ? 'ring-4 ring-cyan-500 ring-inset' : ''
      }`}
      dir="rtl"
    >
      {/* ── Main Workspace (Scene on Right, Mutually-Exclusive Sidebar on Left) ── */}
      <div className="flex-1 w-full h-[calc(100vh-64px)] overflow-hidden relative flex">
        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6 bg-slate-950 z-40">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin"></div>
              <Sparkles className="w-6 h-6 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="text-sm font-bold text-slate-200">{loadingMsg}</div>
            <div className="text-xs text-slate-500 font-mono">OpenMAIC Smart Player</div>
          </div>
        )}

        {/* Error Overlay */}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-slate-950 z-40">
            <div className="max-w-md p-6 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
              <h3 className="text-sm font-black text-rose-200">تعذر تحميل الغرفة الصفية</h3>
              <p className="text-xs text-rose-300/80 leading-relaxed">{error}</p>
              <button
                onClick={loadClassroom}
                className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition"
              >
                إعادة المحاولة
              </button>
            </div>
          </div>
        )}

        {/* ── Active Scene Canvas (RIGHT in RTL) ── */}
        <section className="flex-1 h-full min-w-0 bg-slate-950 relative overflow-hidden flex flex-col">
          {!loading && !error && data && (
            <div className="w-full h-full relative overflow-hidden bg-slate-950">
              <ClassroomErrorBoundary>
                <ClassroomViewer
                  key={`${data.id || data.stage?.id || 'classroom'}-${voiceSource}`}
                  data={data}
                  startScene={activeSceneIndex}
                  startAction={activeActionIndex}
                  mediaBaseUrl={mediaBaseUrl}
                  darkMode={true}
                  embed={true}
                  hidePlaybackBar={true}
                  autoPlay={isPlaying}
                  onProgress={handleProgress}
                  onComplete={() => {
                    setIsPlaying(false);
                  }}
                />
              </ClassroomErrorBoundary>
            </div>
          )}
        </section>

        {/* ── Sidebar 1: Live Synchronized Script / Transcript Panel (LEFT in RTL) ── */}
        {showScriptPanel && (
          <aside className="w-80 sm:w-96 lg:w-[420px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl backdrop-blur-md transition-all duration-300 z-20 animate-in slide-in-from-right duration-200">
            {/* Script Panel Topbar (with Voice Studio Button) */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <MessageSquareQuote className="w-4 h-4 text-emerald-400" />
                <div>
                  <h3 className="text-xs font-black text-white">السيناريو والنص الصوتي</h3>
                  <span className="text-[10px] text-slate-400">
                    المشهد {activeSceneIndex + 1} من {totalScenes}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Voice Studio Button (Positioned on Script Topbar as requested) */}
                <button
                  onClick={() => setShowVoiceStudio(true)}
                  className="px-2 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 text-[11px] font-black border border-purple-800/80 flex items-center gap-1 shadow-sm transition"
                  title="استوديو تخصيص الأصوات ورفع صوت المعلم"
                >
                  <Sliders className="w-3 h-3 text-purple-400" />
                  <span>استوديو الصوت</span>
                </button>

                <button
                  onClick={copyFullScript}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold border border-slate-700 flex items-center gap-1 transition"
                  title="نسخ النص الكامل"
                >
                  {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedScript ? 'تم' : 'نسخ'}</span>
                </button>

                <button
                  onClick={() => setShowScriptPanel(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="إخفاء لوحة السيناريو"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Live Active Scene Info Card */}
            <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-black text-cyan-400 truncate max-w-[220px]">
                {currentScene?.title || `المشهد ${activeSceneIndex + 1}`}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {currentSceneSpeeches.length} حوارات
              </span>
            </div>

            {/* Script Search Filter */}
            <div className="p-2.5 border-b border-slate-800/60 bg-slate-950/30">
              <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={scriptSearch}
                  onChange={(e) => setScriptSearch(e.target.value)}
                  placeholder="بحث في الحوارات والشروحات..."
                  className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
                />
                {scriptSearch && (
                  <button onClick={() => setScriptSearch('')} className="text-slate-500 hover:text-white text-xs">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Speech Transcript Lines List with Real-Time Sync & Auto-Scroll */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
              {currentSceneSpeeches.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs font-bold space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
                  <p>لا توجد نصوص حوارية في هذا المشهد (شريحة بصرية تفاعلية)</p>
                </div>
              ) : (
                currentSceneSpeeches.map((act: any, idx: number) => {
                  const text = act.text || act.speech || '';
                  const isCurrentAction = activeSpeech && activeSpeech.originalIndex === act.originalIndex;

                  if (scriptSearch && !text.toLowerCase().includes(scriptSearch.toLowerCase())) {
                    return null;
                  }

                  return (
                    <div
                      key={act.id || idx}
                      ref={(el) => {
                        if (isCurrentAction && el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      }}
                      onClick={() => {
                        setActiveActionIndex(act.originalIndex);
                        setIsPlaying(true);
                      }}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col gap-2 ${
                        isCurrentAction
                          ? 'bg-cyan-500/20 border-cyan-500 shadow-lg shadow-cyan-500/10 ring-2 ring-cyan-500/40'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black ${
                            isCurrentAction ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {idx + 1}
                          </div>
                          <span className="text-[11px] font-bold text-slate-300">
                            {act.voice || 'المعلم الذكي'}
                          </span>
                        </div>

                        {isCurrentAction && isPlaying && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300">
                            <div className="flex items-end gap-0.5 h-3">
                              <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
                              <span className="w-1 h-1.5 bg-cyan-400 rounded-full animate-pulse delay-75"></span>
                              <span className="w-1 h-3.5 bg-cyan-400 rounded-full animate-pulse delay-150"></span>
                            </div>
                            <span className="text-[10px] font-bold">جاري التحدث</span>
                          </div>
                        )}
                      </div>

                      <p className={`text-xs leading-relaxed font-medium transition-colors ${
                        isCurrentAction ? 'text-cyan-100 font-bold' : 'text-slate-300'
                      }`}>
                        {text}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* ── Sidebar 2: Scenes List Drawer (Rendered only as sidebar, closes script when open) ── */}
        {showScenesSidebar && (
          <aside className="w-80 sm:w-96 lg:w-[420px] h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl backdrop-blur-md transition-all duration-300 z-20 animate-in slide-in-from-right duration-200">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-cyan-400" />
                <div>
                  <h3 className="text-xs font-black text-white">مشاهد الدرس الكاملة ({totalScenes})</h3>
                  <span className="text-[10px] text-slate-400">انقر على أي مشهد للانتقال الفوري</span>
                </div>
              </div>

              <button
                onClick={() => setShowScenesSidebar(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="إغلاق قائمة المشاهد"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
              {scenes.map((scene, idx) => {
                const isActive = activeSceneIndex === idx;
                const speeches = (scene.actions || []).filter(
                  (a: any) => a.type === 'speech' || a.type === 'speak' || a.text
                );
                return (
                  <div
                    key={scene.id || idx}
                    onClick={() => jumpToScene(idx)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-500 text-white shadow-xl ring-1 ring-cyan-500/40'
                        : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 font-mono ${
                        isActive ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-black truncate">{scene.title || `المشهد ${idx + 1}`}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono font-bold">
                          {scene.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {speeches.length > 0
                          ? (speeches[0] as any).text || (speeches[0] as any).speech || 'محادثة وشرح تفاعلي'
                          : 'عرض بصري وشريحة تفاعلية'}
                      </p>
                      <div className="text-[10px] text-cyan-400 font-bold mt-2 flex items-center gap-2">
                        <span>{speeches.length} حوارات صوتية</span>
                        <span>•</span>
                        <span>{(scene.actions || []).length} إجراءات</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* ── Bottom Playback & Voice Controls Toolbar ── */}
      <footer className="h-16 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-3 z-30 shrink-0">
        {/* Right Section: Scene Selector & Prev/Next (RTL Start) */}
        <div className="flex items-center gap-2">
          {/* Scenes Sidebar Toggle Button (Closes script when clicked) */}
          <button
            onClick={toggleScenesSidebar}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-2 transition ${
              showScenesSidebar
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="عرض قائمة المشاهد كشريط جانبي"
          >
            <ListOrdered className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">المشاهد</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-cyan-300 font-black">
              {activeSceneIndex + 1} / {totalScenes}
            </span>
          </button>

          {/* Quick Scene Flip Prev / Next */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              onClick={prevScene}
              disabled={activeSceneIndex <= 0}
              className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition"
              title="المشهد السابق"
            >
              <SkipForward className="w-4 h-4" />
            </button>
            <button
              onClick={nextScene}
              disabled={activeSceneIndex >= totalScenes - 1}
              className="p-2 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 transition"
              title="المشهد التالي"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Section: Main Play/Pause & Live Scene Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isPlaying
                ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-cyan-500/20'
                : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
            }`}
            title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل العرض'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-0.5" />}
          </button>

          <span className="hidden md:inline text-xs font-bold text-slate-300 max-w-xs truncate">
            {currentScene?.title || `المشهد ${activeSceneIndex + 1}`}
          </span>
        </div>

        {/* Left Section: Tools & Conditional Voice Switcher (RTL End) */}
        <div className="flex items-center gap-2">
          {/* Conditional Voice Switcher: Render ONLY if multiple voices exist */}
          {hasMultipleVoices && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => switchVoiceSource('tts')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                  voiceSource === 'tts'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="أصوات الذكاء الاصطناعي (TTS R2 Voiceovers)"
              >
                <Mic className="w-3.5 h-3.5 text-emerald-300" />
                <span className="hidden sm:inline">صوت AI (TTS)</span>
              </button>

              <button
                onClick={() => switchVoiceSource('original')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                  voiceSource === 'original'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="الصوت الأصلي المسجل (من حزمة ZIP الأصلية)"
              >
                <Music className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">الصوت الأصلي (ZIP)</span>
              </button>
            </div>
          )}

          {/* Toggle Script Sidebar (Closes scenes sidebar when clicked) */}
          <button
            onClick={toggleScriptSidebar}
            className={`p-2 rounded-xl border transition ${
              showScriptPanel
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-800 text-slate-400 hover:text-white border-slate-700'
            }`}
            title={showScriptPanel ? 'إخفاء لوحة السيناريو' : 'إظهار لوحة السيناريو'}
          >
            {showScriptPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          {/* Upload ZIP */}
          <label
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
            title="رفع حزمة ZIP محلياً"
          >
            <Upload className="w-4 h-4" />
            <input
              type="file"
              accept=".zip,.maic.zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleZipFile(e.target.files[0]);
              }}
            />
          </label>

          {/* Reload */}
          <button
            onClick={loadClassroom}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="إعادة التحميل"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="ملء الشاشة"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </footer>

      {/* ── Voice Studio & Custom TTS Upload Modal ── */}
      {showVoiceStudio && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">استوديو تخصيص وتحديث أصوات الدرس (TTS Studio)</h3>
                  <p className="text-[11px] text-slate-400">تخصيص المعلم الذكي أو رفع تسجيلات صوتية مخصصة</p>
                </div>
              </div>
              <button
                onClick={() => setShowVoiceStudio(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              {/* Status Alert */}
              {voiceUploadSuccess && (
                <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300 font-bold animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{voiceUploadSuccess}</span>
                </div>
              )}

              {/* Section 1: Choose Voice Preset */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-200 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-purple-400" />
                  <span>1. اختر شخصية ونبرة المعلم الذكي:</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'ar-sa-naif', name: 'أستاذ نايف (سعودي فصيح - نبرة واثقة)', tag: 'موصى به' },
                    { id: 'ar-eg-salma', name: 'أستاذة سلمى (مصرية هادئة - نبرة تعليمية)', tag: 'أنثوي' },
                    { id: 'ar-jo-tariq', name: 'أستاذ طارق (شامي واضح - نبرة علمية)', tag: 'ذكوري' },
                    { id: 'ar-ae-fatima', name: 'أستاذة فاطمة (خليجية دافئة)', tag: 'أنثوي' },
                  ].map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedVoiceProfile(p.id)}
                      className={`p-3 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                        selectedVoiceProfile === p.id
                          ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Mic className={`w-4 h-4 ${selectedVoiceProfile === p.id ? 'text-purple-400' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold">{p.name}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-purple-300 font-mono">
                        {p.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Speech Speed & Pitch */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-200 flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-cyan-400" />
                  <span>2. سرعة ودرجة نطق الصوت:</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-300">
                      <span>سرعة الكلام:</span>
                      <span className="font-mono text-cyan-400">{speechSpeed}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.75"
                      max="1.5"
                      step="0.05"
                      value={speechSpeed}
                      onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-300">
                      <span>درجة الصوت (Pitch):</span>
                      <span className="font-mono text-purple-400">{speechPitch}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.8"
                      max="1.2"
                      step="0.05"
                      value={speechPitch}
                      onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                      className="w-full accent-purple-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Upload Custom Audio for Specific Dialogue */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-200 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>3. استبدال ورفع مقطع صوتي مخصص (Per-Scene Upload):</span>
                </label>

                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 mb-1 block">حدد المشهد:</span>
                      <select
                        value={selectedSceneForUpload}
                        onChange={(e) => setSelectedSceneForUpload(parseInt(e.target.value, 10))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold outline-none"
                      >
                        {scenes.map((s, idx) => (
                          <option key={idx} value={idx}>
                            مشهد {idx + 1}: {s.title || `الشريحة ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-400 mb-1 block">حدد الحوار المستهدف:</span>
                      <select
                        value={selectedSpeechForUpload}
                        onChange={(e) => setSelectedSpeechForUpload(parseInt(e.target.value, 10))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-bold outline-none"
                      >
                        {((scenes[selectedSceneForUpload]?.actions || []).filter((a: any) => a.type === 'speech' || a.text)).map((_, idx) => (
                          <option key={idx} value={idx}>
                            الحوار رقم {idx + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="border-2 border-dashed border-slate-700 hover:border-purple-500 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition bg-slate-900/40">
                    <Upload className="w-6 h-6 text-purple-400" />
                    <span className="text-xs font-bold text-slate-200">
                      {isUploadingVoice ? 'جاري رفع ومعالجة الصوت عبر الـ Worker...' : 'انقر لرفع ملف صوتي (.mp3 أو .wav)'}
                    </span>
                    <span className="text-[10px] text-slate-500">يتم حفظ الملف وربطه فورياً بهذا المشهد عبر Worker POST API</span>
                    <input
                      type="file"
                      accept="audio/mp3,audio/wav,audio/mpeg"
                      className="hidden"
                      onChange={handleCustomAudioUpload}
                      disabled={isUploadingVoice}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                يتم إرسال التخصيص إلى خادم Worker `/api/custom-voice`
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVoiceStudio(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleApplyVoiceProfile}
                  disabled={isUploadingVoice}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-600/30 transition flex items-center gap-2"
                >
                  {isUploadingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>تطبيق وتحديث الصوت</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
