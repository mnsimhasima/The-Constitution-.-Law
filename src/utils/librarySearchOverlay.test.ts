import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_STORAGE_KEY,
  TRENDING_LEGAL_TOPICS,
  addRecentSearch,
  filterTrendingTopics,
  getLibraryQuickMatches,
  loadRecentSearchesFromStorage,
  removeRecentSearch,
  saveRecentSearchesToStorage,
} from './librarySearchOverlay';

test('addRecentSearch trims, deduplicates case-insensitively, promotes newest, and caps length', () => {
  let list: string[] = [];
  list = addRecentSearch(list, '  Article 21  ');
  list = addRecentSearch(list, 'Magna Carta');
  list = addRecentSearch(list, 'article 21');
  assert.deepEqual(list, ['article 21', 'Magna Carta']);

  // Ignores empty or 1-char ASCII queries
  assert.deepEqual(addRecentSearch(list, ' '), list);
  assert.deepEqual(addRecentSearch(list, 'a'), list);

  // Supports Telugu queries
  list = addRecentSearch(list, 'రాజ్యాంగం');
  assert.equal(list[0], 'రాజ్యాంగం');

  // Enforces MAX_RECENT_SEARCHES cap
  for (let i = 1; i <= 10; i++) {
    list = addRecentSearch(list, `Query ${i}`);
  }
  assert.equal(list.length, MAX_RECENT_SEARCHES);
  assert.equal(list[0], 'Query 10');
});

test('removeRecentSearch removes matching item without mutating input array', () => {
  const initial = ['Article 21', 'Magna Carta', 'RTI'];
  const next = removeRecentSearch(initial, 'magna carta');
  assert.deepEqual(next, ['Article 21', 'RTI']);
  assert.deepEqual(initial, ['Article 21', 'Magna Carta', 'RTI']);
});

test('loadRecentSearchesFromStorage and saveRecentSearchesToStorage sanitize and round-trip', () => {
  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };

  saveRecentSearchesToStorage(['Article 21', 'Magna Carta'], mockStorage);
  assert.deepEqual(loadRecentSearchesFromStorage(mockStorage), ['Article 21', 'Magna Carta']);

  // Corrupted JSON falls back cleanly
  map.set(RECENT_SEARCHES_STORAGE_KEY, '{bad json');
  assert.deepEqual(loadRecentSearchesFromStorage(mockStorage), []);

  // Mixed invalid items & duplicates are sanitized
  map.set(
    RECENT_SEARCHES_STORAGE_KEY,
    JSON.stringify(['  RTI  ', 123, '', 'x', 'rti', 'Ambedkar', null])
  );
  assert.deepEqual(loadRecentSearchesFromStorage(mockStorage), ['RTI', 'Ambedkar']);
});

test('filterTrendingTopics filters across English and Telugu labels, domains, and citations', () => {
  const all = filterTrendingTopics(TRENDING_LEGAL_TOPICS, '', 'en');
  assert.equal(all.length, TRENDING_LEGAL_TOPICS.length);

  const magna = filterTrendingTopics(TRENDING_LEGAL_TOPICS, 'Magna Carta', 'en');
  assert.equal(magna.length, 1);
  assert.equal(magna[0]?.id, 'topic-magna-carta');

  const teluguMatches = filterTrendingTopics(TRENDING_LEGAL_TOPICS, 'అంబేద్కర్', 'te');
  assert.equal(teluguMatches.length, 1);
  assert.equal(teluguMatches[0]?.id, 'topic-ambedkar');
});

test('getLibraryQuickMatches finds matching clauses and books from catalog', () => {
  assert.deepEqual(getLibraryQuickMatches(INITIAL_LAW_BOOKS, '', 'en'), []);

  const art21 = getLibraryQuickMatches(INITIAL_LAW_BOOKS, 'Article 21', 'en', 4);
  assert.ok(art21.length >= 1);
  assert.equal(art21[0]?.type, 'clause');
  assert.equal(art21[0]?.bookId, 'india-constitution');
  assert.equal(art21[0]?.clauseId, 'in-art-21');

  const magna = getLibraryQuickMatches(INITIAL_LAW_BOOKS, 'Magna Carta', 'en', 4);
  assert.ok(magna.some((m) => m.bookId === 'magna-carta'));
});
