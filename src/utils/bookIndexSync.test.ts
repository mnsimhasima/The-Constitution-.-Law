import assert from 'node:assert/strict';
import test from 'node:test';
import type { LawBook } from '../types/library';
import {
  BOOK_INDEX_STORAGE_KEY,
  buildCoverFallbackMap,
  computeCatalogVersion,
  createInitialBookIndex,
  createLibraryBackgroundSyncService,
  loadCachedBookIndexFromStorage,
  mapCmsBookRecordToLawBook,
  mergeBookIndex,
  saveCachedBookIndexToStorage,
  type CachedBookIndex,
  type EventTargetLike,
  type StorageLike,
  type VisibilityDocumentLike,
} from './bookIndexSync';

function makeBook(overrides: Partial<LawBook> & { id: string }): LawBook {
  return {
    id: overrides.id,
    shortTitle: overrides.shortTitle ?? `Short ${overrides.id}`,
    title: overrides.title ?? {
      en: `Title ${overrides.id}`,
      te: `శీర్షిక ${overrides.id}`,
    },
    subtitle: overrides.subtitle ?? {
      en: `Subtitle ${overrides.id}`,
      te: `ఉపశీర్షిక ${overrides.id}`,
    },
    jurisdiction: overrides.jurisdiction ?? 'India',
    year: overrides.year ?? '1950',
    category: overrides.category ?? 'constitutions',
    coverTone: overrides.coverTone ?? 'cobalt',
    coverImage: overrides.coverImage,
    isUserAdded: overrides.isUserAdded,
    chapters: overrides.chapters ?? [
      {
        id: `${overrides.id}-ch1`,
        number: 'Chapter 1',
        title: { en: 'Foundations', te: 'పునాదులు' },
        summary: { en: 'Summary of chapter 1', te: 'అధ్యాయం 1 సారాంశం' },
        estimatedMinutes: 4,
        clauses: [
          {
            id: `${overrides.id}-cl1`,
            number: 'Article 1',
            principle: { en: 'Rule of Law', te: 'చట్టపాలన' },
            text: { en: 'Original clause text.', te: 'మూల నిబంధన.' },
            explanation: { en: 'Plain explanation.', te: 'సరళ వివరణ.' },
            realWorldExample: { en: 'Practical civic example.', te: 'పౌర ఉదాహరణ.' },
          },
        ],
      },
    ],
  };
}

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function createFakeEventTarget(): EventTargetLike & { dispatch: (type: string) => void } {
  const listeners = new Map<string, Set<() => void>>();
  return {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
    dispatch: (type) => {
      for (const fn of Array.from(listeners.get(type) ?? [])) {
        fn();
      }
    },
  };
}

test('mergeBookIndex adds new backend books, updates changed books, and preserves cover fallbacks & custom books', () => {
  const baseBook = makeBook({
    id: 'india-const',
    coverImage: '/src/assets/images/cover_india.jpg',
  });
  const userCustomBook = makeBook({
    id: 'user-custom-1',
    shortTitle: 'My Notes Book',
    isUserAdded: true,
  });

  const updatedBaseRemote = makeBook({
    id: 'india-const',
    // Omit coverImage on remote payload to verify local fallback preservation
    coverImage: undefined,
    chapters: [
      {
        id: 'india-const-ch1',
        number: 'Chapter 1',
        title: { en: 'Foundations (Revised)', te: 'పునాదులు' },
        summary: { en: 'Updated summary', te: 'నవీకరించబడిన సారాంశం' },
        estimatedMinutes: 6,
        clauses: [
          {
            id: 'india-const-cl1',
            number: 'Article 1',
            principle: { en: 'Rule of Law', te: 'చట్టపాలన' },
            text: { en: 'Revised clause text with amendment.', te: 'సవరించిన నిబంధన.' },
            explanation: { en: 'Updated plain explanation.', te: 'నవీకరించబడిన వివరణ.' },
            realWorldExample: { en: 'Updated civic example.', te: 'నవీకరించబడిన ఉదాహరణ.' },
          },
        ],
      },
    ],
  });

  const brandNewBook = makeBook({
    id: 'digital-data-protection-act',
    shortTitle: 'DPDP Act 2023',
    category: 'statutory',
    year: '2023',
  });

  const collidingRemoteForCustom = makeBook({
    id: 'user-custom-1',
    shortTitle: 'Remote Override Attempt',
  });

  const fallbackCovers = buildCoverFallbackMap([baseBook]);
  const diff = mergeBookIndex(
    [baseBook, userCustomBook],
    [updatedBaseRemote, brandNewBook, collidingRemoteForCustom],
    fallbackCovers
  );

  assert.equal(diff.hasChanges, true);
  assert.deepEqual(diff.addedBookIds, ['digital-data-protection-act']);
  assert.deepEqual(diff.updatedBookIds, ['india-const']);
  assert.equal(diff.books.length, 3);
  assert.equal(diff.books[0].coverImage, '/src/assets/images/cover_india.jpg');
  assert.equal(diff.books[0].chapters[0].title.en, 'Foundations (Revised)');
  assert.equal(diff.books[1].shortTitle, 'My Notes Book');
  assert.equal(diff.books[1].isUserAdded, true);
  assert.equal(diff.books[2].id, 'digital-data-protection-act');

  // Re-merging identical remote books should produce zero changes
  const secondDiff = mergeBookIndex(diff.books, [updatedBaseRemote, brandNewBook], fallbackCovers);
  assert.equal(secondDiff.hasChanges, false);
  assert.deepEqual(secondDiff.addedBookIds, []);
  assert.deepEqual(secondDiff.updatedBookIds, []);
});

