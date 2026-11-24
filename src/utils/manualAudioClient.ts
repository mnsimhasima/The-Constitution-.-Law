import type { AudioVoiceName, LanguageCode } from '../types/library';
import { getCachedAudioBlobFromDb, putCachedAudioBlobInDb } from './offlineAudioCache';
import { getOttOfflineVaultStore } from './ottOfflineVault';

/**
 * Resolves a manually uploaded audio file URL for strictly 1-to-1 native playback.
 * Never invokes AI Text-to-Speech.
 *
 * Resolution order:
 * 1. In-memory object URL cache (instant replay)
 * 2. Private IndexedDB offline vaults (`ottOfflineVault` or `offlineAudioCache`)
 * 3. Direct fetch of the manually uploaded audio file (`/api/books-structures/audio/...`)
 */
const memoryAudioUrlCache = new Map<string, string>();
const inFlightManualAudio = new Map<string, Promise<string>>();

export async function fetchManualAudioBlobFromServer(
  audioUrl: string,
  signal?: AbortSignal
): Promise<Blob> {
  const cleanUrl = audioUrl.trim();
  if (!cleanUrl) {
    throw new Error('No manual audio file is attached to this content block yet.');
  }

  const response = await fetch(cleanUrl, {
    method: 'GET',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Unable to load uploaded audio file (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (blob.size < 44) {
    throw new Error('Uploaded audio file appears empty or unreadable.');
  }
  return blob;
}

export async function resolveManualAudioClipUrl(
  audioUrl: string,
  language: LanguageCode,
  signal?: AbortSignal,
  cacheOptions?: {
    persistToIndexedDb?: boolean;
    bookId?: string;
    chapterId?: string;
    segmentId?: string;
  }
): Promise<string> {
  const cleanUrl = audioUrl.trim();
  if (!cleanUrl) {
    throw new Error(
      'No manual audio file uploaded for this block yet. Upload an audio file in Books & Structures CMS.'
    );
  }

  const memHit = memoryAudioUrlCache.get(cleanUrl);
  if (memHit) return memHit;

  // 1. Check private in-app Books & Structures offline vault first
  try {
    const vaultHit = await getOttOfflineVaultStore().getAudioBlob(cleanUrl);
    if (vaultHit?.blob && vaultHit.blob.size >= 44) {
      const url = URL.createObjectURL(vaultHit.blob);
      memoryAudioUrlCache.set(cleanUrl, url);
      return url;
    }
  } catch {
    // Continue to chapter cache / network
  }

  // 2. Check chapter offline cache keyed by URL
  const voiceKey: AudioVoiceName = 'manual';
  const dbHit = await getCachedAudioBlobFromDb(cleanUrl, language, voiceKey);
  if (dbHit && dbHit.size >= 44) {
    const url = URL.createObjectURL(dbHit);
    memoryAudioUrlCache.set(cleanUrl, url);
    return url;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'You are offline and this audio file has not been downloaded to private in-app storage yet.'
    );
  }

  const existingPromise = inFlightManualAudio.get(cleanUrl);
  if (existingPromise) {
    return existingPromise;
  }

  const requestPromise = (async () => {
    const blob = await fetchManualAudioBlobFromServer(cleanUrl, signal);
    const objectUrl = URL.createObjectURL(blob);
    memoryAudioUrlCache.set(cleanUrl, objectUrl);

    if (cacheOptions?.persistToIndexedDb) {
      void putCachedAudioBlobInDb({
        text: cleanUrl,
        language,
        voiceName: voiceKey,
        blob,
        bookId: cacheOptions.bookId,
        chapterId: cacheOptions.chapterId,
        segmentId: cacheOptions.segmentId,
      });
    }

    return objectUrl;
  })().finally(() => {
    inFlightManualAudio.delete(cleanUrl);
  });

  inFlightManualAudio.set(cleanUrl, requestPromise);
  return requestPromise;
}

export function prefetchManualAudioClip(
  audioUrl: string | undefined,
  language: LanguageCode,
  cacheOptions?: {
    persistToIndexedDb?: boolean;
    bookId?: string;
    chapterId?: string;
    segmentId?: string;
  }
): void {
  if (!audioUrl?.trim()) return;
  if (memoryAudioUrlCache.has(audioUrl.trim())) return;
  void resolveManualAudioClipUrl(audioUrl, language, undefined, cacheOptions).catch(() => {
    // Non-fatal background warm
  });
}

export function clearMemoryAudioClipUrls(): void {
  for (const url of memoryAudioUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revoke errors
    }
  }
  memoryAudioUrlCache.clear();
}
