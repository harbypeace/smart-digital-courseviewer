import type { Stage, Scene, SceneContent } from '@openmaic/dsl';
import type { ClassroomData, Action } from '@openmaic/viewer';
import {
  type ClassroomManifest,
  type ManifestAction,
  type ManifestAgent,
} from './manifest-loader';
import { appendAuthToken } from './utils';

export type UniversalSourceType = 'zip' | 'folder' | 'json' | 'classid';

export interface UniversalLoadOptions {
  mediaBaseUrl?: string;
  workerUrl?: string;
  serverUrl?: string;
  accessCode?: string;
  stageId?: string;
}

export function isManifestFormat(data: unknown): data is ClassroomManifest {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.formatVersion === 'number' ||
    Boolean(d.mediaIndex) ||
    typeof d.appVersion === 'string'
  );
}

export function isClassroomDataFormat(data: unknown): data is ClassroomData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return Boolean(d.stage) && Array.isArray(d.scenes);
}

export function transformManifestToClassroomData(
  manifest: ClassroomManifest,
  mediaUrls: Map<string, string> = new Map(),
  options: UniversalLoadOptions = {},
): ClassroomData {
  const stageId = options.stageId || `stage_${manifest.stage?.createdAt || Date.now()}`;

  const stage: Stage = {
    id: stageId,
    name: manifest.stage?.name || 'Classroom Lesson',
    description: manifest.stage?.description,
    languageDirective: manifest.stage?.language,
    style: manifest.stage?.style,
    createdAt: manifest.stage?.createdAt || Date.now(),
    updatedAt: manifest.stage?.updatedAt || Date.now(),
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

  const scenes: Scene<Action>[] = (manifest.scenes || []).map((mScene, idx) => {
    const sceneId = `scene_${mScene.order ?? idx}`;
    const actions = mScene.actions
      ? rewriteActions(mScene.actions, mediaUrls, manifest.agents ?? [], options.mediaBaseUrl)
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

    const content = rewriteContentMedia(mScene.content, mediaUrls, options.mediaBaseUrl) as SceneContent;

    return {
      id: sceneId,
      stageId,
      type: mScene.type,
      title: mScene.title || `Scene ${idx + 1}`,
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
  mediaBaseUrl?: string,
): Action[] {
  const base = mediaBaseUrl ? mediaBaseUrl.replace(/\/$/, '') : '';

  return actions.map((action) => {
    switch (action.type) {
      case 'speech': {
        const audioRef = action.audioRef as string | undefined;
        const audioUrl = action.audioUrl as string | undefined;
        let resolvedAudio: string | undefined;

        if (audioRef) {
          const cleanRef = audioRef.replace(/^\/+/, '');
          const filename = cleanRef.split('/').pop() ?? cleanRef;
          resolvedAudio = mediaUrls.get(cleanRef) ?? mediaUrls.get(filename);
        }

        if (!resolvedAudio && audioUrl) {
          if (/^(http|data:|blob:)/.test(audioUrl)) {
            resolvedAudio = audioUrl;
          } else {
            const cleanUrl = audioUrl.replace(/^\/+/, '');
            const filename = cleanUrl.split('/').pop() ?? cleanUrl;
            resolvedAudio =
              mediaUrls.get(cleanUrl) ??
              mediaUrls.get(filename) ??
              (base ? `${base}/${cleanUrl}` : audioUrl);
          }
        }

        const visualUrl = resolveVisualUrl(action.visualUrl, mediaUrls, base);

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
  base?: string,
): string | undefined {
  if (typeof visualUrl !== 'string' || !visualUrl) return undefined;
  if (/^(http|data:|blob:)/.test(visualUrl)) return visualUrl;
  const clean = visualUrl.replace(/^\/+/, '');
  const filename = clean.split('/').pop() ?? clean;
  return (
    mediaUrls.get(clean) ??
    mediaUrls.get(filename) ??
    (base ? `${base}/${clean}` : visualUrl)
  );
}

function rewriteContentMedia(
  content: unknown,
  mediaUrls: Map<string, string>,
  mediaBaseUrl?: string,
): unknown {
  if (!content || typeof content !== 'object') return content;
  const base = mediaBaseUrl ? mediaBaseUrl.replace(/\/$/, '') : '';

  const c = content as { type?: string; canvas?: { elements?: unknown[] } };
  if (c.type === 'slide' && Array.isArray(c.canvas?.elements)) {
    const canvas = c.canvas as { elements: Array<Record<string, unknown>> };
    canvas.elements = canvas.elements.map((el) => {
      if (el.type === 'image' || el.type === 'video') {
        const src = el.src as string | undefined;
        if (src && !/^(http|data:|blob:)/.test(src)) {
          const clean = src.replace(/^\/+/, '');
          const filename = clean.split('/').pop() ?? clean;
          const resolved =
            mediaUrls.get(clean) ??
            mediaUrls.get(filename) ??
            (base ? `${base}/${clean}` : undefined);
          if (resolved) return { ...el, src: resolved };
        }
      }
      return el;
    });
    return c;
  }

  return content;
}

export async function loadUniversalFromZip(
  zipInput: Blob | File | ArrayBuffer | string,
  options: UniversalLoadOptions = {},
): Promise<ClassroomData> {
  const JSZip = (await import('jszip')).default;

  let zipBlob: Blob;
  if (typeof zipInput === 'string') {
    // 1. Try server-side progressive streaming API first (instant manifest load)
    try {
      const streamApiUrl = appendAuthToken(`/api/classroom-zip/data?zip=${encodeURIComponent(zipInput)}`);
      const apiRes = await fetch(streamApiUrl);
      if (apiRes.ok) {
        const json = await apiRes.json() as any;
        if (json?.data) {
          if (isClassroomDataFormat(json.data)) {
            return json.data;
          }
          if (isManifestFormat(json.data)) {
            return transformManifestToClassroomData(json.data, new Map(), options);
          }
          return json.data as ClassroomData;
        }
      }
    } catch (_err) {
      // Fall through to full ZIP fetch
    }

    const res = await fetch(appendAuthToken(zipInput));
    if (!res.ok) throw new Error(`Failed to fetch ZIP from URL: HTTP ${res.status}`);
    zipBlob = await res.blob();
  } else if (zipInput instanceof ArrayBuffer) {
    zipBlob = new Blob([zipInput], { type: 'application/zip' });
  } else {
    zipBlob = zipInput;
  }

  const zip = await JSZip.loadAsync(zipBlob);
  const mediaUrls = new Map<string, string>();
  // Only import images and video (not audio)
  const mediaRegex = /\.(png|jpg|jpeg|gif|webp|svg|mp4|webm)$/i;
  const mediaFiles = zip.file(mediaRegex);
  for (const file of mediaFiles) {
    const blob = await file.async('blob');
    const url = URL.createObjectURL(blob);
    mediaUrls.set(file.name, url);
    const basename = file.name.split('/').pop();
    if (basename && basename !== file.name) {
      mediaUrls.set(basename, url);
    }
  }

  const manifestFile = zip.file(/(?:^|\/)manifest\.json$/i)[0];
  if (manifestFile) {
    const text = await manifestFile.async('string');
    const manifest = JSON.parse(text) as ClassroomManifest;
    return transformManifestToClassroomData(manifest, mediaUrls, options);
  }

  const classroomFile = zip.file(/(?:^|\/)classroom\.json$/i)[0] || zip.file(/(?:^|\/)classdata\.json$/i)[0];
  if (classroomFile) {
    const text = await classroomFile.async('string');
    const data = JSON.parse(text) as ClassroomData;
    return patchClassroomDataMedia(data, mediaUrls, options.mediaBaseUrl);
  }

  throw new Error('ZIP contains neither manifest.json nor classroom.json');
}

export async function loadUniversalFromJson(
  jsonInput: string | File | Blob,
  options: UniversalLoadOptions = {},
): Promise<ClassroomData> {
  let text: string;

  if (jsonInput instanceof File || jsonInput instanceof Blob) {
    text = await jsonInput.text();
  } else if (typeof jsonInput === 'string') {
    const trimmed = jsonInput.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const res = await fetch(appendAuthToken(trimmed));
      if (!res.ok) throw new Error(`Failed to fetch JSON from URL (HTTP ${res.status})`);
      text = await res.text();
    } else {
      text = trimmed;
    }
  } else {
    throw new Error('Invalid JSON input');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON syntax error: ${(e as Error).message}`);
  }

  if (isClassroomDataFormat(parsed)) {
    return patchClassroomDataMedia(parsed, new Map(), options.mediaBaseUrl);
  }

  if (isManifestFormat(parsed)) {
    return transformManifestToClassroomData(parsed, new Map(), options);
  }

  if (parsed && typeof parsed === 'object' && 'classroom' in parsed) {
    const inner = (parsed as any).classroom;
    if (isClassroomDataFormat(inner)) {
      return patchClassroomDataMedia(inner, new Map(), options.mediaBaseUrl);
    }
  }

  throw new Error('JSON format not recognized: expected OpenMAIC manifest or classroom DSL shape');
}

function patchClassroomDataMedia(
  data: ClassroomData,
  mediaUrls: Map<string, string>,
  mediaBaseUrl?: string,
): ClassroomData {
  const base = mediaBaseUrl ? mediaBaseUrl.replace(/\/$/, '') : '';

  data.scenes?.forEach((scene) => {
    if (scene.type === 'slide' && (scene.content as any)?.canvas?.elements) {
      (scene.content as any).canvas.elements.forEach((el: any) => {
        if ((el.type === 'image' || el.type === 'video') && el.src && !/^(http|data:|blob:)/.test(el.src)) {
          const clean = el.src.replace(/^\/+/, '');
          const filename = clean.split('/').pop() ?? clean;
          el.src = mediaUrls.get(clean) ?? mediaUrls.get(filename) ?? (base ? `${base}/${clean}` : el.src);
        }
      });
    }
    scene.actions?.forEach((a: any) => {
      if (a.type === 'speech') {
        if (a.audioUrl && !/^(http|data:|blob:)/.test(a.audioUrl)) {
          const clean = a.audioUrl.replace(/^\/+/, '');
          const filename = clean.split('/').pop() ?? clean;
          a.audioUrl =
            mediaUrls.get(clean) ?? mediaUrls.get(filename) ?? (base ? `${base}/${clean}` : a.audioUrl);
        }
        if (a.visualUrl && !/^(http|data:|blob:)/.test(a.visualUrl)) {
          const clean = a.visualUrl.replace(/^\/+/, '');
          const filename = clean.split('/').pop() ?? clean;
          a.visualUrl =
            mediaUrls.get(clean) ?? mediaUrls.get(filename) ?? (base ? `${base}/${clean}` : a.visualUrl);
        }
      }
    });
  });

  return {
    ...data,
    scenesCount: data.scenes?.length ?? 0,
  };
}

export async function loadUniversalFromClassId(
  classId: string,
  options: UniversalLoadOptions = {},
): Promise<ClassroomData> {
  const cleanId = classId.trim().replace(/^\/+|\/+$/g, '');
  if (!cleanId) throw new Error('Class ID is required');

  const workerUrl = (options.workerUrl || window.location.origin).replace(/\/$/, '');
  const codeParam = options.accessCode ? `?code=${encodeURIComponent(options.accessCode)}` : '';

  // 1. Try ZIP from Worker/R2: /classrooms/<id>.maic.zip or /<id>.zip
  const zipCandidates = [
    `${workerUrl}/classrooms/${cleanId}.maic.zip${codeParam}`,
    `${workerUrl}/classrooms/${cleanId}.zip${codeParam}`,
    `${workerUrl}/${cleanId}.maic.zip${codeParam}`,
    `${workerUrl}/${cleanId}.zip${codeParam}`,
  ];

  for (const zipUrl of zipCandidates) {
    try {
      const res = await fetch(appendAuthToken(zipUrl), { method: 'HEAD' });
      if (res.ok) {
        return await loadUniversalFromZip(zipUrl, options);
      }
    } catch {}
  }

  // 2. Try Folder / JSON direct proxy from Worker: /classrooms/<id>/classroom.json
  const jsonCandidates = [
    `${workerUrl}/classrooms/${cleanId}/classroom.json${codeParam}`,
    `${workerUrl}/classrooms/${cleanId}/manifest.json${codeParam}`,
    `${workerUrl}/${cleanId}/classroom.json${codeParam}`,
    `${workerUrl}/${cleanId}/manifest.json${codeParam}`,
    `${workerUrl}/${cleanId}${codeParam}`,
  ];

  for (const jsonUrl of jsonCandidates) {
    try {
      const res = await fetch(appendAuthToken(jsonUrl));
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('zip') || jsonUrl.endsWith('.zip')) {
          const blob = await res.blob();
          return await loadUniversalFromZip(blob, options);
        }
        const text = await res.text();
        const folderBase = jsonUrl.substring(0, jsonUrl.lastIndexOf('/'));
        return await loadUniversalFromJson(text, { ...options, mediaBaseUrl: folderBase });
      }
    } catch {}
  }

  throw new Error(`Classroom "${cleanId}" could not be found.`);
}

export function revokeUniversalUrls(data: ClassroomData): void {
  const urls = new Set<string>();
  const collect = (u: string | undefined) => {
    if (u && u.startsWith('blob:')) urls.add(u);
  };
  for (const scene of data.scenes || []) {
    if (scene.type === 'slide' && (scene.content as any)?.canvas?.elements) {
      (scene.content as any).canvas.elements.forEach((el: any) => {
        collect(el.src);
      });
    }
    for (const a of scene.actions ?? []) {
      const action = a as Action & { audioUrl?: string; visualUrl?: string };
      collect(action.audioUrl);
      collect(action.visualUrl);
    }
  }
  for (const u of urls) URL.revokeObjectURL(u);
}
