'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClassroomData, ClassroomViewerProps } from './types';
import type { Action, SpeechAction } from './action-types';
import { SceneRenderer } from './SceneRenderer';
import { NavSidebar } from './NavSidebar';
import { PlaybackBar } from './PlaybackBar';
import { StyleInjector } from './StyleInjector';
import { isRtl } from './utils';
import { getTheme } from './theme';

function speechDuration(text: string) {
  const charsPerSecond = 12; // average reading speed
  return Math.max(2000, (text.length / charsPerSecond) * 1000);
}

function normalizeViewerData(
  d: ClassroomData,
  mediaUrls?: Map<string, string>,
  effectiveMediaBase?: string
): ClassroomData {
  if (!d || !Array.isArray(d.scenes)) return d;
  d.scenes.forEach(s => {
    if (s.type === 'slide' && (s.content as any)?.canvas?.elements) {
      (s.content as any).canvas.elements.forEach((el: any) => {
        if ((el.type === 'image' || el.type === 'video') && el.src) {
          const cleanPath = String(el.src).replace(/^\//, '');
          const filename = cleanPath.split('/').pop()?.split('?')[0] || '';
          if (mediaUrls?.has(cleanPath)) el.src = mediaUrls.get(cleanPath);
          else if (mediaUrls?.has(filename)) el.src = mediaUrls.get(filename);
          else if (effectiveMediaBase && !/^(http|data:|blob:|\/)/i.test(el.src))
            el.src = `${effectiveMediaBase.replace(/\/$/, '')}/${cleanPath}`;
        }
      });
    }
    s.actions?.forEach((a: any) => {
      // Import only images and video (visualUrl), not audio for now
      if (a.visualUrl) {
        const cleanPath = String(a.visualUrl).replace(/^\//, '');
        const filename = cleanPath.split('/').pop()?.split('?')[0] || '';
        if (mediaUrls?.has(cleanPath)) a.visualUrl = mediaUrls.get(cleanPath);
        else if (mediaUrls?.has(filename)) a.visualUrl = mediaUrls.get(filename);
        else if (effectiveMediaBase && !/^(http|https|blob:|data:|\/)/i.test(a.visualUrl))
          a.visualUrl = `${effectiveMediaBase.replace(/\/$/, '')}/${cleanPath}`;
      }
    });
  });
  return d;
}

export function ClassroomViewer({
  data: inputData, zipUrl, zipBlob, classroomUrl, mediaBaseUrl,
  dialog = false, onClose, darkMode = false, startScene = 0, startAction = 0, className,
  onProgress, onComplete, embed = false, hidePlaybackBar = false, autoPlay = true,
  onPlayStateChange
}: ClassroomViewerProps) {
  const [data, setData] = useState<ClassroomData | null>(inputData ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = getTheme(darkMode);

  const effectiveMediaBase = mediaBaseUrl ?? (classroomUrl ? `${classroomUrl.replace(/\/$/, '')}/` : undefined);

  // ── Data loading ──
  // classroomUrl fetch
  useEffect(() => {
    if (inputData || zipUrl || zipBlob) return;
    if (!classroomUrl) return;
    setLoading(true);
    fetch(`${classroomUrl.replace(/\/$/, '')}/classroom.json`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        const normalized = normalizeViewerData(d as ClassroomData, undefined, effectiveMediaBase);
        setData(normalized);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [classroomUrl, inputData, zipUrl, zipBlob, effectiveMediaBase]);

  // ZIP or inputData fetch
  useEffect(() => {
    if (inputData) {
      const cloned = JSON.parse(JSON.stringify(inputData)) as ClassroomData;
      normalizeViewerData(cloned, undefined, effectiveMediaBase);
      setData(cloned);
      return;
    }
    if (!zipUrl && !zipBlob) return;
    setLoading(true);
    const src = zipBlob ? zipBlob : fetch(zipUrl!).then(r => r.blob());
    Promise.resolve(src).then(blob =>
      import('jszip').then(({ default: JSZip }) => JSZip.loadAsync(blob))
    ).then(async zip => {
      const jf = zip.file(/(classroom|manifest)\.json$/i)[0];
      if (!jf) throw new Error('No classroom.json or manifest.json in ZIP');
      const d = JSON.parse(await jf.async('string')) as ClassroomData;
      // Extract only image and video media (not audio)
      const mediaUrls = new Map<string, string>();
      const mediaFiles = zip.file(/\.(png|jpg|jpeg|gif|webp|svg|mp4|webm)$/i);
      for (const file of mediaFiles) {
        const blob = await file.async('blob');
        mediaUrls.set(file.name.split('/').pop()!, URL.createObjectURL(blob));
      }
      normalizeViewerData(d, mediaUrls, effectiveMediaBase);
      setData(d);
    }).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [inputData, zipUrl, zipBlob, effectiveMediaBase]);

  // ── Playback state ──
  const [sceneIdx, setSceneIdx] = useState(startScene);
  const [playing, setPlaying] = useState(false);
  const [actionIdx, setActionIdx] = useState(startAction);
  const [_speechText, setSpeechText] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? (window.innerWidth >= 1024 && !embed) : !embed);
  const [wbOpen, setWbOpen] = useState(false);
  const [wbElements, setWbElements] = useState<unknown[]>([]);
  const [effects, setEffects] = useState<{ spotlight?: string; laser?: string }>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playTrigger, setPlayTrigger] = useState(0);

  // ── Navigation & Progress Echo Prevention ──
  // Track last reported progress position so we can distinguish internal playback ticks
  // from external user navigation (e.g. clicking sidebar or script panel).
  const currentPosRef = useRef({ scene: startScene, action: startAction });
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const reportProgress = useCallback((sIdx: number, aIdx: number) => {
    currentPosRef.current = { scene: sIdx, action: aIdx };
    if (onProgressRef.current) {
      onProgressRef.current(sIdx, aIdx);
    }
  }, []);

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
      } catch (_e) {}
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  const stopAll = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimers();
    setSpeechText(null);
    setEffects({});
  }, []);

  // Respond ONLY to external navigation changes
  const prevNavRef = useRef({ scene: startScene, action: startAction });

  useEffect(() => {
    if (!data) return;
    if (startScene === prevNavRef.current.scene && startAction === prevNavRef.current.action) {
      return;
    }
    prevNavRef.current = { scene: startScene, action: startAction };
    stopAll();
    setSceneIdx(Math.min(startScene, (data.scenes?.length ?? 1) - 1));
    setActionIdx(startAction);
    setPlayTrigger(t => t + 1);
  }, [data, startScene, startAction, stopAll]);

  const onPlayStateChangeRef = useRef(onPlayStateChange);
  onPlayStateChangeRef.current = onPlayStateChange;

  useEffect(() => {
    onPlayStateChangeRef.current?.(playing);
  }, [playing]);

  useEffect(() => {
    if (!data) return;
    if (autoPlay) {
      setPlaying(true);
    } else {
      stopAll();
    }
  }, [data, autoPlay, stopAll]);

  const rtl = isRtl(data?.stage?.languageDirective);
  const scene = data?.scenes[sceneIdx];
  const actions = (scene?.actions ?? []) as Action[];

  // Preload all audio files in the current scene to eliminate streaming latency & desync
  useEffect(() => {
    if (!actions || actions.length === 0) return;
    actions.forEach((act) => {
      if (act.type === 'speech') {
        const sa = act as SpeechAction;
        if (sa.audioUrl) {
          const src = sa.audioUrl && !/^(http|https|data:|blob:|\/)/i.test(sa.audioUrl)
            ? (effectiveMediaBase ? `${effectiveMediaBase.replace(/\/$/, '')}/${sa.audioUrl.replace(/^\//, '')}` : sa.audioUrl)
            : sa.audioUrl;
          if (src && !audioCache.current.has(src)) {
            try {
              const a = new Audio(src);
              a.preload = 'auto';
              audioCache.current.set(src, a);
            } catch (_e) {}
          }
        }
      }
    });
  }, [actions, effectiveMediaBase]);

  // ── Execute single action with strict audio synchronization ──
  const runAction = useCallback((action: Action, done: () => void) => {
    switch (action.type) {
      case 'speech': {
        const sa = action as SpeechAction;
        setSpeechText(sa.text);
        const ms = speechDuration(sa.text);
        const audioSrc = sa.audioUrl && !/^(http|https|data:|blob:|\/)/i.test(sa.audioUrl)
          ? (effectiveMediaBase ? `${effectiveMediaBase.replace(/\/$/, '')}/${sa.audioUrl.replace(/^\//, '')}` : sa.audioUrl)
          : sa.audioUrl;

        // Stop any previous audio / speech immediately to avoid overlapping voices
        clearTimers();

        let handled = false;
        const finishAction = () => {
          if (handled) return;
          handled = true;
          setSpeechText(null);
          done();
        };

        let ttsActive = false;
        const fallbackTTS = () => {
          if (handled || ttsActive) return;
          ttsActive = true;
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(sa.text);
            const isArabic = /[\u0600-\u06FF]/.test(sa.text);
            utterance.lang = isArabic ? 'ar-SA' : 'en-US';
            utterance.rate = 1.0;
            utterance.onend = finishAction;
            utterance.onerror = (e: any) => {
              if (e?.error === 'not-allowed') {
                console.warn('SpeechSynthesis blocked by autoplay policy. Pausing for user interaction.');
                stopAll();
                return;
              }
              console.warn('SpeechSynthesis error, fallback timer:', e);
              timerRef.current = setTimeout(finishAction, Math.min(ms, 4000));
            };
            try {
              window.speechSynthesis.speak(utterance);
            } catch (_err) {
              timerRef.current = setTimeout(finishAction, ms);
            }
          } else {
            timerRef.current = setTimeout(finishAction, ms);
          }
        };

        if (audioSrc) {
          let a = audioCache.current.get(audioSrc);
          if (!a) {
            a = new Audio(audioSrc);
            audioCache.current.set(audioSrc, a);
          }
          a.currentTime = 0;
          audioRef.current = a;
          a.onended = finishAction;
          a.onerror = (e) => {
            console.warn('Audio play error, falling back to TTS for:', audioSrc, e);
            fallbackTTS();
          };
          const playPromise = a.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              if (err.name === 'AbortError') return; // User skipped / paused
              if (err.name === 'NotAllowedError') {
                console.warn('Autoplay blocked by browser policy. Pausing and showing play prompt for user gesture.');
                stopAll();
                return;
              }
              console.warn('Audio play failed, falling back to TTS for:', audioSrc, err);
              fallbackTTS();
            });
          }
        } else {
          fallbackTTS();
        }
        break;
      }
      case 'spotlight':
        setEffects(e => ({ ...e, spotlight: (action as any).elementId }));
        timerRef.current = setTimeout(() => { setEffects(e => ({ ...e, spotlight: undefined })); done(); }, 3000);
        break;
      case 'laser':
        setEffects(e => ({ ...e, laser: (action as any).elementId }));
        timerRef.current = setTimeout(() => { setEffects(e => ({ ...e, laser: undefined })); done(); }, 2000);
        break;
      case 'wb_open': setWbOpen(true); timerRef.current = setTimeout(done, 500); break;
      case 'wb_close': setWbOpen(false); setWbElements([]); timerRef.current = setTimeout(done, 500); break;
      case 'wb_clear': setWbElements([]); timerRef.current = setTimeout(done, 300); break;
      case 'wb_delete':
        setWbElements(p => p.filter((el: any) => el.id !== (action as any).elementId));
        timerRef.current = setTimeout(done, 300); break;
      case 'wb_draw_text': case 'wb_draw_shape': case 'wb_draw_chart':
      case 'wb_draw_latex': case 'wb_draw_table': case 'wb_draw_line': case 'wb_draw_code':
        setWbElements(p => { const exists = p.some((e: any) => e.id === action.id); return exists ? p : [...p, { ...action }]; });
        setWbOpen(true); timerRef.current = setTimeout(done, 800); break;
      case 'play_video': timerRef.current = setTimeout(done, 5000); break;
      case 'discussion': timerRef.current = setTimeout(done, 3000); break;
      default: done(); break;
    }
  }, [effectiveMediaBase]);

  // ── Playback loop using ref to avoid stale closure ──
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    if (!playing) return;
    playingRef.current = true;
    let idx = actionIdx;
    let stopped = false;

    const run = () => {
      if (stopped || !playingRef.current) return;
      const acts = actionsRef.current;
      if (idx >= acts.length) { 
        if (sceneIdx < (data?.scenes.length ?? 1) - 1) {
          const nextScene = sceneIdx + 1;
          reportProgress(nextScene, 0);
          setActionIdx(0);
          setSceneIdx(nextScene);
        } else {
          setPlaying(false); 
          playingRef.current = false; 
          if (onComplete) onComplete();
        }
        return; 
      }
      setActionIdx(idx);
      reportProgress(sceneIdx, idx);
      runAction(acts[idx], () => {
        if (stopped || !playingRef.current) return;
        idx++;
        setTimeout(() => run(), 50);
      });
    };

    setTimeout(() => run(), 100);

    return () => { stopped = true; clearTimers(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scene?.id, sceneIdx, playTrigger]);

  const play = () => { setPlaying(true); };
  const pause = () => { stopAll(); };
  const prev = () => { 
    stopAll(); 
    const targetScene = Math.max(0, sceneIdx - 1);
    reportProgress(targetScene, 0);
    setActionIdx(0); 
    setSceneIdx(targetScene); 
  };
  const next = () => { 
    stopAll(); 
    const targetScene = Math.min((data?.scenes.length ?? 1) - 1, sceneIdx + 1);
    reportProgress(targetScene, 0);
    setActionIdx(0); 
    setSceneIdx(targetScene); 
  };
  const goTo = (i: number) => { 
    stopAll(); 
    reportProgress(i, 0);
    setActionIdx(0); 
    setSceneIdx(i); 
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!data) return;
      // Don't capture when user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (playing) pause(); else play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          next();
          break;
        case 'Escape':
          if (dialog && onClose) { e.preventDefault(); onClose(); }
          break;
      }
    };
    window.addEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => window.removeEventListener('keydown', handler);
  }, [data, playing, dialog, onClose]);

  // ── Loading state ──
  if (loading) return (
    <>
      <StyleInjector />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
        height: 200, fontFamily: t.fonts.sans,
      }}>
        <div style={{
          width: 36, height: 36,
          border: `3px solid ${t.colors.border}`,
          borderTopColor: t.colors.primary,
          borderRadius: '50%',
          animation: 'cv-spin 0.8s linear infinite',
        }} />
        <span style={{ color: t.colors.textMuted, fontSize: 14 }}>Loading classroom…</span>
      </div>
    </>
  );

  // ── Error state ──
  if (error) return (
    <>
      <StyleInjector />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 200, fontFamily: t.fonts.sans,
      }}>
        <div style={{
          padding: '24px 32px',
          borderRadius: t.radii.lg,
          background: t.colors.errorBg,
          border: `1px solid ${t.colors.error}`,
          textAlign: 'center',
          maxWidth: 400,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠</div>
          <div style={{ color: t.colors.error, fontWeight: 600, marginBottom: 4, fontSize: 15 }}>
            Failed to load
          </div>
          <div style={{ color: t.colors.textMuted, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
          {classroomUrl && (
            <button
              onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
              style={{
                padding: '8px 20px',
                borderRadius: t.radii.md,
                border: `1px solid ${t.colors.error}`,
                background: 'transparent',
                color: t.colors.error,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: t.transitions.fast,
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (!data) return null;

  const content = (
    <div
      ref={containerRef}
      className={`classroom-viewer ${darkMode ? 'dark' : ''} ${className ?? ''}`}
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ height: '100%', fontFamily: t.fonts.sans }}
    >
      <StyleInjector />
      <div style={{ display: 'flex', height: '100%', background: t.colors.bg }}>
        {sidebarOpen && !embed && (
          <NavSidebar
            scenes={data.scenes}
            currentIdx={sceneIdx}
            currentActionIdx={actionIdx}
            onSelect={goTo}
            onClose={() => setSidebarOpen(false)}
            darkMode={darkMode}
            title={data.stage?.name}
          />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {scene && (
              <SceneRenderer
                scene={scene}
                effects={effects}
                whiteboardOpen={wbOpen}
                whiteboardElements={wbElements}
                darkMode={darkMode}
                mediaBaseUrl={effectiveMediaBase}
                activeVisual={actions.slice(0, actionIdx + 1).reverse().find((a: any) => a.type === 'speech' && a.visualUrl) as any}
              />
            )}

            {/* Play/Resume Overlay */}
            {!playing && (
              <div
                className="cv-play-overlay"
                onClick={play}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 50,
                  cursor: 'pointer',
                  animation: 'cv-fadeIn 0.2s ease-out',
                }}
              >
                <style>{`
                  .cv-play-overlay:hover .cv-play-btn-center {
                    transform: scale(1.1);
                    background: rgba(0,0,0,0.7) !important;
                  }
                  .cv-play-btn-center {
                    transition: transform 0.2s ease, background 0.2s ease;
                  }
                `}</style>
                <div
                  className="cv-play-btn-center"
                  style={{
                    width: '25%',
                    height: 'auto',
                    aspectRatio: '1 / 1',
                    maxWidth: 200,
                    minWidth: 80,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '4px solid rgba(255,255,255,0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 'clamp(32px, 8vw, 80px)',
                    paddingInlineStart: 'clamp(6px, 1.5vw, 16px)',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
                  }}
                >
                  ▶
                </div>
              </div>
            )}
          </div>
          {!hidePlaybackBar && (
            <PlaybackBar
              current={sceneIdx + 1}
              total={data.scenes.length}
              actionCurrent={actionIdx}
              actionTotal={actions.length}
              playing={playing}
              speaker={actions[actionIdx]?.type === 'speech' ? (actions[actionIdx] as SpeechAction).voice : null}
              onPlay={play}
              onPause={pause}
              onPrev={prev}
              onNext={next}
              onToggleSidebar={() => setSidebarOpen(o => !o)}
              darkMode={darkMode}
              embed={embed}
            />
          )}
        </div>
      </div>
    </div>
  );

  if (dialog) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={data.stage?.name || 'Classroom Viewer'}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: t.colors.overlay,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'cv-fadeIn 0.2s ease-out',
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: '95vw',
            height: '90vh',
            maxWidth: 1400,
            borderRadius: t.radii.lg,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            animation: 'cv-slideUp 0.3s cubic-bezier(.4,0,.2,1)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            background: `linear-gradient(135deg, ${t.colors.primary}, ${t.colors.accent})`,
            color: '#fff',
          }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{data.stage?.name || 'Classroom'}</span>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: t.radii.sm,
                transition: t.transitions.fast,
                fontFamily: 'inherit',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>{content}</div>
        </div>
      </div>
    );
  }

  return <div style={{ width: '100%', height: '100%', minHeight: 500 }}>{content}</div>;
}
