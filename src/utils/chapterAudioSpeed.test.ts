import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChapterSpeedKey,
  CHAPTER_SPEED_PRESETS,
  clearChapterAudioSpeedInMap,
  formatAudioSpeedLabel,
  loadChapterSpeedsFromStorage,
  MAX_CHAPTER_AUDIO_SPEED,
  MIN_CHAPTER_AUDIO_SPEED,
  normalizeAudioSpeed,
  resolveEffectivePlaybackSpeed,
  saveChapterSpeedsToStorage,
  setChapterAudioSpeedInMap,
  stepChapterAudioSpeed,
} from './chapterAudioSpeed';

test('normalizeAudioSpeed clamps strictly to 0.5x–2.0x and snaps to 0.05x increments', () => {
  assert.equal(normalizeAudioSpeed(0.1), MIN_CHAPTER_AUDIO_SPEED);
  assert.equal(normalizeAudioSpeed(3.4), MAX_CHAPTER_AUDIO_SPEED);
  assert.equal(normalizeAudioSpeed(1.13), 1.15);
  assert.equal(normalizeAudioSpeed(1.12), 1.1);
  assert.equal(normalizeAudioSpeed(0.5500000000000001), 0.55);
  assert.equal(normalizeAudioSpeed(Number.NaN), 1);
});

test('stepChapterAudioSpeed increments and decrements cleanly without exceeding bounds', () => {
  assert.equal(stepChapterAudioSpeed(1.0, 1), 1.05);
  assert.equal(stepChapterAudioSpeed(1.05, 1), 1.1);
  assert.equal(stepChapterAudioSpeed(1.0, -1), 0.95);
  assert.equal(stepChapterAudioSpeed(0.5, -1), 0.5);
  assert.equal(stepChapterAudioSpeed(2.0, 1), 2.0);
});

test('formatAudioSpeedLabel renders crisp 1-decimal or 2-decimal labels across 0.5x–2.0x', () => {
  assert.equal(formatAudioSpeedLabel(0.5), '0.5x');
  assert.equal(formatAudioSpeedLabel(0.75), '0.75x');
  assert.equal(formatAudioSpeedLabel(1), '1.0x');
  assert.equal(formatAudioSpeedLabel(1.15), '1.15x');
  assert.equal(formatAudioSpeedLabel(1.5), '1.5x');
  assert.equal(formatAudioSpeedLabel(2), '2.0x');
  assert.deepEqual([...CHAPTER_SPEED_PRESETS], [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
});

test('resolveEffectivePlaybackSpeed isolates chapter overrides from other chapters and global speed', () => {
  let map: Record<string, number> = {};
  map = setChapterAudioSpeedInMap(map, 'magna-carta', 'mc-ch1', 1.35);

  // Chapter with override uses its own speed regardless of global speed
  const magna = resolveEffectivePlaybackSpeed(map, 'magna-carta', 'mc-ch1', 1.0);
  assert.equal(magna.effectiveSpeed, 1.35);
  assert.equal(magna.isChapterOverride, true);
  assert.equal(magna.chapterSpeed, 1.35);
  assert.equal(magna.chapterKey, buildChapterSpeedKey('magna-carta', 'mc-ch1'));

  // Different chapter falls back to global speed untouched
  const india = resolveEffectivePlaybackSpeed(map, 'india-constitution', 'in-part3', 1.0);
  assert.equal(india.effectiveSpeed, 1.0);
  assert.equal(india.isChapterOverride, false);
  assert.equal(india.chapterSpeed, null);

  // Clearing the override restores global default for that chapter
  const cleared = clearChapterAudioSpeedInMap(map, 'magna-carta', 'mc-ch1');
  const magnaAfterClear = resolveEffectivePlaybackSpeed(cleared, 'magna-carta', 'mc-ch1', 1.25);
  assert.equal(magnaAfterClear.effectiveSpeed, 1.25);
  assert.equal(magnaAfterClear.isChapterOverride, false);
});

test('loadChapterSpeedsFromStorage and saveChapterSpeedsToStorage round-trip and sanitize entries', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  saveChapterSpeedsToStorage(
    {
      'magna-carta::mc-ch1': 0.65,
      'india-constitution::in-part3': 1.85,
    },
    mockStorage
  );

  const loaded = loadChapterSpeedsFromStorage(mockStorage);
  assert.deepEqual(loaded, {
    'magna-carta::mc-ch1': 0.65,
    'india-constitution::in-part3': 1.85,
  });

  // Malformed or out-of-range values are sanitized safely
  mockStorage.setItem(
    'constitution_law_chapter_speeds_v1',
    JSON.stringify({ 'book::ch1': 4.5, 'badkey': 1.2, 'book::ch2': 'fast' })
  );
  assert.deepEqual(loadChapterSpeedsFromStorage(mockStorage), {
    'book::ch1': 2.0,
  });
});
