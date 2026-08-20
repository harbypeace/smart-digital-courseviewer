/**
 * ZIP loader — extract classroom.json + media from a ZIP file.
 * Requires `jszip` as an optional peer dependency.
 *
 * Usage:
 *   import { loadClassroomFromZip } from '@openmaic/viewer/zip';
 *   const data = await loadClassroomFromZip(zipBlob, { mediaBaseUrl: '/media/' });
 */

import type { ClassroomData } from './types';

interface ZipLoadOptions {
  /** Base URL for resolving media paths extracted from the ZIP */
  mediaBaseUrl?: string;
}

export async function loadFromZip(zipBlob: Blob, options?: ZipLoadOptions): Promise<ClassroomData> {
  // Dynamic import — JSZip is an optional dependency
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);

  // Find classroom JSON
  const jsonFile = zip.file(/classroom\.json$/i)[0];
  if (!jsonFile) throw new Error('No classroom.json found in ZIP');
  const text = await jsonFile.async('string');
  const data = JSON.parse(text) as ClassroomData;

  const base = options?.mediaBaseUrl ? options.mediaBaseUrl.replace(/\/$/, '') : '';

  // Rewrite image/video/audio paths
  data.scenes?.forEach(scene => {
    if (scene.type === 'slide' && (scene.content as any)?.canvas?.elements) {
      (scene.content as any).canvas.elements.forEach((el: any) => {
        if (el.type === 'image' && el.src && !/^(http|data:|blob:)/.test(el.src)) {
          el.src = `${base}/${el.src.replace(/^\//, '')}`;
        }
        if (el.type === 'video' && el.src && !/^(http|data:|blob:)/.test(el.src)) {
          el.src = `${base}/${el.src.replace(/^\//, '')}`;
        }
      });
    }
    scene.actions?.forEach((a: any) => {
      if (a.type === 'speech' && a.audioUrl && !/^(http|data:|blob:)/.test(a.audioUrl)) {
        a.audioUrl = `${base}/${a.audioUrl.replace(/^\//, '')}`;
      }
      if (a.type === 'speech' && a.visualUrl && !/^(http|data:|blob:)/.test(a.visualUrl)) {
        a.visualUrl = `${base}/${a.visualUrl.replace(/^\//, '')}`;
      }
    });
  });

  return data;
}

/**
 * Extract media files from a ZIP and return them as Object URLs.
 * Useful when you want to serve media directly from the ZIP without a server.
 */
export async function extractMediaFromZip(
  zipBlob: Blob,
): Promise<Map<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(zipBlob);
  const urls = new Map<string, string>();

  const mediaFiles = zip.file(/\.(png|jpg|jpeg|gif|webp|svg|mp3|wav|ogg|mp4|webm)$/i);
  for (const file of mediaFiles) {
    const blob = await file.async('blob');
    urls.set(file.name, URL.createObjectURL(blob));
  }

  return urls;
}
