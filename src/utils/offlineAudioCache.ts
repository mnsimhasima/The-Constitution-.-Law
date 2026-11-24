import type {
  AudioMode,
  AudioVoiceName,
  CachedAudioBlobRecord,
  CachedChapterSummary,
  Chapter,
  ChapterCacheProgress,
  LanguageCode,
  LawBook,
} from '../types/library';
import { buildFullChapterPlaybackQueue, resolveBookDisplayTitle } from './audioQueueController';
import { getLocalizedText, localizeStructuralLabel } from './libraryLogic';

export const OFFLINE_AUDIO_DB_NAME = 'constitution_law_offline_audio_v1';
export const OFFLINE_AUDIO_DB_VERSION = 1;
export const AUDIO_BLOBS_STORE = 'audioBlobs';
export const CACHED_CHAPTERS_STORE = 'cachedChapters';

export interface AudioBlobStoreAdapter {
  getBlob(cacheKey: string): Promise<CachedAudioBlobRecord | null>;
  putBlob(record: CachedAudioBlobRecord): Promise<void>;
  deleteBlob(cacheKey: string): Promise<void>;
  getAllBlobs(): Promise<CachedAudioBlobRecord[]>;
  getChapter(chapterCacheKey: string): Promise<CachedChapterSummary | null>;
  putChapter(summary: CachedChapterSummary): Promise<void>;
  deleteChapter(chapterCacheKey: string): Promise<void>;
  getAllChapters(): Promise<CachedChapterSummary[]>;
  clearAll(): Promise<void>;
}

export type AudioBlobFetcher = (
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName,
  signal?: AbortSignal
) => Promise<Blob>;

/**
 * Shared deterministic cache key for every spoken audio clip across memory + IndexedDB.
 */
export function buildAudioBlobCacheKey(
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName
): string {
  return `${language}::${voiceName}::${text.trim()}`;
}

/**
 * Deterministic key identifying a cached chapter edition (book + chapter + language + voice + mode).
 */
