'use client';

import type { Scene } from '@openmaic/dsl';
import type { Action } from './action-types';
import { SlideScene } from './SlideScene';
import { QuizScene } from './QuizScene';
import { InteractiveScene } from './InteractiveScene';
import { getTheme } from './theme';

interface SceneRendererProps {
  scene: Scene<Action>;
  effects: { spotlight?: string; laser?: string };
  whiteboardOpen: boolean;
  whiteboardElements: unknown[];
  darkMode: boolean;
  mediaBaseUrl?: string;
  activeVisual?: { visualUrl: string; visualCaption?: string };
}

export function SceneRenderer({ scene, effects, whiteboardOpen, whiteboardElements, darkMode, mediaBaseUrl, activeVisual }: SceneRendererProps) {
  const t = getTheme(darkMode);

  const inner = (() => {
    switch (scene.type) {
      case 'slide':
        return (
          <SlideScene
            scene={scene}
            effects={effects}
            whiteboardOpen={whiteboardOpen}
            whiteboardElements={whiteboardElements}
            darkMode={darkMode}
            mediaBaseUrl={mediaBaseUrl}
            activeVisual={activeVisual}
          />
        );
      case 'quiz':
        return <QuizScene scene={scene} darkMode={darkMode} />;
      case 'interactive':
        return <InteractiveScene scene={scene} darkMode={darkMode} />;
      case 'pbl':
        return <div style={{ padding: 40, color: t.colors.textSecondary, fontFamily: t.fonts.sans }}>PBL Scene</div>;
      default:
        return <div style={{ padding: 40, color: t.colors.textMuted, fontFamily: t.fonts.sans }}>Unknown scene type</div>;
    }
  })();

  // Wrap in a fade-in animation keyed on scene.id for transitions
  return (
    <div
      key={scene.id}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: 'cv-fadeIn 0.25s ease-out',
      }}
    >
      {inner}
    </div>
  );
}
