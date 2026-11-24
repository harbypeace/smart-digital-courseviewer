import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listDownloadTasks,
  deleteDownloadTask,
  deleteLocalLesson,
  deleteLocalUnit,
  getLocalLesson,
  getStorageStats,
  requestPersistentStorage,
  type DownloadTaskRecord,
} from '../lib/storage/classroom-db';
import { deleteLessonMedia, checkPagesRangeCached, deletePagesRange } from '../lib/storage/media-cache';
import { getDownloadRunner } from '../lib/storage/download-runner';
import { cleanUnitCode, cleanLessonCode } from '../lib/utils';

export interface LessonDownloadTarget {
  subject: string;
  unit: string;
  lesson: string;
  classroomId: string;
  title?: string;
  zipUrl?: string;
  jsonUrl?: string;
}

export interface DownloadOptions {
  includeClassroom: boolean;
  includePages: boolean;
  pageRange?: { start: number; end: number };
}

export interface StorageStats {
  usedBytes: number;
  quotaBytes: number;
  isPersisted: boolean;
}

export interface UseDownloadManagerReturn {
  tasks: DownloadTaskRecord[];
  isDownloading: boolean;
  activeTask: DownloadTaskRecord | null;
  storageStats: StorageStats | null;
  downloadLesson: (target: LessonDownloadTarget) => Promise<void>;
  downloadLessonWithOptions: (
    target: LessonDownloadTarget,
    options?: Partial<DownloadOptions>,
    onPageProgress?: (current: number, total: number) => void
  ) => Promise<void>;
  downloadLessonPages: (
    subject: string,
    unit: string,
    lesson: string,
    startPage: number,
    endPage: number,
    onProgress?: (current: number, total: number) => void
  ) => Promise<void>;
  downloadUnit: (subject: string, unit: string, lessons: LessonDownloadTarget[]) => Promise<void>;
  cancelTask: (taskId: string) => void;
  deleteLesson: (subject: string, unit: string, lesson: string, classroomId: string) => Promise<void>;
  deletePagesOnly: (subject: string, unit: string, lesson: string, startPage: number, endPage: number) => Promise<void>;
  deleteUnit: (subject: string, unit: string) => Promise<void>;
  checkIsDownloaded: (subject: string, unit: string, lesson: string, classroomId: string) => Promise<boolean>;
  checkPagesStatus: (
    subject: string,
    unit: string,
    lesson: string,
    startPage: number,
    endPage: number
  ) => Promise<{ cachedPages: number[]; totalPages: number; isFullyCached: boolean }>;
  enablePersistentStorage: () => Promise<boolean>;
  refreshStats: () => Promise<void>;
}