test('loadCachedBookIndexFromStorage and saveCachedBookIndexToStorage round-trip and recover from corrupted storage', () => {
  const storage = createMemoryStorage();
  const baseBook = makeBook({ id: 'base-1', coverImage: '/cover-base.jpg' });
  const extraBook = makeBook({ id: 'synced-2', shortTitle: 'Synced Statute' });

  const initial: CachedBookIndex = {
    books: [baseBook, extraBook],
    version: computeCatalogVersion([baseBook, extraBook]),
    lastSyncedAt: '2026-05-01T10:00:00.000Z',
    etag: 'W/"abc123"',
  };

  assert.equal(saveCachedBookIndexToStorage(initial, storage), true);
  const loaded = loadCachedBookIndexFromStorage(storage, [baseBook]);
  assert.equal(loaded.books.length, 2);
  assert.equal(loaded.books[1].id, 'synced-2');
  assert.equal(loaded.etag, 'W/"abc123"');
  assert.equal(loaded.lastSyncedAt, '2026-05-01T10:00:00.000Z');

  // Corrupted storage falls back cleanly to fallbackBooks
  storage.setItem(BOOK_INDEX_STORAGE_KEY, '{corrupted json');
  const recovered = loadCachedBookIndexFromStorage(storage, [baseBook]);
  assert.equal(recovered.books.length, 1);
  assert.equal(recovered.books[0].id, 'base-1');
  assert.equal(recovered.lastSyncedAt, null);
});

test('mapCmsBookRecordToLawBook normalizes Firestore CMS documents cleanly', () => {
  const mapped = mapCmsBookRecordToLawBook('cms-rti-act', {
    shortTitle: 'RTI Act 2005',
    title: { en: 'Right to Information Act, 2005', te: 'సమాచార హక్కు చట్టం' },
    subtitle: { en: 'Transparency in public authorities', te: 'పారదర్శకత' },
    jurisdiction: 'Republic of India',
    year: '2005',
    category: 'statutory',
    coverTone: 'emerald',
    chapters: [
      {
        id: 'rti-ch1',
        number: 'Chapter 1',
        title: { en: 'Right to Know', te: 'తెలుసుకునే హక్కు' },
        summary: { en: 'Core transparency mandate.', te: 'ప్రధాన ఆదేశం.' },
        clauses: [
          {
            id: 'rti-s3',
            number: 'Section 3',
            text: { en: 'All citizens shall have the right to information.', te: 'అందరికీ సమాచార హక్కు.' },
            simpleExplanation: { en: 'Every citizen can request public records.', te: 'ప్రతి పౌరుడు సమాచారం కోరవచ్చు.' },
          },
        ],
      },
    ],
  });

  assert.ok(mapped);
  assert.equal(mapped.id, 'cms-rti-act');
  assert.equal(mapped.category, 'statutory');
  assert.equal(mapped.chapters.length, 1);
  assert.equal(mapped.chapters[0].estimatedMinutes, 2);
  assert.equal(mapped.chapters[0].clauses[0].number, 'Section 3');
  assert.equal(mapped.chapters[0].clauses[0].explanation.en, 'Every citizen can request public records.');
});

