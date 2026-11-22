import type { AudioVoiceName, LanguageCode } from '../types/library';
import {
  buildAudioBlobCacheKey,
  getCachedAudioBlobFromDb,
  putCachedAudioBlobInDb,
} from './offlineAudioCache';

export interface TtsVoiceOption {
  id: AudioVoiceName;
  label: string;
  description: string;
}

export const STUDIO_VOICES: TtsVoiceOption[] = [
  { id: 'Kore', label: 'Kore', description: 'Warm, clear studio narrator' },
  { id: 'Charon', label: 'Charon', description: 'Deep, authoritative legal voice' },
  { id: 'Zephyr', label: 'Zephyr', description: 'Calm, articulate documentary tone' },
  { id: 'Puck', label: 'Puck', description: 'Bright, engaging civic explainer' },
  { id: 'Fenrir', label: 'Fenrir', description: 'Resonant historical storytelling' },
];

export interface FetchTtsOptions {
  persistToIndexedDb?: boolean;
  bookId?: string;
  chapterId?: string;
  segmentId?: string;
}

const clipUrlCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

/**
 * Fetches a raw WAV audio Blob directly from the server TTS route.
 */
export async function fetchTtsAudioBlobFromServer(
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName = 'Kore',
  signal?: AbortSignal
): Promise<Blob> {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error('Cannot generate audio for empty text.');
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'You are offline and this audio section is not saved in offline storage yet. Save the chapter while online to listen offline.'
    );
  }

  const response = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: normalized,
      language,
      voiceName,
    }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `Audio clip generation failed (${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) errorMessage = data.error;
    } catch {
      // Keep HTTP fallback message
    }
    throw new Error(errorMessage);
  }

  const blob = await response.blob();
  if (blob.size < 44) {
    throw new Error('Received empty audio clip from narration server.');
  }

  return blob;
}

/**
 * Resolves a playable ObjectURL for a narration segment:
 * 1) In-memory ObjectURL cache (0ms)
 * 2) IndexedDB offline audio blob store (works 100% without internet)
 * 3) Live `/api/tts` neural narration fetch (and optional IndexedDB persistence)
 */
export async function fetchTtsAudioClipUrl(
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName = 'Kore',
  signal?: AbortSignal,
  options?: FetchTtsOptions
): Promise<string> {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error('Cannot generate audio for empty text.');
  }

  const cacheKey = buildAudioBlobCacheKey(normalized, language, voiceName);
  const existingUrl = clipUrlCache.get(cacheKey);
  if (existingUrl) {
    return existingUrl;
  }

  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const requestPromise = (async () => {
    // Offline-first check: serve directly from IndexedDB if this clip was previously saved
    const cachedBlob = await getCachedAudioBlobFromDb(normalized, language, voiceName);
    if (cachedBlob && cachedBlob.size >= 44) {
      const offlineUrl = URL.createObjectURL(cachedBlob);
      clipUrlCache.set(cacheKey, offlineUrl);
      return offlineUrl;
    }

    const blob = await fetchTtsAudioBlobFromServer(normalized, language, voiceName, signal);

    if (options?.persistToIndexedDb) {
      await putCachedAudioBlobInDb({
        text: normalized,
        language,
        voiceName,
        blob,
        bookId: options.bookId,
        chapterId: options.chapterId,
        segmentId: options.segmentId,
      });
    }

    const objectUrl = URL.createObjectURL(blob);
    clipUrlCache.set(cacheKey, objectUrl);
    return objectUrl;
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}

export function prefetchTtsAudioClip(
  text: string,
  language: LanguageCode,
  voiceName: AudioVoiceName = 'Kore',
  options?: FetchTtsOptions
): void {
  const normalized = text.trim();
  if (!normalized) return;
  const cacheKey = buildAudioBlobCacheKey(normalized, language, voiceName);
  if (clipUrlCache.has(cacheKey) || inFlightRequests.has(cacheKey)) return;
  void fetchTtsAudioClipUrl(normalized, language, voiceName, undefined, options).catch(() => {
    // Silent prefetch failure; foreground playback will retry and report if needed
  });
}

export function clearMemoryAudioClipUrls(): void {
  for (const url of clipUrlCache.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revoke errors
    }
  }
  clipUrlCache.clear();
}
