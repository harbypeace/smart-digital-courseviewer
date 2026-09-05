'use client';

import { useRef, useState, useEffect } from 'react';
import { SlideCanvas } from '@openmaic/renderer';
import type { Scene, SlideContent } from '@openmaic/dsl';
import type { Action } from './action-types';
import { getTheme } from './theme';

interface SlideSceneProps {
  scene: Scene<Action>;
  effects: { spotlight?: string; laser?: string };
  whiteboardOpen: boolean;
  whiteboardElements: unknown[];
  darkMode: boolean;
  mediaBaseUrl?: string;
  activeVisual?: { visualUrl: string; visualCaption?: string };
}

function resolveSrc(src: string | undefined, base?: string): string | undefined {
  if (!src) return src;
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('/')) {
    return src;
  }
  return base ? `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}` : src;
}

export function SlideScene({ scene, effects, whiteboardOpen, whiteboardElements, darkMode, mediaBaseUrl, activeVisual }: SlideSceneProps) {
  const t = getTheme(darkMode);
  const content = scene.content as SlideContent;

  const containerRef = useRef<HTMLDivElement>(null);
  const [_containerW, setContainerW] = useState(800);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e?.contentRect.width) setContainerW(e.contentRect.width);
    });
    ro.observe(el);
    setContainerW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!content?.canvas) return null;

  const slide = content.canvas;
  const ratio = slide?.viewportRatio || 0.5625;

  const renderImage = (el: any, src: string) => (
    <img src={resolveSrc(src, mediaBaseUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
  );
  const renderVideo = (el: any) => (
    <video src={resolveSrc(el.src, mediaBaseUrl)} controls style={{ width: '100%', height: '100%' }} />
  );
  const canvasProps = { renderImage, renderVideo, chrome: false as const };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const sceneVisual = activeVisual;
    
    return (
      <div
        ref={containerRef}
        style={{
          width: isMobile ? '100%' : '90%',
          maxWidth: isMobile ? '100%' : 1200,
          aspectRatio: `${1 / ratio}`,
          position: 'relative',
          borderRadius: isMobile ? 0 : t.radii.lg,
          overflow: 'hidden',
          boxShadow: isMobile ? 'none' : t.shadows.md,
          border: darkMode && !isMobile ? `1px solid ${t.colors.border}` : 'none',
        }}
      >
        {children}
        
        {/* Cinematic Visual Overlay (Picture-in-Picture) */}
        {sceneVisual && (
          <div style={{
            position: 'absolute',
            top: '25%',
            left: '6%',
            width: '40%',
            aspectRatio: '16/9',
            zIndex: 40,
            background: darkMode ? '#222' : '#fff',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '3px solid #fff',
            animation: 'cv-slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <style>{`
              @keyframes cv-slideInLeft {
                from { transform: translateX(-120%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
              @keyframes cv-slowPan {
                0% { transform: scale(1.0); }
                100% { transform: scale(1.1); }
              }
            `}</style>
            <img 
              src={resolveSrc(sceneVisual.visualUrl, mediaBaseUrl)} 
              alt={sceneVisual.visualCaption}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                animation: 'cv-slowPan 20s linear infinite alternate'
              }}
            />
            {sceneVisual.visualCaption && (
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                color: '#fff',
                padding: '16px 8px 8px 8px',
                fontSize: isMobile ? 10 : 13,
                fontWeight: 500,
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)'
              }}>
                {sceneVisual.visualCaption}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (whiteboardOpen && whiteboardElements.length > 0) {
    const wbSlide = { ...slide, elements: whiteboardElements as any[], background: { type: 'solid' as const, color: darkMode ? '#1e293b' : '#ffffff' } };
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.colors.bg,
      }}>
        <Wrapper><SlideCanvas slide={wbSlide} {...canvasProps} /></Wrapper>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: t.colors.bg,
    }}>
      <Wrapper>
        <SlideCanvas
          slide={slide}
          {...canvasProps}
          effects={{
            spotlight: effects.spotlight ? { elementId: effects.spotlight } : undefined,
            laser: effects.laser ? { elementId: effects.laser } : undefined,
          }}
        />
      </Wrapper>
    </div>
  );
}