test('background sync service detects offline -> online return and automatically updates cached book index', async () => {
  const storage = createMemoryStorage();
  const baseBook = makeBook({ id: 'base-constitution' });
  const newBackendBook = makeBook({
    id: 'backend-consumer-protection-act',
    shortTitle: 'Consumer Protection Act',
    category: 'statutory',
  });

  let fetchCalls = 0;
  let updatedSummaryCount = 0;
  let lastTrigger: string | null = null;
  const statuses: string[] = [];

  const fakeWindow = createFakeEventTarget();
  const fakeDoc = Object.assign(createFakeEventTarget(), {
    visibilityState: 'visible',
  }) as VisibilityDocumentLike & { dispatch: (type: string) => void };

  const service = createLibraryBackgroundSyncService({
    initialOnline: false,
    fallbackBooks: [baseBook],
    getInitialIndex: () => createInitialBookIndex([baseBook]),
    saveIndex: (idx) => {
      saveCachedBookIndexToStorage(idx, storage);
    },
    fetchRemoteIndex: async () => {
      fetchCalls += 1;
      return {
        books: [baseBook, newBackendBook],
        etag: 'W/"v2"',
        source: 'merged',
      };
    },
    onStatusChange: (s) => {
      statuses.push(s);
    },
    onIndexUpdated: (_idx, summary) => {
      updatedSummaryCount += 1;
      lastTrigger = summary.trigger;
    },
  });

  // While offline, manual sync does not call backend
  assert.equal(service.getStatus(), 'offline');
  const offlineResult = await service.syncNow('manual');
  assert.equal(offlineResult, null);
  assert.equal(fetchCalls, 0);

  // Attach listeners and simulate browser returning online
  const detach = service.attachListeners(fakeWindow, fakeDoc);
  fakeWindow.dispatch('online');

  // Allow microtask queue to finish
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(fetchCalls, 1);
  assert.equal(service.isOnline(), true);
  assert.equal(service.getStatus(), 'synced');
  assert.equal(updatedSummaryCount, 1);
  assert.equal(lastTrigger, 'online-return');
  assert.equal(service.getCurrentIndex().books.length, 2);
  assert.equal(service.getCurrentIndex().books[1].id, 'backend-consumer-protection-act');

  // Verify persisted to localStorage
  const persisted = loadCachedBookIndexFromStorage(storage, [baseBook]);
  assert.equal(persisted.books.length, 2);
  assert.equal(persisted.etag, 'W/"v2"');
  assert.ok(statuses.includes('syncing'));
  assert.ok(statuses.includes('synced'));

  // After dispose(), further online events do not fire fetches
  detach();
  service.dispose();
  fakeWindow.dispatch('offline');
  fakeWindow.dispatch('online');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetchCalls, 1);
});

test('background sync service deduplicates concurrent sync calls and recovers cleanly after a network error', async () => {
  const baseBook = makeBook({ id: 'base-1' });
  const addedBook = makeBook({ id: 'new-act-2026' });

  let fetchCalls = 0;
  let shouldFail = true;

  const service = createLibraryBackgroundSyncService({
    initialOnline: true,
    fallbackBooks: [baseBook],
    getInitialIndex: () => createInitialBookIndex([baseBook]),
    saveIndex: () => {},
    maxRetries: 0, // disable auto-retry timer in this unit test to test explicit recovery
    fetchRemoteIndex: async () => {
      fetchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (shouldFail) {
        throw new Error('Simulated temporary gateway outage');
      }
      return {
        books: [baseBook, addedBook],
        source: 'backend',
      };
    },
  });

  // Fire two concurrent syncs — only one fetch should run
  const [first, second] = await Promise.all([service.syncNow('manual'), service.syncNow('manual')]);
  assert.equal(fetchCalls, 1);
  assert.equal(first, null);
  assert.equal(second, null);
  assert.equal(service.getStatus(), 'error');

  // Simulate offline -> online recovery with backend now healthy
  shouldFail = false;
  service.handleOffline();
  assert.equal(service.getStatus(), 'offline');

  const recovered = await service.handleOnline();
  assert.ok(recovered);
  assert.equal(fetchCalls, 2);
  assert.equal(service.getStatus(), 'synced');
  assert.equal(recovered.trigger, 'online-return');
  assert.deepEqual(recovered.addedBookIds, ['new-act-2026']);
  assert.equal(service.getCurrentIndex().books.length, 2);

  service.dispose();
});

test('background sync service handles HTTP 304 notModified payloads without losing cached books', async () => {
  const baseBook = makeBook({ id: 'base-1' });
  const existingCached = makeBook({ id: 'cached-cms-1' });
  let savedCount = 0;

  const service = createLibraryBackgroundSyncService({
    initialOnline: true,
    fallbackBooks: [baseBook],
    getInitialIndex: () => ({
      books: [baseBook, existingCached],
      version: 'v-existing',
      lastSyncedAt: '2026-05-01T00:00:00.000Z',
      etag: 'W/"same-etag"',
    }),
    saveIndex: () => {
      savedCount += 1;
    },
    fetchRemoteIndex: async ({ etag }) => {
      assert.equal(etag, 'W/"same-etag"');
      return {
        books: [],
        etag: 'W/"same-etag"',
        notModified: true,
        source: 'backend',
      };
    },
  });

  const summary = await service.syncNow('manual');
  assert.ok(summary);
  assert.equal(summary.hasChanges, false);
  assert.equal(summary.totalBooks, 2);
  assert.equal(savedCount, 1);
  assert.equal(service.getCurrentIndex().books.length, 2);
  assert.equal(service.getCurrentIndex().books[1].id, 'cached-cms-1');

  service.dispose();
});
