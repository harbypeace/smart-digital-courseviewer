import React, { useState, useEffect, useRef, useCallback, Component, type ErrorInfo, type ReactNode } from 'react';
import { ClassroomViewer } from '@openmaic/viewer';
import type { ClassroomData } from '@openmaic/viewer';
import {
  loadUniversalFromZip,
  loadUniversalFromJson,
  loadUniversalFromClassId,
  revokeUniversalUrls,
} from '../lib/universal-loader';
import { appendAuthToken, cleanUnitCode, cleanLessonCode, PRIVATE_COURSES_PROXY } from '../lib/utils';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Maximize2,
  Minimize2,
  Sparkles,
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
  Bot,
  Zap,
  Cpu,
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
/**
 * Deduplicates speech actions where the first leg was repeated during TTS generation
 * or adjacent dialogue lines have repeated duplicate texts in the JSON.
 */
function deduplicateSpeechActions(scenes: any[]): void {
  if (!Array.isArray(scenes) || scenes.length === 0) return;

  const norm = (str: any) =>
    typeof str === 'string'
      ? str.trim().replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').toLowerCase()
      : '';

  // Identify first scene's opening speech if repeated across scenes
  const scene0Speeches = (scenes[0]?.actions || []).filter(
    (a: any) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech
  );
  const scene0OpeningLeg = scene0Speeches.length > 0 ? norm(scene0Speeches[0].text || scene0Speeches[0].speech) : '';

  scenes.forEach((sc: any, scIdx: number) => {
    if (!Array.isArray(sc.actions)) return;

    // Track speech actions and their indices in sc.actions
    const speechIndices: number[] = [];
    sc.actions.forEach((act: any, actIdx: number) => {
      if (act.type === 'speech' || act.type === 'speak' || act.text || act.speech || act.audio || act.audioUrl) {
        speechIndices.push(actIdx);
      }
    });

    if (speechIndices.length < 2) return;

    const toRemove = new Set<number>();

    const firstAct = sc.actions[speechIndices[0]];
    const secondAct = sc.actions[speechIndices[1]];
    const t0 = norm(firstAct?.text || firstAct?.speech);
    const t1 = norm(secondAct?.text || secondAct?.speech);

    // 1. If first and second speech actions in the scene have identical text, remove the duplicate
    if (t0 && t1 && t0 === t1) {
      toRemove.add(speechIndices[1]);
    }

    // 2. If in subsequent scenes (scIdx > 0), the first speech repeats scene 0's opening leg
    if (scIdx > 0 && scene0OpeningLeg && t0 && t0 === scene0OpeningLeg) {
      toRemove.add(speechIndices[0]);
    }

    // 3. Check for any other adjacent duplicate speech actions in the scene
    for (let i = 0; i < speechIndices.length - 1; i++) {
      if (toRemove.has(speechIndices[i])) continue;
      const actA = sc.actions[speechIndices[i]];
      const actB = sc.actions[speechIndices[i + 1]];
      const textA = norm(actA?.text || actA?.speech);
      const textB = norm(actB?.text || actB?.speech);
      if (textA && textB && textA === textB) {
        toRemove.add(speechIndices[i + 1]);
      }
    }

    if (toRemove.size > 0) {
      sc.actions = sc.actions.filter((_: any, idx: number) => !toRemove.has(idx));
    }
  });
}

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
  const baseTts = appendAuthToken(`/api/courses/classrooms/${subject}/${u}/${l}/${cId}/tts`);
  const defaultZip = appendAuthToken(zipUrl || `/api/courses/classrooms/${subject}/${u}/${l}/${cId}/classroom.zip`);

  if (Array.isArray(clone.scenes)) {
    deduplicateSpeechActions(clone.scenes);
    clone.scenes.forEach((sc: any, scIdx: number) => {
      // 1. Normalize canvas images & videos
      const canvasElements = sc?.content?.canvas?.elements;
      if (Array.isArray(canvasElements)) {
        canvasElements.forEach((el: any) => {
          if ((el.type === 'image' || el.type === 'video') && el.src) {
            const rawSrc = String(el.src).trim();
            if (!rawSrc.startsWith('data:') && !rawSrc.startsWith('blob:')) {
              const filename = rawSrc.split('/').pop()?.split('?')[0];
              if (filename) {
                // Check if imported into local public media or route via zip streamer
                el.src = `/classroom-media/${cId}/media/${filename}`;
              }
            }
          }
        });
      }

      // 2. Normalize actions audio and visuals
      if (Array.isArray(sc.actions)) {
        let speechIdx = 0;
        sc.actions.forEach((act: any) => {
          if (act.visualUrl) {
            const rawVis = String(act.visualUrl).trim();
            if (!rawVis.startsWith('data:') && !rawVis.startsWith('blob:')) {
              const filename = rawVis.split('/').pop()?.split('?')[0];
              if (filename) {
                act.visualUrl = `/classroom-media/${cId}/media/${filename}`;
              }
            }
          }

          if (act.type === 'speech' || act.type === 'speak' || act.audio || act.audioUrl) {
            const padScene = String(scIdx).padStart(2, '0');
            const padSpeech = String(speechIdx).padStart(2, '0');
            const actionKey = `${scIdx}_${speechIdx}`;

            // Check if user uploaded or generated a custom override for this speech
            if (customAudioMap && customAudioMap.has(actionKey)) {
              act.audioUrl = customAudioMap.get(actionKey);
            } else if (source === 'tts') {
              act.audioUrl = `${baseTts}/scene_${padScene}_speech_${padSpeech}.mp3`;
            } else {
              // Original ZIP audio
              const origFile = act.audioRef || act.audioId || `scene_${padScene}_speech_${padSpeech}`;
              const cleanName = origFile.endsWith('.mp3') ? origFile : `${origFile}.mp3`;
              act.audioUrl = appendAuthToken(`/api/classroom-zip/media?zip=${encodeURIComponent(defaultZip)}&file=audio/${encodeURIComponent(cleanName)}`);
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
  const [navTarget, setNavTarget] = useState<{ scene: number; action: number }>({ scene: 0, action: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceSource, setVoiceSource] = useState<'tts' | 'original' | 'custom'>('tts');
  const [hasTts, setHasTts] = useState<boolean>(true);
  const [showScriptPanel, setShowScriptPanel] = useState(true);
  const [showScenesSidebar, setShowScenesSidebar] = useState(false);
  const [showVoiceStudio, setShowVoiceStudio] = useState(false);
  const [scriptSearch, setScriptSearch] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  // Mobile responsiveness & 3-second script auto-hide
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const scriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetScriptAutoHide = useCallback(() => {
    if (scriptTimerRef.current) {
      clearTimeout(scriptTimerRef.current);
      scriptTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      scriptTimerRef.current = setTimeout(() => {
        setShowScriptPanel(false);
      }, 3000);
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (showScriptPanel && isMobile) {
      resetScriptAutoHide();
    } else if (scriptTimerRef.current) {
      clearTimeout(scriptTimerRef.current);
      scriptTimerRef.current = null;
    }
    return () => {
      if (scriptTimerRef.current) {
        clearTimeout(scriptTimerRef.current);
      }
    };
  }, [showScriptPanel, isMobile, resetScriptAutoHide]);

  // Mobile landscape YouTube-style actions bar autohide
  const [isMobileLandscape, setIsMobileLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  });
  const [landscapeControlsVisible, setLandscapeControlsVisible] = useState(true);
  const landscapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetLandscapeAutoHide = useCallback(() => {
    if (landscapeTimerRef.current) {
      clearTimeout(landscapeTimerRef.current);
      landscapeTimerRef.current = null;
    }
    if (isMobileLandscape) {
      setLandscapeControlsVisible(true);
      landscapeTimerRef.current = setTimeout(() => {
        setLandscapeControlsVisible(false);
      }, 3000);
    }
  }, [isMobileLandscape]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 520px)');
    const updateLandscape = () => {
      const match = mq.matches;
      setIsMobileLandscape(match);
      if (match) {
        setLandscapeControlsVisible(true);
        resetLandscapeAutoHide();
      } else {
        setLandscapeControlsVisible(true);
      }
    };
    updateLandscape();
    mq.addEventListener('change', updateLandscape);
    window.addEventListener('resize', updateLandscape);
    return () => {
      mq.removeEventListener('change', updateLandscape);
      window.removeEventListener('resize', updateLandscape);
      if (landscapeTimerRef.current) clearTimeout(landscapeTimerRef.current);
    };
  }, [resetLandscapeAutoHide]);

  const handleRenderTap = useCallback(() => {
    if (!isMobileLandscape) return;
    setLandscapeControlsVisible((prev) => {
      const nextVal = !prev;
      if (nextVal) {
        resetLandscapeAutoHide();
      } else if (landscapeTimerRef.current) {
        clearTimeout(landscapeTimerRef.current);
        landscapeTimerRef.current = null;
      }
      return nextVal;
    });
  }, [isMobileLandscape, resetLandscapeAutoHide]);

  // Custom Voice Studio State
  const [customAudioMap, setCustomAudioMap] = useState<Map<string, string>>(new Map());
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState('ar-sa-naif');
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [selectedSceneForUpload, setSelectedSceneForUpload] = useState(0);
  const [selectedSpeechForUpload, setSelectedSpeechForUpload] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [voiceUploadSuccess, setVoiceUploadSuccess] = useState<string | null>(null);

  // Large Model TTS Generation State (ElevenLabs / Gemini Light Format)
  const [ttsProvider, setTtsProvider] = useState<'elevenlabs' | 'gemini'>('elevenlabs');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('ELEVENLABS_API_KEY') || '' : '';
  });
  const [geminiApiKey, setGeminiApiKey] = useState(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('GEMINI_API_KEY') || '' : '';
  });
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsProgressMsg, setTtsProgressMsg] = useState('');

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
      const allSpeeches = (d.scenes || []).flatMap((s: any) =>
        (s.actions || []).filter((a: any) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech)
      );
      const ttsAvailable = allSpeeches.length > 0;
      setHasTts(ttsAvailable);
      const chosenVoice = ttsAvailable ? 'tts' : 'original';
      setVoiceSource(chosenVoice);
      const withVoice = applyVoiceSource(d, chosenVoice, subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap);
      setData(withVoice);
      setActiveSceneIndex(0);
      setActiveActionIndex(0);
    } catch (err: any) {
      console.error('Local ZIP load error:', err);
      setError(err?.message || 'فشل استخراج ملف ZIP');
    } finally {
      setLoading(false);
    }
  }, [subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap]);

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

    const calculatedMediaBase = appendAuthToken(`/api/courses/classrooms/${subject}/${unit}/${lesson}/${classId}/`);
    setMediaBaseUrl(calculatedMediaBase);

    const setupClassroomData = async (
      raw: ClassroomData,
      sub: string,
      u: string,
      l: string,
      cId: string,
      zUrl?: string
    ) => {
      setRawData(raw);

      // Render immediately with original audio without waiting for slow network probes
      const initialVoice = 'original';
      setHasTts(false);
      setVoiceSource(initialVoice);

      const withVoice = applyVoiceSource(raw, initialVoice, sub, u, l, cId, zUrl, customAudioMap);
      setData(withVoice);
      setActiveSceneIndex(0);
      setActiveActionIndex(0);
      setNavTarget({ scene: 0, action: 0 });
      setLoading(false);

      // Non-blocking background probe for optional pre-generated TTS
      const allSpeeches = (raw.scenes || []).flatMap((s: any) =>
        (s.actions || []).filter((a: any) => a.type === 'speech' || a.type === 'speak' || a.text || a.speech)
      );

      if (allSpeeches.length > 0) {
        const testTtsUrl = `/api/courses/classrooms/${sub}/${u}/${l}/${cId}/tts/scene_00_speech_00.mp3`;
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 1000);
        fetch(testTtsUrl, { method: 'HEAD', signal: ctrl.signal })
          .then((probe) => {
            clearTimeout(tId);
            if (probe.ok) {
              setHasTts(true);
              setVoiceSource('tts');
              setData(applyVoiceSource(raw, 'tts', sub, u, l, cId, zUrl, customAudioMap));
            }
          })
          .catch(() => {});
      }
    };

    try {
      // 1. If explicit ZIP URL provided (Progressive Streaming)
      if (zipUrl) {
        setLoadingMsg('جاري تهيئة البث المباشر لحزمة الدرس (ZIP Streaming)...');
        const d = await loadUniversalFromZip(zipUrl);
        await setupClassroomData(d, subject, unit, lesson, classId, zipUrl);
        return;
      }

      // 2. If explicit JSON URL provided
      if (jsonUrl) {
        setLoadingMsg('جاري تحميل ملف JSON...');
        const res = await fetch(appendAuthToken(jsonUrl));
        if (!res.ok) throw new Error(`فشل تحميل JSON: ${res.status}`);
        const text = await res.text();
        const d = await loadUniversalFromJson(text);
        await setupClassroomData(d, subject, unit, lesson, classId, zipUrl || undefined);
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

        const apiRes = await fetch(appendAuthToken(`/api/classroom-data?${query.toString()}`));
        if (apiRes.ok) {
          const resJson = (await apiRes.json()) as any;
          if (resJson?.data) {
            const raw = resJson.data;
            const parsed = raw.stage && Array.isArray(raw.scenes) ? (raw as ClassroomData) : await loadUniversalFromJson(JSON.stringify(raw));
            await setupClassroomData(parsed, subject, unit, lesson, classId, zipUrl || undefined);
            return;
          }
        }

        // 4. Direct private proxy candidates fallback
        if (subject && classId) {
          const directProxyUrl = `${PRIVATE_COURSES_PROXY}/classrooms/${subject}/${unit}/${lesson}/${classId}/classdata.json`;
          const directRes = await fetch(appendAuthToken(directProxyUrl));
          if (directRes.ok) {
            const text = await directRes.text();
            const d = await loadUniversalFromJson(text);
            await setupClassroomData(d, subject, unit, lesson, classId, zipUrl || undefined);
            return;
          }
        }

        // 5. Fallback via classId loader
        if (classId) {
          const d = await loadUniversalFromClassId(classId);
          await setupClassroomData(d, subject, unit, lesson, classId, zipUrl || undefined);
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
  }, [customAudioMap]);

  useEffect(() => {
    loadClassroom();
    return () => {
      if (dataRef.current) revokeUniversalUrls(dataRef.current);
    };
  }, [loadClassroom]);

  // Handle voice source switch
  const switchVoiceSource = (newSource: 'tts' | 'original' | 'custom') => {
    if (!hasTts && newSource === 'tts') return;
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
      if (isMobile) {
        resetScriptAutoHide();
      }
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

        const res = await fetch(appendAuthToken('/api/custom-voice'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const resData = await res.json();
          const actionKey = `${selectedSceneForUpload}_${selectedSpeechForUpload}`;
          const newMap = new Map(customAudioMap);
          newMap.set(actionKey, resData.audioUrl ? appendAuthToken(resData.audioUrl) : base64);
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
      const res = await fetch(appendAuthToken('/api/custom-voice'), {
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

  // Generate High-Quality Lightweight TTS via ElevenLabs or Gemini POST API
  const handleGenerateLargeModelTts = async () => {
    const key = ttsProvider === 'elevenlabs' ? elevenLabsApiKey.trim() : geminiApiKey.trim();
    if (!key) {
      alert(`يرجى إدخال مفتاح API الخاص بـ ${ttsProvider === 'elevenlabs' ? 'ElevenLabs' : 'Gemini'} للمتابعة.`);
      return;
    }

    if (ttsProvider === 'elevenlabs') {
      localStorage.setItem('ELEVENLABS_API_KEY', key);
    } else {
      localStorage.setItem('GEMINI_API_KEY', key);
    }

    if (!rawData || !Array.isArray(rawData.scenes)) {
      alert('لم يتم تحميل بيانات الدرس بعد.');
      return;
    }

    // Collect speeches after deduplication
    const scenesToProcess = JSON.parse(JSON.stringify(rawData.scenes));
    deduplicateSpeechActions(scenesToProcess);

    const speechItems: { sceneIdx: number; speechIdx: number; text: string }[] = [];
    scenesToProcess.forEach((sc: any, scIdx: number) => {
      let spIdx = 0;
      (sc.actions || []).forEach((act: any) => {
        if (act.type === 'speech' || act.type === 'speak' || act.text || act.speech) {
          const txt = (act.text || act.speech || '').trim();
          if (txt) {
            speechItems.push({ sceneIdx: scIdx, speechIdx: spIdx, text: txt });
          }
          spIdx++;
        }
      });
    });

    if (speechItems.length === 0) {
      alert('لا توجد نصوص حوارية في هذا الدرس لتوليد الصوت.');
      return;
    }

    setIsGeneratingTts(true);
    setTtsProgressMsg(`جاري التجهيز لتوليد ${speechItems.length} مقطع صوتي خفيف الحجم...`);

    let successCount = 0;
    try {
      for (let i = 0; i < speechItems.length; i++) {
        const item = speechItems[i];
        setTtsProgressMsg(`جاري التوليد (${i + 1}/${speechItems.length}): مشهد ${item.sceneIdx + 1} - حوار ${item.speechIdx + 1}...`);

        const res = await fetch('/api/custom-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate_tts',
            provider: ttsProvider,
            apiKey: key,
            subject: subjectCode,
            unit: unitCode,
            lesson: lessonCode,
            classroomId,
            sceneIndex: item.sceneIdx,
            speechIndex: item.speechIdx,
            text: item.text,
            replaceOriginalTts: true,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'فشل الطلب' }));
          throw new Error(errData.error || `خطأ من الخادم: HTTP ${res.status}`);
        }

        successCount++;
      }

      setHasTts(true);
      setVoiceSource('tts');
      if (rawData) {
        const updated = applyVoiceSource(rawData, 'tts', subjectCode, unitCode, lessonCode, classroomId, currentZipUrl, customAudioMap);
        setData(updated);
      }

      setVoiceUploadSuccess(`تم توليد واستبدال ${successCount} مقطع صوتي فائق الجودة وخفيف الحجم بنجاح!`);
      setTimeout(() => {
        setVoiceUploadSuccess(null);
        setShowVoiceStudio(false);
      }, 2500);
    } catch (err: any) {
      console.error('Large Model TTS Generation Error:', err);
      alert('حدث خطأ أثناء توليد الصوت: ' + (err?.message || 'خطأ غير متوقع'));
    } finally {
      setIsGeneratingTts(false);
      setTtsProgressMsg('');
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
    setNavTarget({ scene: idx, action: 0 });
    setShowScenesSidebar(false);
    setShowScriptPanel(true);
    if (isMobile) {
      resetScriptAutoHide();
    }
  };

  const prevScene = () => {
    if (activeSceneIndex > 0) {
      const target = activeSceneIndex - 1;
      setActiveSceneIndex(target);
      setActiveActionIndex(0);
      setNavTarget({ scene: target, action: 0 });
      setShowScriptPanel(true);
      setShowScenesSidebar(false);
      if (isMobile) {
        resetScriptAutoHide();
      }
    }
  };

  const nextScene = () => {
    if (data?.scenes && activeSceneIndex < data.scenes.length - 1) {
      const target = activeSceneIndex + 1;
      setActiveSceneIndex(target);
      setActiveActionIndex(0);
      setNavTarget({ scene: target, action: 0 });
      setShowScriptPanel(true);
      setShowScenesSidebar(false);
      if (isMobile) {
        resetScriptAutoHide();
      }
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
      <div className={`flex-1 w-full overflow-hidden relative flex ${
        isMobileLandscape ? 'h-screen' : 'h-[calc(100vh-64px)]'
      }`}>
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

        {/* ── Active Scene Canvas (RIGHT in RTL) - Tap to show/hide controls in landscape ── */}
        <section
          onClick={handleRenderTap}
          className="flex-1 h-full min-w-0 bg-slate-950 relative overflow-hidden flex flex-col cursor-pointer select-none"
        >
          {!loading && !error && data && (
            <div className="w-full h-full relative overflow-hidden bg-slate-950">
              <ClassroomErrorBoundary>
                <ClassroomViewer
                  key={`${data.id || data.stage?.id || 'classroom'}-${voiceSource}`}
                  data={data}
                  startScene={navTarget.scene}
                  startAction={navTarget.action}
                  mediaBaseUrl={mediaBaseUrl}
                  darkMode={true}
                  embed={true}
                  hidePlaybackBar={true}
                  autoPlay={isPlaying}
                  onProgress={handleProgress}
                  onPlayStateChange={(p) => setIsPlaying(p)}
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
          <aside
            onTouchStart={resetScriptAutoHide}
            onPointerDown={resetScriptAutoHide}
            onScroll={resetScriptAutoHide}
            className={`h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl backdrop-blur-md transition-all duration-300 z-30 animate-in slide-in-from-right duration-200 ${
              isMobile
                ? 'fixed right-0 top-0 bottom-16 w-80 max-w-[85vw] border-l border-slate-800'
                : 'relative w-80 sm:w-96 lg:w-[420px]'
            }`}
          >
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
                {/* Voice Studio Button (Positioned on Script Topbar) - Hidden when no TTS */}
                {hasTts && (
                  <button
                    onClick={() => setShowVoiceStudio(true)}
                    className="px-2 py-1 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 text-[11px] font-black border border-purple-800/80 flex items-center gap-1 shadow-sm transition"
                    title="استوديو تخصيص الأصوات ورفع صوت المعلم"
                  >
                    <Sliders className="w-3 h-3 text-purple-400" />
                    <span>استوديو الصوت</span>
                  </button>
                )}

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
                        setNavTarget({ scene: activeSceneIndex, action: act.originalIndex });
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
          <aside className={`h-full bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 shadow-2xl backdrop-blur-md transition-all duration-300 z-30 animate-in slide-in-from-right duration-200 ${
            isMobile
              ? 'fixed right-0 top-0 bottom-16 w-80 max-w-[85vw] border-l border-slate-800'
              : 'relative w-80 sm:w-96 lg:w-[420px]'
          }`}>
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
      <footer
        onPointerDown={resetLandscapeAutoHide}
        onTouchStart={resetLandscapeAutoHide}
        className={`backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-3 z-30 transition-all duration-300 select-none ${
          isMobileLandscape
            ? `fixed bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black/95 via-slate-950/90 to-transparent border-t-0 shadow-2xl ${
                landscapeControlsVisible
                  ? 'opacity-100 translate-y-0 pointer-events-auto'
                  : 'opacity-0 translate-y-full pointer-events-none'
              }`
            : 'h-16 bg-slate-900/95 border-t border-slate-800 shrink-0 relative opacity-100 translate-y-0 pointer-events-auto'
        }`}
      >
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
          {/* Conditional Voice Switcher: Render ONLY if TTS is available AND multiple voices exist */}
          {hasTts && hasMultipleVoices && (
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

              {/* Progress Alert for Large Model TTS */}
              {isGeneratingTts && (
                <div className="p-4 bg-purple-950/60 border border-purple-800/80 rounded-2xl flex items-center gap-3 text-xs text-purple-200 font-bold animate-pulse">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin shrink-0" />
                  <div className="space-y-0.5">
                    <div>{ttsProgressMsg}</div>
                    <div className="text-[10px] text-purple-300/80 font-normal">
                      يتم توليد الصوت بتنسيق خفيف وسريع التحميل (Lightweight MP3) وحفظه تلقائياً.
                    </div>
                  </div>
                </div>
              )}

              {/* Section 0: Large Model TTS Replacement (ElevenLabs / Gemini) */}
              <div className="space-y-3 bg-gradient-to-b from-purple-950/40 to-slate-950/60 p-4 rounded-3xl border border-purple-800/50 shadow-inner">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-purple-200 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>توليد واستبدال الأصوات بنموذج ضخم فائق الجودة (Lightweight Large Model TTS):</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                    Fast 64kbps
                  </span>
                </div>

                {/* Provider Selector Tabs */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTtsProvider('elevenlabs')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      ttsProvider === 'elevenlabs'
                        ? 'bg-purple-600/30 border-purple-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Bot className="w-4 h-4 text-purple-400" />
                    <span>ElevenLabs Multilingual v2</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTtsProvider('gemini')}
                    className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                      ttsProvider === 'gemini'
                        ? 'bg-cyan-600/30 border-cyan-500 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-cyan-400" />
                    <span>Google Gemini / Neural TTS</span>
                  </button>
                </div>

                {/* API Key Input */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-bold text-slate-300">
                    <span>
                      {ttsProvider === 'elevenlabs' ? 'مفتاح ElevenLabs API Key:' : 'مفتاح Gemini / Google API Key:'}
                    </span>
                    <span className="text-[10px] text-slate-500">يُحفظ محلياً في المتصفح</span>
                  </div>
                  <input
                    type="password"
                    placeholder={ttsProvider === 'elevenlabs' ? 'sk_...' : 'AIzaSy...'}
                    value={ttsProvider === 'elevenlabs' ? elevenLabsApiKey : geminiApiKey}
                    onChange={(e) => {
                      if (ttsProvider === 'elevenlabs') {
                        setElevenLabsApiKey(e.target.value);
                      } else {
                        setGeminiApiKey(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:border-purple-500 outline-none"
                  />
                </div>

                {/* Batch Generation Button */}
                <button
                  type="button"
                  onClick={handleGenerateLargeModelTts}
                  disabled={isGeneratingTts}
                  className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingTts ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{ttsProgressMsg || 'جاري التوليد...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>توليد كافة الحوارات واستبدال الصوت بتنسيق خفيف</span>
                    </>
                  )}
                </button>
              </div>

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

              {/* Section 3: Custom Audio for Specific Dialogue */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-200 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>3. استبدال صوت المشهد بحوار مخصص (Per-Scene Voice):</span>
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
                    <Mic className="w-6 h-6 text-purple-400" />
                    <span className="text-xs font-bold text-slate-200">
                      {isUploadingVoice ? 'جاري معالجة الصوت وحفظه عبر الـ Worker...' : 'انقر لاختيار ملف صوتي (.mp3 أو .wav)'}
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
