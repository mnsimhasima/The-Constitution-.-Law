export const MIN_CHAPTER_AUDIO_SPEED = 0.5;
export const MAX_CHAPTER_AUDIO_SPEED = 2.0;
export const CHAPTER_AUDIO_SPEED_STEP = 0.05;
export const CHAPTER_SPEED_STORAGE_KEY = 'constitution_law_chapter_speeds_v1';

export const CHAPTER_SPEED_PRESETS: readonly number[] = [
  0.5,
  0.75,
  1,
  1.25,
  1.5,
  1.75,
  2,
];

export function buildChapterSpeedKey(bookId: string, chapterId: string): string {
  return `${bookId}::${chapterId}`;
}

/**
 * Clamps an audio playback speed strictly within [0.5, 2.0] and rounds to the
 * nearest 0.05x increment to prevent floating-point drift (e.g. 1.1500000000000001).
 */
export function normalizeAudioSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  const clamped = Math.min(MAX_CHAPTER_AUDIO_SPEED, Math.max(MIN_CHAPTER_AUDIO_SPEED, speed));
  const rounded = Math.round(clamped / CHAPTER_AUDIO_SPEED_STEP) * CHAPTER_AUDIO_SPEED_STEP;
  return Number(rounded.toFixed(2));
}

export function stepChapterAudioSpeed(
  currentSpeed: number,
  direction: -1 | 1,
  step = CHAPTER_AUDIO_SPEED_STEP
): number {
  return normalizeAudioSpeed(currentSpeed + direction * step);
}

/**
 * Formats speed cleanly: 0.5x, 0.75x, 1.0x, 1.15x, 1.5x, 2.0x.
 */
export function formatAudioSpeedLabel(speed: number): string {
  const normalized = normalizeAudioSpeed(speed);
  const hundredths = Math.round(normalized * 100) % 10;
  return `${hundredths === 0 ? normalized.toFixed(1) : normalized.toFixed(2)}x`;
}

export interface ResolvedChapterSpeed {
  effectiveSpeed: number;
  isChapterOverride: boolean;
  chapterSpeed: number | null;
  globalSpeed: number;
  chapterKey: string | null;
}

export function resolveEffectivePlaybackSpeed(
  chapterSpeeds: Record<string, number> | undefined,
  bookId: string | null | undefined,
  chapterId: string | null | undefined,
  globalSpeed: number
): ResolvedChapterSpeed {
  const normalizedGlobal = normalizeAudioSpeed(globalSpeed);
  if (!bookId || !chapterId) {
    return {
      effectiveSpeed: normalizedGlobal,
      isChapterOverride: false,
      chapterSpeed: null,
      globalSpeed: normalizedGlobal,
      chapterKey: null,
    };
  }

  const chapterKey = buildChapterSpeedKey(bookId, chapterId);
  const rawOverride = chapterSpeeds?.[chapterKey];
  if (typeof rawOverride === 'number' && Number.isFinite(rawOverride)) {
    const normalizedChapter = normalizeAudioSpeed(rawOverride);
    return {
      effectiveSpeed: normalizedChapter,
      isChapterOverride: true,
      chapterSpeed: normalizedChapter,
      globalSpeed: normalizedGlobal,
      chapterKey,
    };
  }

  return {
    effectiveSpeed: normalizedGlobal,
    isChapterOverride: false,
    chapterSpeed: null,
    globalSpeed: normalizedGlobal,
    chapterKey,
  };
}

export function setChapterAudioSpeedInMap(
  chapterSpeeds: Record<string, number>,
  bookId: string,
  chapterId: string,
  speed: number
): Record<string, number> {
  const key = buildChapterSpeedKey(bookId, chapterId);
  const normalized = normalizeAudioSpeed(speed);
  if (chapterSpeeds[key] === normalized) return chapterSpeeds;
  return {
    ...chapterSpeeds,
    [key]: normalized,
  };
}

export function clearChapterAudioSpeedInMap(
  chapterSpeeds: Record<string, number>,
  bookId: string,
  chapterId: string
): Record<string, number> {
  const key = buildChapterSpeedKey(bookId, chapterId);
  if (!(key in chapterSpeeds)) return chapterSpeeds;
  const next = { ...chapterSpeeds };
  delete next[key];
  return next;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadChapterSpeedsFromStorage(storage?: StorageLike | null): Record<string, number> {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return {};
  try {
    const raw = target.getItem(CHAPTER_SPEED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const sanitized: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value) && key.includes('::')) {
        sanitized[key] = normalizeAudioSpeed(value);
      }
    }
    return sanitized;
  } catch {
    return {};
  }
}

export function saveChapterSpeedsToStorage(
  chapterSpeeds: Record<string, number>,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(CHAPTER_SPEED_STORAGE_KEY, JSON.stringify(chapterSpeeds));
  } catch {
    // Ignore storage quota or privacy-mode errors
  }
}
