'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Scene } from '@openmaic/dsl';
import type { Action } from './action-types';
import { getTheme } from './theme';

interface NavSidebarProps {
  scenes: Scene<Action>[];
  currentIdx: number;
  currentActionIdx: number;
  onSelect: (index: number) => void;
  onClose: () => void;
  darkMode: boolean;
  /** Optional lesson title for the sidebar header */
  title?: string;
}

const TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  slide:       { bg: '#eef2ff', fg: '#6366f1', label: 'Slide' },
  quiz:        { bg: '#fef3c7', fg: '#d97706', label: 'Quiz' },
  interactive: { bg: '#ecfdf5', fg: '#059669', label: 'Activity' },
  pbl:         { bg: '#fce7f3', fg: '#db2777', label: 'Project' },
};

export function NavSidebar({ scenes, currentIdx, currentActionIdx, onSelect, onClose, darkMode, title }: NavSidebarProps) {
  const t = getTheme(darkMode);
  const [isMobile, setIsMobile] = useState(false);
  const [mode, setMode] = useState<'nav' | 'script'>('nav');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleSelect = useCallback((i: number) => {
    onSelect(i);
    if (isMobile) onClose();
  }, [onSelect, onClose, isMobile]);

  const sidebarWidth = isMobile ? 300 : 280;

  const sidebar = (
    <nav
      role="navigation"
      aria-label="Scene navigation"
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: isMobile ? t.colors.surface : t.colors.glassBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderInlineEnd: `1px solid ${t.colors.glassBorder}`,
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        insetInlineStart: 0,
        zIndex: isMobile ? 1001 : 'auto',
        animation: isMobile ? 'cv-slideInLeft 0.3s cubic-bezier(.4,0,.2,1)' : undefined,
        boxShadow: isMobile ? t.shadows.lg : 'none',
        fontFamily: t.fonts.sans,
      }}
    >
      {/* Header */}
      <div style={{
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderBottom: `1px solid ${t.colors.border}`,
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            {title && (
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: t.colors.text,
                marginBottom: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 200,
              }}>
                {title}
              </div>
            )}
            <div style={{
              fontSize: 12,
              color: t.colors.textMuted,
              fontWeight: 500,
            }}>
              {scenes.length} scenes
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              color: t.colors.textMuted,
              padding: '4px 8px',
              borderRadius: t.radii.sm,
              transition: t.transitions.fast,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
        
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={() => setMode('nav')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 4px',
              fontSize: 13,
              fontWeight: mode === 'nav' ? 600 : 500,
              color: mode === 'nav' ? t.colors.primary : t.colors.textSecondary,
              borderBottom: `2px solid ${mode === 'nav' ? t.colors.primary : 'transparent'}`,
              cursor: 'pointer',
              transition: t.transitions.fast,
              marginBottom: -1,
            }}
          >
            Navigation
          </button>
          <button
            onClick={() => setMode('script')}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 4px',
              fontSize: 13,
              fontWeight: mode === 'script' ? 600 : 500,
              color: mode === 'script' ? t.colors.primary : t.colors.textSecondary,
              borderBottom: `2px solid ${mode === 'script' ? t.colors.primary : 'transparent'}`,
              cursor: 'pointer',
              transition: t.transitions.fast,
              marginBottom: -1,
            }}
          >
            Script
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `${t.spacing.xs}px 0` }}>
        {mode === 'nav' ? (
          scenes.map((s, i) => {
            const active = i === currentIdx;
            const completed = i < currentIdx;
            const sceneType = TYPE_COLORS[s.type] || TYPE_COLORS.slide;

            return (
              <button
                key={s.id}
                className="cv-nav-item"
                onClick={() => handleSelect(i)}
                aria-current={active ? 'true' : undefined}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: active ? t.colors.surfaceActive : 'transparent',
                  color: active ? t.colors.primary : t.colors.textSecondary,
                  fontWeight: active ? 600 : 400,
                  borderInlineStart: `3px solid ${active ? t.colors.primary : 'transparent'}`,
                  transition: t.transitions.fast,
                  border: 'none',
                  borderBottom: 'none',
                  textAlign: 'start',
                  cursor: 'pointer',
                  lineHeight: 1.4,
                  fontFamily: 'inherit',
                  // Re-add the inline-start border
                  borderLeft: undefined,
                }}
              >
                {/* Timeline dot */}
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${active ? t.colors.primary : completed ? t.colors.success : t.colors.border}`,
                  background: completed ? t.colors.success : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: 1,
                  fontSize: 10,
                  color: '#fff',
                  transition: t.transitions.fast,
                }}>
                  {completed && '✓'}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {i + 1}. {s.title}
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: t.radii.pill,
                    background: darkMode ? `${sceneType.fg}22` : sceneType.bg,
                    color: darkMode ? sceneType.fg : sceneType.fg,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                  }}>
                    {sceneType.label}
                  </span>
                </div>
              </button>
            );
          })
        ) : (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {scenes[currentIdx]?.actions?.map((a, i) => {
              if (a.type !== 'speech') return null;
              const isCurrent = i === currentActionIdx;
              const isPast = i < currentActionIdx;

              return (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: isCurrent ? t.colors.text : (isPast ? t.colors.textMuted : t.colors.textSecondary),
                    fontWeight: isCurrent ? 600 : 400,
                    paddingInlineStart: 12,
                    borderInlineStart: `3px solid ${isCurrent ? t.colors.primary : 'transparent'}`,
                    transition: t.transitions.fast,
                    opacity: isPast ? 0.7 : 1,
                    fontFamily: 'inherit',
                  }}
                >
                  {(a as any).text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );

  // Mobile: wrap in overlay
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: t.colors.overlay,
            zIndex: 1000,
            animation: 'cv-fadeIn 0.2s ease-out',
          }}
          aria-hidden="true"
        />
        {sidebar}
      </>
    );
  }

  return sidebar;
}
