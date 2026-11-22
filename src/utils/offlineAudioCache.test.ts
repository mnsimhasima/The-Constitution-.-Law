import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import type { ChapterCacheProgress } from '../types/library';
import {
  buildAudioBlobCacheKey,
  buildChapterCacheKey,
  createChapterCacheManager,
  createInMemoryAudioStore,
  formatBytes,
} from './offlineAudioCache';

function makeFakeWavBlob(seed: string): Blob {
  // Minimal >44 byte buffer resembling a WAV clip payload
  const header = `RIFF____WAVEfmt ${seed.padEnd(64, 'x')}`;
  return new Blob([header], { type: 'audio/wav' });
}

test('buildAudioBlobCacheKey, buildChapterCacheKey, and formatBytes are deterministic', () => {
  assert.equal(
    buildAudioBlobCacheKey('  Hello World  ', 'te', 'Kore'),
    'te::Kore::Hello World'
  );
  assert.equal(
    buildChapterCacheKey('magna-carta', 'mc-due-process', 'te', 'Kore', 'both'),
    'magna-carta::mc-due-process::te::Kore::both'
  );
  assert.equal(formatBytes(0), '0 KB');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.00 MB');
});

test('cacheChapterAudio caches all 7 Magna Carta sequential segments and skips duplicates on re-cache', async () => {
  const magnaBook = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaBook);
  const chapter = magnaBook.chapters[0];
  assert.ok(chapter);

  const store = createInMemoryAudioStore();
  let fetchCalls = 0;

  const manager = createChapterCacheManager(store, async (text) => {
    fetchCalls += 1;
    return makeFakeWavBlob(`clip-${fetchCalls}-${text.slice(0, 12)}`);
  });

  const progressEvents: ChapterCacheProgress[] = [];
  const summary = await manager.cacheChapterAudio({
    book: magnaBook,
    chapter,
    language: 'te',
    voiceName: 'Kore',
    mode: 'both',
    onProgress: (evt) => progressEvents.push(evt),
  });

  assert.equal(summary.segmentCount, 7);
  assert.equal(summary.segmentKeys.length, 7);
  assert.equal(fetchCalls, 7);
  assert.ok(summary.totalBytes > 7 * 44);
  assert.equal(progressEvents[0]?.completedSegments, 0);
  assert.equal(progressEvents[0]?.status, 'caching');
  assert.equal(progressEvents.at(-1)?.completedSegments, 7);
  assert.equal(progressEvents.at(-1)?.status, 'cached');

  // Re-caching the same chapter must reuse every cached blob with 0 new network fetches
  const summaryAgain = await manager.cacheChapterAudio({
    book: magnaBook,
    chapter,
    language: 'te',
    voiceName: 'Kore',
    mode: 'both',
  });
  assert.equal(fetchCalls, 7);
  assert.equal(summaryAgain.totalBytes, summary.totalBytes);

  // Offline lookup retrieves cached blobs without hitting the fetcher
  const listed = await manager.listCachedChapters();
  assert.equal(listed.chapters.length, 1);
  assert.equal(listed.totalBytes, summary.totalBytes);
});

test('removeCachedChapter preserves blobs shared by another cached mode and clears orphaned blobs', async () => {
  const magnaBook = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaBook);
  const chapter = magnaBook.chapters[0];
  assert.ok(chapter);

  const store = createInMemoryAudioStore();
  const manager = createChapterCacheManager(store, async (text) => makeFakeWavBlob(text));

  // Cache both 'both' (7 segments) and 'text' (5 segments: header + 2 headlines + 2 texts, shared with 'both')
  const fullSummary = await manager.cacheChapterAudio({
    book: magnaBook,
    chapter,
    language: 'en',
    voiceName: 'Kore',
    mode: 'both',
  });
  const textSummary = await manager.cacheChapterAudio({
    book: magnaBook,
    chapter,
    language: 'en',
    voiceName: 'Kore',
    mode: 'text',
  });

  assert.equal(fullSummary.segmentCount, 7);
  assert.equal(textSummary.segmentCount, 5);
  assert.equal((await store.getAllBlobs()).length, 7);

  // Removing 'both' should delete the 2 explanation-only blobs while keeping the 5 blobs used by 'text'
  await manager.removeCachedChapter(fullSummary.chapterCacheKey);
  assert.equal((await store.getAllBlobs()).length, 5);
  assert.equal((await manager.listCachedChapters()).chapters.length, 1);

  // Clearing all removes everything cleanly
  await manager.clearAllCachedAudio();
  assert.equal((await store.getAllBlobs()).length, 0);
  assert.equal((await manager.listCachedChapters()).chapters.length, 0);
});
