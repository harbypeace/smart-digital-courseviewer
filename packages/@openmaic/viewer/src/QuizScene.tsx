'use client';

import { useState } from 'react';
import type { Scene, QuizContent } from '@openmaic/dsl';
import type { Action } from './action-types';
import { getTheme } from './theme';

interface QuizSceneProps {
  scene: Scene<Action>;
  darkMode: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function isCorrectAnswer(opt: any, q: any): boolean {
  if (Array.isArray(q.answer)) {
    return q.answer.includes(opt.value);
  }
  return opt.value === q.answer;
}

export function QuizScene({ scene, darkMode }: QuizSceneProps) {
  const t = getTheme(darkMode);
  const content = scene.content as QuizContent;
  const questions = content?.questions ?? [];
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  return (
    <div style={{
      padding: 32,
      height: '100%',
      overflow: 'auto',
      background: t.colors.bg,
      fontFamily: t.fonts.sans,
    }}>
      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 8,
        color: t.colors.text,
        margin: 0,
      }}>
        {scene.title}
      </h2>

      {/* Progress dots */}
      <div style={{
        display: 'flex',
        gap: 6,
        marginBottom: 28,
        marginTop: 12,
      }}>
        {questions.map((_, qi) => (
          <div key={qi} style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: revealed.has(qi) ? t.colors.success : t.colors.border,
            transition: t.transitions.fast,
          }} />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {questions.map((q: any, qi: number) => {
          const isRevealed = revealed.has(qi);

          return (
            <div key={qi} style={{ animation: 'cv-slideUp 0.3s ease-out' }}>
              {/* Question counter */}
              <div style={{
                fontSize: 12,
                fontWeight: 600,
                color: t.colors.textMuted,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Question {qi + 1} of {questions.length}
              </div>

              {/* Question card */}
              <div style={{
                padding: '20px 24px',
                borderRadius: t.radii.lg,
                background: t.colors.surface,
                border: `1px solid ${t.colors.border}`,
                marginBottom: 16,
                boxShadow: t.shadows.sm,
              }}>
                <p style={{
                  fontWeight: 600,
                  fontSize: 16,
                  color: t.colors.text,
                  margin: 0,
                  lineHeight: 1.6,
                }}>
                  {q.question}
                </p>
              </div>

              {/* Option cards */}
              {q.type === 'short_answer' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    onClick={() => setRevealed(r => new Set([...r, qi]))}
                    style={{
                      padding: '12px 20px',
                      borderRadius: t.radii.md,
                      border: `1px solid ${t.colors.border}`,
                      background: t.colors.surface,
                      color: t.colors.primary,
                      fontWeight: 600,
                      cursor: isRevealed ? 'default' : 'pointer',
                      transition: t.transitions.fast,
                      fontFamily: 'inherit',
                      fontSize: 14,
                      display: isRevealed ? 'none' : 'block',
                    }}
                  >
                    Reveal Answer
                  </button>
                  {isRevealed && (
                    <div style={{
                      padding: '14px 20px',
                      borderRadius: t.radii.md,
                      border: `2px solid ${t.colors.success}`,
                      background: t.colors.successBg,
                      animation: 'cv-slideUp 0.3s ease-out',
                    }}>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: t.colors.success,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        Answer
                      </div>
                      <div style={{
                        padding: '10px 16px',
                        borderRadius: t.radii.sm,
                        background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                        color: t.colors.text,
                        fontFamily: t.fonts.mono,
                        fontSize: 14,
                      }}>
                        {q.answer}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {q.options?.map((opt: any, oi: number) => {
                    const correct = isCorrectAnswer(opt, q);
                    const showCorrect = isRevealed && correct;
                    const showWrong = isRevealed && !correct;

                    return (
                      <button
                        key={oi}
                        className="cv-option-hover"
                        onClick={() => setRevealed(r => new Set([...r, qi]))}
                        style={{
                          padding: '14px 18px',
                          borderRadius: t.radii.md,
                          cursor: isRevealed ? 'default' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          border: `2px solid ${
                            showCorrect ? t.colors.success
                            : showWrong ? t.colors.error
                            : t.colors.border
                          }`,
                          background: showCorrect ? t.colors.successBg
                            : showWrong ? t.colors.errorBg
                            : t.colors.surface,
                          color: t.colors.text,
                          fontWeight: showCorrect ? 600 : 400,
                          opacity: showWrong ? 0.65 : 1,
                          transition: t.transitions.normal,
                          boxShadow: showCorrect ? `0 0 0 3px ${t.colors.successBg}` : t.shadows.sm,
                          animation: showCorrect ? 'cv-correctPulse 1s ease-out' : undefined,
                          textAlign: 'start',
                          fontFamily: 'inherit',
                          fontSize: 14,
                          width: '100%',
                        }}
                      >
                        {/* Letter badge */}
                        <span style={{
                          width: 32,
                          height: 32,
                          borderRadius: t.radii.sm,
                          background: showCorrect ? t.colors.success
                            : showWrong ? t.colors.error
                            : darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                          color: showCorrect || showWrong ? '#fff' : t.colors.textSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                          flexShrink: 0,
                          transition: t.transitions.fast,
                        }}>
                          {showCorrect ? '✓' : showWrong ? '✗' : LETTERS[oi]}
                        </span>

                        {/* Option text */}
                        <span style={{ flex: 1 }}>
                          {opt.label || opt.text}
                        </span>

                        {/* Radio circle */}
                        {!isRevealed && (
                          <span style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            border: `2px solid ${t.colors.border}`,
                            flexShrink: 0,
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Analysis text after reveal */}
              {isRevealed && q.analysis && (
                <div style={{
                  marginTop: 16,
                  padding: '14px 20px',
                  borderRadius: t.radii.md,
                  background: darkMode ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.05)',
                  borderInlineStart: `3px solid ${t.colors.primary}`,
                  color: t.colors.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.7,
                  animation: 'cv-slideUp 0.3s ease-out',
                }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: t.colors.primary,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Explanation
                  </div>
                  {q.analysis}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