export function useDownloadManager(): UseDownloadManagerReturn {
  const [tasks, setTasks] = useState<DownloadTaskRecord[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const unitQueueRef = useRef<LessonDownloadTarget[]>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  const refreshStats = useCallback(async () => {
    try {
      const stats = await getStorageStats();
      setStorageStats(stats);
    } catch {}
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const stored = await listDownloadTasks();
      setTasks(stored);
    } catch {}
  }, []);

  useEffect(() => {
    refreshStats();
    refreshTasks();

    const runner = getDownloadRunner();
    const unsubscribe = runner.subscribe((updatedTask) => {
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.taskId === updatedTask.taskId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedTask;
          return next;
        }
        return [updatedTask, ...prev];
      });

      if (updatedTask.status === 'completed' || updatedTask.status === 'error') {
        refreshStats();
        // Process next item in unit download queue if available
        processNextInUnitQueue();
      }
    });

    return () => unsubscribe();
  }, [refreshStats, refreshTasks]);

  const processNextInUnitQueue = useCallback(async () => {
    if (unitQueueRef.current.length === 0) {
      isProcessingQueueRef.current = false;
      return;
    }
    isProcessingQueueRef.current = true;
    const nextItem = unitQueueRef.current.shift();
    if (nextItem) {
      const runner = getDownloadRunner();
      await runner.startDownload(nextItem);
    }
  }, []);

  const downloadLesson = useCallback(async (target: LessonDownloadTarget) => {
    // Request persistent storage in background upon user interaction
    requestPersistentStorage().catch(() => {});
    const runner = getDownloadRunner();
    await runner.startDownload(target);
  }, []);

  const downloadLessonPages = useCallback(
    async (
      subject: string,
      unit: string,
      lesson: string,
      startPage: number,
      endPage: number,
      onProgress?: (current: number, total: number) => void
    ) => {
      requestPersistentStorage().catch(() => {});
      const runner = getDownloadRunner();
      await runner.downloadPrintedPages({
        subject,
        unit,
        lesson,
        startPage,
        endPage,
        onProgress,
      });
      await refreshStats();
    },
    [refreshStats]
  );

  const downloadLessonWithOptions = useCallback(
    async (
      target: LessonDownloadTarget,
      options?: Partial<DownloadOptions>,
      onPageProgress?: (current: number, total: number) => void
    ) => {
      requestPersistentStorage().catch(() => {});
      const includeClassroom = options?.includeClassroom !== false;
      const includePages = options?.includePages !== false;

      if (includeClassroom) {
        await downloadLesson(target);
      }

      if (includePages && options?.pageRange) {
        await downloadLessonPages(
          target.subject,
          target.unit,
          target.lesson,
          options.pageRange.start,
          options.pageRange.end,
          onPageProgress
        );
      }
    },
    [downloadLesson, downloadLessonPages]
  );

  const deletePagesOnly = useCallback(
    async (subject: string, unit: string, lesson: string, startPage: number, endPage: number) => {
      await deletePagesRange(subject, unit, lesson, startPage, endPage);
      await refreshStats();
    },
    [refreshStats]
  );

  const checkPagesStatus = useCallback(
    async (subject: string, unit: string, lesson: string, startPage: number, endPage: number) => {
      return await checkPagesRangeCached(subject, unit, lesson, startPage, endPage);
    },
    []
  );

  const downloadUnit = useCallback(async (subject: string, unit: string, lessons: LessonDownloadTarget[]) => {
    requestPersistentStorage().catch(() => {});
    if (!Array.isArray(lessons) || lessons.length === 0) return;

    // Filter out already completed items
    const toDownload: LessonDownloadTarget[] = [];
    for (const item of lessons) {
      const isDownloaded = await checkIsDownloaded(item.subject, item.unit, item.lesson, item.classroomId);
      if (!isDownloaded) {
        toDownload.push(item);
      }
    }

    if (toDownload.length === 0) return;

    unitQueueRef.current = [...unitQueueRef.current, ...toDownload];
    if (!isProcessingQueueRef.current) {
      processNextInUnitQueue();
    }
  }, [processNextInUnitQueue]);

  const cancelTask = useCallback((taskId: string) => {
    const runner = getDownloadRunner();
    runner.cancelDownload(taskId);
    unitQueueRef.current = unitQueueRef.current.filter((item) => {
      const itemTaskId = `${item.subject}/${cleanUnitCode(item.unit)}/${cleanLessonCode(item.lesson)}/${item.classroomId}`.toLowerCase();
      return itemTaskId !== taskId.toLowerCase();
    });
  }, []);

  const deleteLesson = useCallback(async (subject: string, unit: string, lesson: string, classroomId: string) => {
    const rec = await getLocalLesson(subject, unit, lesson, classroomId);
    if (rec && rec.mediaFiles?.length) {
      await deleteLessonMedia(rec.mediaFiles);
    }
    await deleteLocalLesson(subject, unit, lesson, classroomId);
    if (rec) {
      await deleteDownloadTask(rec.lessonKey);
    }
    await refreshTasks();
    await refreshStats();
  }, [refreshTasks, refreshStats]);

  const deleteUnit = useCallback(async (subject: string, unit: string) => {
    await deleteLocalUnit(subject, unit);
    await refreshTasks();
    await refreshStats();
  }, [refreshTasks, refreshStats]);

  const checkIsDownloaded = useCallback(async (subject: string, unit: string, lesson: string, classroomId: string): Promise<boolean> => {
    try {
      const record = await getLocalLesson(subject, unit, lesson, classroomId);
      return Boolean(record && record.isComplete);
    } catch {
      return false;
    }
  }, []);

  const enablePersistentStorage = useCallback(async (): Promise<boolean> => {
    const granted = await requestPersistentStorage();
    await refreshStats();
    return granted;
  }, [refreshStats]);

  const activeTask = tasks.find((t) => t.status === 'downloading') || null;
  const isDownloading = Boolean(activeTask) || unitQueueRef.current.length > 0;

  return {
    tasks,
    isDownloading,
    activeTask,
    storageStats,
    downloadLesson,
    downloadLessonWithOptions,
    downloadLessonPages,
    downloadUnit,
    cancelTask,
    deleteLesson,
    deletePagesOnly,
    deleteUnit,
    checkIsDownloaded,
    checkPagesStatus,
    enablePersistentStorage,
    refreshStats,
  };
}
