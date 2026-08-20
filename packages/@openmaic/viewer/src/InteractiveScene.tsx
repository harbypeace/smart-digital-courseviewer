'use client';

import { useState } from 'react';
import type { Scene } from '@openmaic/dsl';
import type { Action } from './action-types';
import { getTheme } from './theme';

interface InteractiveContent {
  type: 'interactive';
  url?: string;
  html?: string;
}

interface InteractiveSceneProps {
  scene: Scene<Action>;
  darkMode: boolean;
}

export function InteractiveScene({ scene, darkMode }: InteractiveSceneProps) {
  const t = getTheme(darkMode);
  const content = scene.content as unknown as InteractiveContent;
  const [loaded, setLoaded] = useState(false);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: t.colors.bg,
      position: 'relative',
    }}>
      {/* Loading spinner */}
      {!loaded && (content?.html || content?.url) && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          zIndex: 1,
          background: t.colors.bg,
        }}>
          <div style={{
            width: 36,
            height: 36,
            border: `3px solid ${t.colors.border}`,
            borderTopColor: t.colors.primary,
            borderRadius: '50%',
            animation: 'cv-spin 0.8s linear infinite',
          }} />
          <span style={{
            fontSize: 13,
            color: t.colors.textMuted,
            fontFamily: t.fonts.sans,
          }}>
            Loading activity…
          </span>
        </div>
      )}

      {content?.html ? (
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: t.radii.lg,
          overflow: 'hidden',
        }}>
          <iframe
            srcDoc={content.html}
            style={{ width: '100%', height: '100%', border: 'none' }}
            sandbox="allow-scripts allow-same-origin"
            title={scene.title}
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : content?.url ? (
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: t.radii.lg,
          overflow: 'hidden',
        }}>
          <iframe
            src={content.url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay"
            title={scene.title}
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        <div style={{
          padding: 40,
          color: t.colors.textMuted,
          fontFamily: t.fonts.sans,
          textAlign: 'center',
        }}>
          Interactive scene — no content available
        </div>
      )}
    </div>
  );
}
