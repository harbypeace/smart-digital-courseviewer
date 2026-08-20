import type { Stage, Scene, SceneContent } from '@openmaic/dsl';
import type { ClassroomData, Action } from '@openmaic/viewer';

export interface ManifestStage {
  name: string;
  description?: string;
  language?: string;
  style?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ManifestAgent {
  name: string;
  role: string;
  persona: string;
  avatar: string;
  color: string;
  priority: number;
  voiceConfig?: { providerId: string; voiceId: string };
}

export interface ManifestScene {
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  order: number;
  content: unknown;
  actions?: ManifestAction[];
  whiteboards?: unknown[];
  multiAgent?: {
    enabled: boolean;
    agentIndices: number[];
    directorPrompt?: string;
  };
}

export interface ManifestAction {
  id: string;
  title?: string;
  description?: string;
  type: string;
  [key: string]: unknown;
}

export interface MediaIndexEntry {
  type: 'audio' | 'image' | 'generated';
  mimeType?: string;
  format?: string;
  duration?: number;
  voice?: string;
  size?: number;
  prompt?: string;
  missing?: boolean;
}

export interface ClassroomManifest {
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  stage: ManifestStage;
  agents: ManifestAgent[];
  scenes: ManifestScene[];
  mediaIndex: Record<string, MediaIndexEntry>;
}

export interface LoadManifestOptions {
  stageId?: string;
}

export async function loadManifestFromZip(
  zipBlob: Blob,
  options: LoadManifestOptions = {},
): Promise<ClassroomData> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('No manifest.json found in ZIP');
  const manifest = JSON.parse(await manifestFile.async('string')) as ClassroomManifest;

  if (!manifest.stage || !Array.isArray(manifest.scenes)) {
    throw new Error('Invalid manifest: missing stage or scenes');
  }

  const mediaUrls = new Map<string, string>();
  const mediaRegex = /\.(png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|mp4|webm)$/i;
  const mediaFiles = zip.file(mediaRegex);
  for (const file of mediaFiles) {
    const blob = await file.async('blob');
    mediaUrls.set(file.name, URL.createObjectURL(blob));
  }

  const stageId = options.stageId || `stage_${manifest.stage.createdAt}`;

  const stage: Stage = {
    id: stageId,
    name: manifest.stage.name || 'Imported Classroom',
    description: manifest.stage.description,
    languageDirective: manifest.stage.language,
    style: manifest.stage.style,
    createdAt: manifest.stage.createdAt,
    updatedAt: manifest.stage.updatedAt,
    generatedAgentConfigs: manifest.agents?.length
      ? manifest.agents.map((a, i) => ({
          id: `agent_${i}`,
          name: a.name,
          role: a.role,
          persona: a.persona,
          avatar: a.avatar,
          color: a.color,
          priority: a.priority,
        }))
      : undefined,
  };

  const scenes: Scene<Action>[] = manifest.scenes.map((mScene, idx) => {
    const sceneId = `scene_${mScene.order ?? idx}`;
    const actions = mScene.actions
      ? rewriteActions(mScene.actions, mediaUrls, manifest.agents ?? [])
      : undefined;

    let multiAgent: Scene<Action>['multiAgent'];
    if (mScene.multiAgent?.enabled) {
      multiAgent = {
        enabled: true,
        agentIds: (mScene.multiAgent.agentIndices ?? [])
          .map((i) => `agent_${i}`)
          .filter((id) => id !== 'agent_undefined'),
        directorPrompt: mScene.multiAgent.directorPrompt,
      };
    }

    const content = rewriteContentMedia(mScene.content, mediaUrls) as SceneContent;

    return {
      id: sceneId,
      stageId,
      type: mScene.type,
      title: mScene.title,
      order: mScene.order ?? idx,
      content,
      actions,
      whiteboards: mScene.whiteboards as Scene<Action>['whiteboards'],
      multiAgent,
      createdAt: manifest.exportedAt ? new Date(manifest.exportedAt).getTime() : undefined,
      updatedAt: manifest.exportedAt ? new Date(manifest.exportedAt).getTime() : undefined,
    };
  });

  return {
    id: stageId,
    stage,
    scenes,
    scenesCount: scenes.length,
  };
}

function rewriteActions(
  actions: ManifestAction[],
  mediaUrls: Map<string, string>,
  agents: ManifestAgent[],
): Action[] {
  return actions.map((action) => {
    switch (action.type) {
      case 'speech': {
        const audioRef = action.audioRef as string | undefined;
        const audioUrl = action.audioUrl as string | undefined;
        const resolvedAudio =
          audioRef && mediaUrls.has(audioRef)
            ? mediaUrls.get(audioRef)
            : audioUrl && !/^(http|data:|blob:)/.test(audioUrl)
              ? (mediaUrls.get(audioUrl.replace(/^\/+/, '')) ?? audioUrl)
              : audioUrl;
        const visualUrl = resolveVisualUrl(action.visualUrl, mediaUrls);
        return {
          ...action,
          type: 'speech',
          audioUrl: resolvedAudio,
          visualUrl,
        } as Action;
      }
      case 'discussion': {
        const agentIndex = action.agentIndex as number | undefined;
        const agentId =
          typeof agentIndex === 'number' && agents[agentIndex] ? `agent_${agentIndex}` : undefined;
        return {
          ...action,
          type: 'discussion',
          ...(agentId ? { agentId } : {}),
        } as Action;
      }
      default:
        return action as Action;
    }
  });
}

function resolveVisualUrl(
  visualUrl: unknown,
  mediaUrls: Map<string, string>,
): string | undefined {
  if (typeof visualUrl !== 'string' || !visualUrl) return undefined;
  if (/^(http|data:|blob:)/.test(visualUrl)) return visualUrl;
  const clean = visualUrl.replace(/^\/+/, '');
  return mediaUrls.get(clean) ?? mediaUrls.get(clean.split('/').pop() ?? '') ?? visualUrl;
}

function rewriteContentMedia(content: unknown, mediaUrls: Map<string, string>): unknown {
  if (!content || typeof content !== 'object') return content;

  const c = content as { type?: string; canvas?: { elements?: unknown[] } };
  if (c.type === 'slide' && Array.isArray(c.canvas?.elements)) {
    const canvas = c.canvas as { elements: Array<Record<string, unknown>> };
    canvas.elements = canvas.elements.map((el) => {
      if (el.type === 'image' || el.type === 'video') {
        const src = el.src as string | undefined;
        if (src && !/^(http|data:|blob:)/.test(src)) {
          const clean = src.replace(/^\/+/, '');
          const resolved = mediaUrls.get(clean) ?? mediaUrls.get(clean.split('/').pop() ?? '');
          if (resolved) return { ...el, src: resolved };
        }
      }
      return el;
    });
    return c;
  }

  return content;
}

export function revokeManifestUrls(data: ClassroomData): void {
  const urls = new Set<string>();
  const collect = (u: string | undefined) => {
    if (u && u.startsWith('blob:')) urls.add(u);
  };
  for (const scene of data.scenes) {
    for (const a of scene.actions ?? []) {
      const action = a as Action & { audioUrl?: string; visualUrl?: string };
      collect(action.audioUrl);
      collect(action.visualUrl);
    }
  }
  for (const u of urls) URL.revokeObjectURL(u);
}
