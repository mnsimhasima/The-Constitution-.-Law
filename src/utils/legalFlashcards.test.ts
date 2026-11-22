import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import {
  buildLibraryFlashcards,
  computeFlashcardStats,
  CORE_LEGAL_FLASHCARDS,
  filterFlashcards,
  loadFlashcardMasteryFromStorage,
  saveFlashcardMasteryToStorage,
  shuffleFlashcards,
  updateFlashcardMastery,
  type FlashcardMastery,
} from './legalFlashcards';

test('buildLibraryFlashcards binds valid source books/chapters from the library catalog', () => {
  const cards = buildLibraryFlashcards(INITIAL_LAW_BOOKS);
  assert.equal(cards.length, CORE_LEGAL_FLASHCARDS.length);
  assert.ok(cards.length >= 10);

  const habeas = cards.find((c) => c.id === 'fc-habeas-corpus');
  assert.ok(habeas);
  assert.equal(habeas.sourceBookId, 'india-constitution');
  assert.ok(habeas.sourceChapterId);
});

test('filterFlashcards supports topic tabs, review_only queue, and multilingual search queries', () => {
  const mastery: Record<string, FlashcardMastery> = {
    'fc-habeas-corpus': 'mastered',
    'fc-due-process': 'review',
  };

  const writs = filterFlashcards(CORE_LEGAL_FLASHCARDS, {
    category: 'writs_doctrines',
    query: '',
    masteryMap: mastery,
    language: 'en',
  });
  assert.ok(writs.length >= 3);
  assert.ok(writs.every((c) => c.topic === 'writs_doctrines'));

  // review_only excludes already mastered cards
  const reviewQueue = filterFlashcards(CORE_LEGAL_FLASHCARDS, {
    category: 'review_only',
    query: '',
    masteryMap: mastery,
    language: 'en',
  });
  assert.equal(reviewQueue.some((c) => c.id === 'fc-habeas-corpus'), false);
  assert.equal(reviewQueue.some((c) => c.id === 'fc-due-process'), true);

  // Telugu keyword search matches localized Telugu term
  const teluguHits = filterFlashcards(CORE_LEGAL_FLASHCARDS, {
    category: 'all',
    query: 'రాజ్యాంగ నైతికత',
    masteryMap: mastery,
    language: 'te',
  });
  assert.equal(teluguHits.length, 1);
  assert.equal(teluguHits[0].id, 'fc-constitutional-morality');
});

test('computeFlashcardStats and updateFlashcardMastery calculate mastery progress accurately', () => {
  let map: Record<string, FlashcardMastery> = {};
  map = updateFlashcardMastery(map, CORE_LEGAL_FLASHCARDS[0].id, 'mastered');
  map = updateFlashcardMastery(map, CORE_LEGAL_FLASHCARDS[1].id, 'mastered');
  map = updateFlashcardMastery(map, CORE_LEGAL_FLASHCARDS[2].id, 'review');

  const stats = computeFlashcardStats(CORE_LEGAL_FLASHCARDS, map);
  assert.equal(stats.total, CORE_LEGAL_FLASHCARDS.length);
  assert.equal(stats.mastered, 2);
  assert.equal(stats.needsReview, 1);
  assert.equal(stats.unseen, CORE_LEGAL_FLASHCARDS.length - 3);
  assert.equal(stats.masteryPercent, Math.round((2 / CORE_LEGAL_FLASHCARDS.length) * 100));
});

test('shuffleFlashcards returns a permutation without mutating the source array', () => {
  const originalIds = CORE_LEGAL_FLASHCARDS.map((c) => c.id);
  const shuffled = shuffleFlashcards(CORE_LEGAL_FLASHCARDS, 42);
  assert.equal(shuffled.length, CORE_LEGAL_FLASHCARDS.length);
  assert.deepEqual(
    CORE_LEGAL_FLASHCARDS.map((c) => c.id),
    originalIds
  );
  assert.deepEqual(
    [...shuffled.map((c) => c.id)].sort(),
    [...originalIds].sort()
  );
  assert.notDeepEqual(
    shuffled.map((c) => c.id),
    originalIds
  );
});

test('loadFlashcardMasteryFromStorage and saveFlashcardMasteryToStorage round-trip and sanitize', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };

  saveFlashcardMasteryToStorage(
    { 'fc-habeas-corpus': 'mastered', 'fc-due-process': 'review' },
    mockStorage
  );
  assert.deepEqual(loadFlashcardMasteryFromStorage(mockStorage), {
    'fc-habeas-corpus': 'mastered',
    'fc-due-process': 'review',
  });

  mockStorage.setItem(
    'constitution_law_flashcard_mastery_v1',
    JSON.stringify({ 'fc-habeas-corpus': 'mastered', bad: 'invalid_state' })
  );
  assert.deepEqual(loadFlashcardMasteryFromStorage(mockStorage), {
    'fc-habeas-corpus': 'mastered',
  });
});