export function buildChapterCacheKey(
  bookId: string,
  chapterId: string,
  language: LanguageCode,
  voiceName: AudioVoiceName,
  mode: AudioMode
): string {
  return `${bookId}::${chapterId}::${language}::${voiceName}::${mode}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
}

/**
 * In-memory adapter used in unit tests and as a graceful fallback if IndexedDB is blocked.
 */
export function createInMemoryAudioStore(): AudioBlobStoreAdapter {
  const blobs = new Map<string, CachedAudioBlobRecord>();
  const chapters = new Map<string, CachedChapterSummary>();

  return {
    async getBlob(cacheKey) {
      return blobs.get(cacheKey) ?? null;
    },
    async putBlob(record) {
      blobs.set(record.cacheKey, record);
    },
    async deleteBlob(cacheKey) {
      blobs.delete(cacheKey);
    },
    async getAllBlobs() {
      return Array.from(blobs.values());
    },
    async getChapter(chapterCacheKey) {
      return chapters.get(chapterCacheKey) ?? null;
    },
    async putChapter(summary) {
      chapters.set(summary.chapterCacheKey, summary);
    },
    async deleteChapter(chapterCacheKey) {
      chapters.delete(chapterCacheKey);
    },
    async getAllChapters() {
      return Array.from(chapters.values()).sort((a, b) => b.cachedAt.localeCompare(a.cachedAt));
    },
    async clearAll() {
      blobs.clear();
      chapters.clear();
    },
  };
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Real browser IndexedDB store persisting binary WAV audio Blobs and chapter manifests.
 */
export function createIndexedDbAudioStore(
  dbName: string = OFFLINE_AUDIO_DB_NAME
): AudioBlobStoreAdapter {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const openDb = (): Promise<IDBDatabase> => {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is unavailable in this environment.'));
    }
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, OFFLINE_AUDIO_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(AUDIO_BLOBS_STORE)) {
            const blobStore = db.createObjectStore(AUDIO_BLOBS_STORE, { keyPath: 'cacheKey' });
            blobStore.createIndex('by_chapterKey', 'chapterCacheKey', { unique: false });
          }
          if (!db.objectStoreNames.contains(CACHED_CHAPTERS_STORE)) {
            db.createObjectStore(CACHED_CHAPTERS_STORE, { keyPath: 'chapterCacheKey' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          dbPromise = null;
          reject(request.error ?? new Error('Unable to open offline audio IndexedDB.'));
        };
      });
    }
    return dbPromise;
  };

  return {
    async getBlob(cacheKey) {
      const db = await openDb();
      const tx = db.transaction(AUDIO_BLOBS_STORE, 'readonly');
      const result = await requestToPromise(
        tx.objectStore(AUDIO_BLOBS_STORE).get(cacheKey) as IDBRequest<CachedAudioBlobRecord | undefined>
      );
      return result ?? null;
    },
    async putBlob(record) {
      const db = await openDb();
      const tx = db.transaction(AUDIO_BLOBS_STORE, 'readwrite');
      tx.objectStore(AUDIO_BLOBS_STORE).put(record);
      await transactionDone(tx);
    },
    async deleteBlob(cacheKey) {
      const db = await openDb();
      const tx = db.transaction(AUDIO_BLOBS_STORE, 'readwrite');
      tx.objectStore(AUDIO_BLOBS_STORE).delete(cacheKey);
      await transactionDone(tx);
    },
    async getAllBlobs() {
      const db = await openDb();
      const tx = db.transaction(AUDIO_BLOBS_STORE, 'readonly');
      const result = await requestToPromise(
        tx.objectStore(AUDIO_BLOBS_STORE).getAll() as IDBRequest<CachedAudioBlobRecord[]>
      );
      return result ?? [];
    },
    async getChapter(chapterCacheKey) {
      const db = await openDb();
      const tx = db.transaction(CACHED_CHAPTERS_STORE, 'readonly');
      const result = await requestToPromise(
        tx.objectStore(CACHED_CHAPTERS_STORE).get(chapterCacheKey) as IDBRequest<
          CachedChapterSummary | undefined
        >
      );
      return result ?? null;
    },
    async putChapter(summary) {
      const db = await openDb();
      const tx = db.transaction(CACHED_CHAPTERS_STORE, 'readwrite');
      tx.objectStore(CACHED_CHAPTERS_STORE).put(summary);
      await transactionDone(tx);
    },
    async deleteChapter(chapterCacheKey) {
      const db = await openDb();
      const tx = db.transaction(CACHED_CHAPTERS_STORE, 'readwrite');
      tx.objectStore(CACHED_CHAPTERS_STORE).delete(chapterCacheKey);
      await transactionDone(tx);
    },
    async getAllChapters() {
      const db = await openDb();
      const tx = db.transaction(CACHED_CHAPTERS_STORE, 'readonly');
      const result = await requestToPromise(
        tx.objectStore(CACHED_CHAPTERS_STORE).getAll() as IDBRequest<CachedChapterSummary[]>
      );
      return (result ?? []).sort((a, b) => b.cachedAt.localeCompare(a.cachedAt));
    },
    async clearAll() {
      const db = await openDb();
      const tx = db.transaction([AUDIO_BLOBS_STORE, CACHED_CHAPTERS_STORE], 'readwrite');
      tx.objectStore(AUDIO_BLOBS_STORE).clear();
      tx.objectStore(CACHED_CHAPTERS_STORE).clear();
      await transactionDone(tx);
    },
  };
}

export interface CacheChapterParams {
  book: LawBook;
  chapter: Chapter;
  language: LanguageCode;
  voiceName: AudioVoiceName;
  mode: AudioMode;
  onProgress?: (progress: ChapterCacheProgress) => void;
  signal?: AbortSignal;
}

/**
 * Pure, dependency-injected manager for caching full sequential chapters in IndexedDB,
 * retrieving cached audio Blobs offline, and pruning orphaned Blobs on chapter removal.
 */
export function createChapterCacheManager(
  store: AudioBlobStoreAdapter,
  fetchBlob: AudioBlobFetcher
) {
  return {
    async getAudioBlob(
      text: string,
      language: LanguageCode,
      voiceName: AudioVoiceName
    ): Promise<Blob | null> {
      const key = buildAudioBlobCacheKey(text, language, voiceName);
      const record = await store.getBlob(key);
      return record?.blob ?? null;
    },

    async putAudioBlob(params: {
      text: string;
      language: LanguageCode;
      voiceName: AudioVoiceName;
      blob: Blob;
      bookId?: string;
      chapterId?: string;
      chapterCacheKey?: string;
      segmentId?: string;
    }): Promise<CachedAudioBlobRecord> {
      const cacheKey = buildAudioBlobCacheKey(params.text, params.language, params.voiceName);
      const record: CachedAudioBlobRecord = {
        cacheKey,
        chapterCacheKey: params.chapterCacheKey ?? 'standalone',
        bookId: params.bookId ?? 'standalone',
        chapterId: params.chapterId ?? 'standalone',
        segmentId: params.segmentId ?? cacheKey,
        language: params.language,
        voiceName: params.voiceName,
        mimeType: params.blob.type || 'audio/wav',
        byteSize: params.blob.size,
        blob: params.blob,
        cachedAt: new Date().toISOString(),
      };
      await store.putBlob(record);
      return record;
    },

    async cacheChapterAudio({
      book,
      chapter,
      language,
      voiceName,
      mode,
      onProgress,
      signal,
    }: CacheChapterParams): Promise<CachedChapterSummary> {
      const { queue } = buildFullChapterPlaybackQueue(book, chapter, language, mode, 0, true);
      const chapterCacheKey = buildChapterCacheKey(book.id, chapter.id, language, voiceName, mode);

      if (queue.length === 0) {
        throw new Error('This chapter has no audio segments to cache.');
      }

      onProgress?.({
        chapterCacheKey,
        status: 'caching',
        completedSegments: 0,
        totalSegments: queue.length,
        errorMessage: null,
      });

      const segmentKeys: string[] = [];
      let totalBytes = 0;

      for (let idx = 0; idx < queue.length; idx += 1) {
        if (signal?.aborted) {
          throw new DOMException('Offline audio caching was cancelled.', 'AbortError');
        }

        const seg = queue[idx];
        const sourceKey = seg.audioUrl?.trim() || seg.spokenText;
        const cacheKey = buildAudioBlobCacheKey(sourceKey, language, voiceName);
        segmentKeys.push(cacheKey);

        const existing = await store.getBlob(cacheKey);
        if (existing && existing.blob && existing.blob.size >= 44) {
          totalBytes += existing.byteSize || existing.blob.size;
        } else {
          const blob = await fetchBlob(sourceKey, language, voiceName, signal);
          if (blob.size < 44) {
            throw new Error(`Received invalid audio clip for ${seg.clauseNumber}.`);
          }
          const record: CachedAudioBlobRecord = {
            cacheKey,
            chapterCacheKey,
            bookId: book.id,
            chapterId: chapter.id,
            segmentId: seg.id,
            language,
            voiceName,
            mimeType: blob.type || 'audio/wav',
            byteSize: blob.size,
            blob,
            cachedAt: new Date().toISOString(),
          };
          await store.putBlob(record);
          totalBytes += blob.size;
        }

        onProgress?.({
          chapterCacheKey,
          status: idx + 1 === queue.length ? 'cached' : 'caching',
          completedSegments: idx + 1,
          totalSegments: queue.length,
          errorMessage: null,
        });
      }

      const summary: CachedChapterSummary = {
        chapterCacheKey,
        bookId: book.id,
        bookTitle: resolveBookDisplayTitle(book, language),
        chapterId: chapter.id,
        chapterNumber: localizeStructuralLabel(chapter.number, language),
        chapterTitle: getLocalizedText(chapter.title, language),
        language,
        voiceName,
        mode,
        segmentKeys,
        segmentCount: queue.length,
        totalBytes,
        cachedAt: new Date().toISOString(),
      };

      await store.putChapter(summary);
      return summary;
    },

    async removeCachedChapter(chapterCacheKey: string): Promise<void> {
      const target = await store.getChapter(chapterCacheKey);
      await store.deleteChapter(chapterCacheKey);
      if (!target) return;

      // Preserve any audio blobs still referenced by another cached chapter edition
      const remainingChapters = await store.getAllChapters();
      const retainedKeys = new Set<string>();
      for (const ch of remainingChapters) {
        for (const key of ch.segmentKeys) {
          retainedKeys.add(key);
        }
      }

      for (const key of target.segmentKeys) {
        if (!retainedKeys.has(key)) {
          await store.deleteBlob(key);
        }
      }
    },

    async listCachedChapters(): Promise<{
      chapters: CachedChapterSummary[];
      totalBytes: number;
    }> {
      const chapters = await store.getAllChapters();
      const blobs = await store.getAllBlobs();
      const totalBytes = blobs.reduce((acc, item) => acc + (item.byteSize || item.blob?.size || 0), 0);
      return { chapters, totalBytes };
    },

    async clearAllCachedAudio(): Promise<void> {
      await store.clearAll();
    },
  };
}

let singletonStore: AudioBlobStoreAdapter | null = null;

export function getOfflineAudioStore(): AudioBlobStoreAdapter {
  if (!singletonStore) {
    singletonStore =
      typeof indexedDB !== 'undefined'
        ? createIndexedDbAudioStore(OFFLINE_AUDIO_DB_NAME)
        : createInMemoryAudioStore();
  }
  return singletonStore;
}

export async function getCachedAudioBlobFromDb(
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName
): Promise<Blob | null> {
  try {
    const key = buildAudioBlobCacheKey(text, language, voiceName);
    const record = await getOfflineAudioStore().getBlob(key);
    return record?.blob ?? null;
  } catch {
    return null;
  }
}

export async function putCachedAudioBlobInDb(params: {
  text: string;
  language: LanguageCode;
  voiceName: AudioVoiceName;
  blob: Blob;
  bookId?: string;
  chapterId?: string;
  chapterCacheKey?: string;
  segmentId?: string;
}): Promise<void> {
  try {
    const cacheKey = buildAudioBlobCacheKey(params.text, params.language, params.voiceName);
    await getOfflineAudioStore().putBlob({
      cacheKey,
      chapterCacheKey: params.chapterCacheKey ?? 'auto-cache',
      bookId: params.bookId ?? 'auto-cache',
      chapterId: params.chapterId ?? 'auto-cache',
      segmentId: params.segmentId ?? cacheKey,
      language: params.language,
      voiceName: params.voiceName,
      mimeType: params.blob.type || 'audio/wav',
      byteSize: params.blob.size,
      blob: params.blob,
      cachedAt: new Date().toISOString(),
    });
  } catch {
    // Gracefully ignore IndexedDB quota or private mode restrictions
  }
}
