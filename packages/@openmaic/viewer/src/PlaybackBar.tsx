'use client';

import { useState, useEffect } from 'react';
import { getTheme } from './theme';

interface PlaybackBarProps {
  current: number; total: number; actionCurrent: number; actionTotal: number; playing: boolean;
  speaker?: string | null;
  onPlay: () => void; onPause: () => void;
  onPrev: () => void; onNext: () => void;
  onToggleSidebar: () => void;
  darkMode: boolean;
  embed?: boolean;
}

export function PlaybackBar({ current, total, actionCurrent, actionTotal, playing, speaker, onPlay, onPause, onPrev, onNext, onToggleSidebar, darkMode, embed = false }: PlaybackBarProps) {
  const t = getTheme(darkMode);
  const [isMobile, setIsMobile] = useState(false);
  const progress = total > 0 ? (current / total) * 100 : 0;

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const iconBtnStyle = (disabled = false): React.CSSProperties => ({
    background: t.colors.surface,
    border: `1px solid ${t.colors.border}`,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? t.colors.textMuted : t.colors.textSecondary,
    fontSize: 14,
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: t.transitions.fast,
    opacity: disabled ? 0.35 : 1,
    flexShrink: 0,
  });

  const playBtnStyle: React.CSSProperties = {
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: t.transitions.normal,
    background: playing
      ? `linear-gradient(135deg, ${t.colors.primary}, ${t.colors.accent})`
      : t.colors.surface,
    color: playing ? '#fff' : t.colors.text,
    boxShadow: playing
      ? `0 4px 20px ${t.colors.primaryGlow}, 0 0 40px ${t.colors.primaryGlow}`
      : t.shadows.sm,
    flexShrink: 0,
  };

  // ── Mobile: floating pill ──
  if (isMobile) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        borderRadius: t.radii.pill,
        background: t.colors.glassBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        boxShadow: t.shadows.lg,
        border: `1px solid ${t.colors.glassBorder}`,
        fontFamily: t.fonts.sans,
      }}>
        <button
          className="cv-icon-btn"
          onClick={onPrev}
          disabled={current <= 1}
          aria-label="Previous scene"
          style={iconBtnStyle(current <= 1)}
        >
          ⏮
        </button>
        <button
          className="cv-icon-btn"
          onClick={playing ? onPause : onPlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={{ ...playBtnStyle, width: 46, height: 46 }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="cv-icon-btn"
          onClick={onNext}
          disabled={current >= total}
          aria-label="Next scene"
          style={iconBtnStyle(current >= total)}
        >
          ⏭
        </button>
      </div>
    );
  }

  // ── Desktop: full bar ──
  return (
    <div style={{
      background: t.colors.surface,
      borderTop: `1px solid ${t.colors.border}`,
      userSelect: 'none',
      fontFamily: t.fonts.sans,
      flexShrink: 0,
    }}>
      {/* Action progress bar */}
      {actionTotal > 0 && (
        <div style={{
          height: 2,
          background: t.colors.bgAlt,
          overflow: 'hidden',
          opacity: 0.8,
        }}>
          <div style={{
            height: '100%',
            width: `${(actionCurrent / actionTotal) * 100}%`,
            background: t.colors.accent,
            transition: 'width 0.3s linear',
            borderRadius: '0 2px 2px 0',
          }} />
        </div>
      )}
      {/* Gradient progress bar */}
      <div style={{
        height: 4,
        background: t.colors.bgAlt,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${t.colors.primary}, ${t.colors.accent})`,
          transition: 'width 0.4s cubic-bezier(.4,0,.2,1)',
          borderRadius: '0 2px 2px 0',
        }} />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '10px 24px',
      }}>
        {/* Sidebar toggle */}
        {!embed && (
          <button
            className="cv-icon-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle scene list"
            style={{
              ...iconBtnStyle(),
              position: 'absolute' as const,
              left: undefined,
              insetInlineStart: 24,
            }}
          >
            ☰
          </button>
        )}

        {/* Scene counter and Speaker indicator container */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginInlineEnd: 8,
          marginInlineStart: 40,
        }}>
          {/* Speaker Indicator */}
          {speaker && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 12px',
              borderRadius: t.radii.pill,
              background: playing ? `${t.colors.primary}20` : t.colors.bgAlt,
              border: `1px solid ${playing ? t.colors.primary : t.colors.border}`,
              transition: t.transitions.normal,
            }}>
              {playing && (
                <div style={{ display: 'flex', gap: 2, height: 12, alignItems: 'center' }}>
                  <style>{`
                    @keyframes cv-eq { 0% { height: 4px; } 50% { height: 12px; } 100% { height: 4px; } }
                    .cv-eq-bar { width: 3px; background: ${t.colors.primary}; border-radius: 2px; animation: cv-eq 1s ease-in-out infinite; }
                    .cv-eq-bar:nth-child(2) { animation-delay: 0.2s; }
                    .cv-eq-bar:nth-child(3) { animation-delay: 0.4s; }
                  `}</style>
                  <div className="cv-eq-bar" />
                  <div className="cv-eq-bar" />
                  <div className="cv-eq-bar" />
                </div>
              )}
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: playing ? t.colors.primary : t.colors.textMuted,
              }}>
                {speaker.toLowerCase().includes('student') ? 'Student' : 'Teacher'}
              </span>
            </div>
          )}

          {/* Scene counter */}
          <span style={{
            fontSize: 13,
            color: t.colors.textSecondary,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}>
            Scene {current} of {total}
          </span>
        </div>

        {/* Prev */}
        <button
          className="cv-icon-btn"
          onClick={onPrev}
          disabled={current <= 1}
          aria-label="Previous scene"
          style={iconBtnStyle(current <= 1)}
        >
          ⏮
        </button>

        {/* Play/Pause */}
        <button
          className="cv-icon-btn"
          onClick={playing ? onPause : onPlay}
          aria-label={playing ? 'Pause' : 'Play'}
          style={playBtnStyle}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* Next */}
        <button
          className="cv-icon-btn"
          onClick={onNext}
          disabled={current >= total}
          aria-label="Next scene"
          style={iconBtnStyle(current >= total)}
        >
          ⏭
        </button>
      </div>
    </div>
  );
}
