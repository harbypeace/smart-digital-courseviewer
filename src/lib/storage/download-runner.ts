/**
 * Download runner: bridges the UI/Hook and the Web Worker.
 * Provides fallback to asynchronous main-thread execution if Web Workers are restricted.
 */

import { buildLessonKey, saveDownloadTask, saveLocalLesson, type DownloadTaskRecord } from './classroom-db';
import { storePageImageBlob } from './media-cache';

export type DownloadProgressCallback = (task: DownloadTaskRecord) => void;

class DownloadRunner {
  private worker: Worker | null = null;
  private progressCallbacks = new Set<DownloadProgressCallback>();
  private activeTasks = new Map<string, DownloadTaskRecord>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(
        new URL('../../workers/downloader.worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.worker.onmessage = (event: MessageEvent) => {
        const { type, taskId, progress, downloadedBytes, totalBytes, error, lessonKey } = event.data || {};
        const task = this.activeTasks.get(taskId);
        if (!task) return;

        switch (type) {
          case 'PROGRESS': {
            task.progress = progress;
            task.downloadedBytes = downloadedBytes;
            task.totalBytes = totalBytes;
            task.status = 'downloading';
            saveDownloadTask({ ...task }).catch(() => {});
            this.notify(task);
            break;
          }
          case 'COMPLETED': {
            task.progress = 100;
            task.status = 'completed';
            task.completedAt = Date.now();
            saveDownloadTask({ ...task }).catch(() => {});
            this.notify(task);
            this.activeTasks.delete(taskId);
            break;
          }
          case 'ERROR': {
            task.status = 'error';
            task.errorMessage = error;
            saveDownloadTask({ ...task }).catch(() => {});
            this.notify(task);
            this.activeTasks.delete(taskId);
            break;
          }
          case 'CANCELLED': {
            task.status = 'paused';
            saveDownloadTask({ ...task }).catch(() => {});
            this.notify(task);
            this.activeTasks.delete(taskId);
            break;
          }
          default:
            break;
        }
      };

      this.worker.onerror = (err) => {
        console.warn('Downloader Worker error, will rely on fallback if needed:', err);
      };
    } catch (err) {
      console.warn('Unable to initialize downloader worker:', err);
      this.worker = null;
    }
  }

  public subscribe(cb: DownloadProgressCallback): () => void {
    this.progressCallbacks.add(cb);
    return () => this.progressCallbacks.delete(cb);
  }

  private notify(task: DownloadTaskRecord) {
    this.progressCallbacks.forEach((cb) => cb(task));
  }

  public async startDownload(params: {
    subject: string;
    unit: string;
    lesson: string;
    classroomId: string;
    title?: string;
    zipUrl?: string;
    jsonUrl?: string;
  }): Promise<void> {
    const taskId = buildLessonKey(params.subject, params.unit, params.lesson, params.classroomId);

    const taskRecord: DownloadTaskRecord = {
      taskId,
      subject: params.subject,
      unit: params.unit,
      lesson: params.lesson,
      classroomId: params.classroomId,
      title: params.title || `درس ${params.lesson}`,
      zipUrl: params.zipUrl,
      status: 'downloading',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      createdAt: Date.now(),
    };

    this.activeTasks.set(taskId, taskRecord);
    await saveDownloadTask(taskRecord);
    this.notify(taskRecord);

    if (this.worker) {
      this.worker.postMessage({
        type: 'START_DOWNLOAD',
        payload: {
          taskId,
          subject: params.subject,
          unit: params.unit,
          lesson: params.lesson,
          classroomId: params.classroomId,
          title: taskRecord.title,
          zipUrl: params.zipUrl,
          jsonUrl: params.jsonUrl,
        },
      });
    } else {
      // Main thread fallback
      this.executeMainThreadFallback(params, taskRecord);
    }
  }

  public cancelDownload(taskId: string): void {
    if (this.worker) {
      this.worker.postMessage({
        type: 'CANCEL_DOWNLOAD',
        payload: { taskId },
      });
    }
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = 'paused';
      this.notify(task);
      this.activeTasks.delete(taskId);
    }
  }

  private async executeMainThreadFallback(
    params: { subject: string; unit: string; lesson: string; classroomId: string; zipUrl?: string; jsonUrl?: string },
    taskRecord: DownloadTaskRecord,
  ) {
    try {
      taskRecord.progress = 50;
      this.notify(taskRecord);

      // Lazy import jszip on main thread
      const targetUrl = params.zipUrl || `/api/courses/classrooms/${params.subject}/${params.unit}/${params.lesson}/${params.classroomId}/classroom.zip`;

      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();

      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buf);
      const manifestFile = zip.file(/(?:^|\/)manifest\.json$/i)[0] || zip.file(/(?:^|\/)classroom\.json$/i)[0];
      if (!manifestFile) throw new Error('manifest.json not found in ZIP');

      const manifestText = await manifestFile.async('string');
      const data = JSON.parse(manifestText);

      await saveLocalLesson({
        lessonKey: taskRecord.taskId,
        subject: params.subject,
        unit: params.unit,
        lesson: params.lesson,
        classroomId: params.classroomId,
        title: taskRecord.title,
        scenesCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
        sizeBytes: buf.byteLength,
        classroomData: data,
        downloadedAt: Date.now(),
        mediaFiles: [],
        isComplete: true,
      });

      taskRecord.progress = 100;
      taskRecord.status = 'completed';
      taskRecord.completedAt = Date.now();
      await saveDownloadTask(taskRecord);
      this.notify(taskRecord);
    } catch (err: any) {
      taskRecord.status = 'error';
      taskRecord.errorMessage = err?.message || 'Download failed';
      await saveDownloadTask(taskRecord);
      this.notify(taskRecord);
    } finally {
      this.activeTasks.delete(taskRecord.taskId);
    }
  }

  /**
   * Downloads textbook page images strictly at 900px WebP resolution for offline studying.
   */
  public async downloadPrintedPages(params: {
    subject: string;
    unit: string;
    lesson: string;
    startPage: number;
    endPage: number;
    onProgress?: (current: number, total: number) => void;
  }): Promise<void> {
    const { subject, unit, lesson, startPage, endPage, onProgress } = params;
    const { generatePageImageCandidates } = await import('../utils');

    const start = Math.min(startPage, endPage);
    const end = Math.max(startPage, endPage);
    const total = Math.max(1, end - start + 1);

    for (let p = start; p <= end; p++) {
      const candidates = generatePageImageCandidates(subject, unit, lesson, p, start, 900);
      for (const url of candidates) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            await storePageImageBlob(subject, unit, lesson, p, blob);
            break;
          }
        } catch {}
      }
      if (onProgress) {
        onProgress(p - start + 1, total);
      }
    }
  }
}

let runnerInstance: DownloadRunner | null = null;

export function getDownloadRunner(): DownloadRunner {
  if (!runnerInstance) {
    runnerInstance = new DownloadRunner();
  }
  return runnerInstance;
}
