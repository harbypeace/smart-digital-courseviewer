import type { Stage, Scene } from '@openmaic/dsl';
import type { Action } from './action-types';

export type { Stage, Scene };
export type { Action, SpeechAction, SpotlightAction, LaserAction, WbDrawTextAction, WbDrawShapeAction, WbDrawChartAction, WbDrawLatexAction, WbDrawTableAction, WbDrawLineAction, WbDrawCodeAction, WbClearAction, WbDeleteAction, WbOpenAction, WbCloseAction, WbEditCodeAction, PlayVideoAction, DiscussionAction } from './action-types';

export interface ClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene<Action>[];
  scenesCount: number;
  createdAt?: string;
}

export interface ClassroomViewerProps {
  /** Full classroom JSON data — use this OR zipUrl/zipBlob */
  data?: ClassroomData;
  /** Load classroom JSON from a ZIP file URL (contains classroom.json + media/) */
  zipUrl?: string;
  /** Load classroom JSON from a ZIP Blob (e.g. from file input) */
  zipBlob?: Blob;
  /**
   * URL to classroom folder in bucket (R2/S3).
   * Fetches `<url>/classroom.json` and uses `<url>/` as mediaBaseUrl.
   * Example: "https://my-bucket.r2.dev/classrooms/math-g7"
   */
  classroomUrl?: string;
  /** Base URL prefix for media files (images, audio). Overrides auto-detected base from classroomUrl. */
  mediaBaseUrl?: string;
  /** Show as dialog/modal (default: false = inline) */
  dialog?: boolean;
  /** Called when dialog is closed */
  onClose?: () => void;
  /** Dark mode (default: false) */
  darkMode?: boolean;
  /** Start at a specific scene index (default: 0) */
  startScene?: number;
  /** Start at a specific action index within the startScene (default: 0) */
  startAction?: number;
  /** Custom class on container */
  className?: string;
  /** LMS callback: Triggered when the current scene or action changes (useful for saving progress/bookmarking) */
  onProgress?: (sceneIndex: number, actionIndex: number) => void;
  /** LMS callback: Triggered when the entire lesson is completed */
  onComplete?: () => void;
  /** Embed mode: minimal chrome, no sidebar */
  embed?: boolean;
  /** Hide internal playback bar (when custom external playback bar is provided) */
  hidePlaybackBar?: boolean;
  /** Auto start playback of classroom scenes and actions when loaded */
  autoPlay?: boolean;
  /** Callback triggered when playback state changes (playing / paused) */
  onPlayStateChange?: (playing: boolean) => void;
}
