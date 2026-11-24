import type {
  BookCategory,
  Chapter,
  Clause,
  LanguageCode,
  LawBook,
  LocalizedText,
} from '../types/library';

export const BOOK_INDEX_STORAGE_KEY = 'constitution_law_cached_book_index_v1';

export type BookIndexSyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

export type BookIndexSyncSource = 'backend' | 'firestore' | 'merged';

export type BookIndexSyncTrigger = 'online-return' | 'initial' | 'visibility' | 'manual';

export interface CachedBookIndex {
  books: LawBook[];
  version: string;
  lastSyncedAt: string | null;
  etag: string | null;
}

export interface BookIndexDiffResult {
  books: LawBook[];
  addedBooks: LawBook[];
  updatedBooks: LawBook[];
  addedBookIds: string[];
  updatedBookIds: string[];
  hasChanges: boolean;
}

export interface BookIndexSyncSummary {
  addedBookIds: string[];
  updatedBookIds: string[];
  totalBooks: number;
  syncedAt: string;
  version: string;
  source: BookIndexSyncSource;
  hasChanges: boolean;
  trigger: BookIndexSyncTrigger;
}

export interface RemoteBookIndexPayload {
  books: LawBook[];
  version?: string;
  etag?: string | null;
  source?: BookIndexSyncSource;
  notModified?: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

export interface VisibilityDocumentLike extends EventTargetLike {
  visibilityState?: string;
}

const VALID_CATEGORIES = new Set<BookCategory>([
  'constitutions',
  'international',
  'statutory',
  'history',
  'custom',
]);

const VALID_COVER_TONES = new Set<LawBook['coverTone']>([
  'cobalt',
  'sapphire',
  'slate',
  'emerald',
  'amber',
  'obsidian',
]);

const LANGUAGE_KEYS: LanguageCode[] = ['en', 'te', 'hi', 'es', 'fr', 'ar'];

function normalizeLocalizedText(value: unknown, fallback = ''): LocalizedText {
  if (typeof value === 'string') {
    const trimmed = value.trim() || fallback;
    return { en: trimmed, te: trimmed };
  }
  if (!value || typeof value !== 'object') {
    return { en: fallback, te: fallback };
  }
  const record = value as Record<string, unknown>;
  const en = typeof record.en === 'string' && record.en.trim() ? record.en : fallback;
  const te = typeof record.te === 'string' && record.te.trim() ? record.te : en;
  const result: LocalizedText = { en, te };
  for (const lang of LANGUAGE_KEYS) {
    if (lang === 'en' || lang === 'te') continue;
    const candidate = record[lang];
    if (typeof candidate === 'string' && candidate.trim()) {
      result[lang] = candidate;
    }
  }
  return result;
}

function normalizeClause(raw: unknown, chapterId: string, idx: number): Clause | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `${chapterId}-clause-${idx + 1}`;
  const number = typeof c.number === 'string' && c.number.trim() ? c.number.trim() : `Clause ${idx + 1}`;
  const text = normalizeLocalizedText(c.text, '');
  if (!text.en) return null;
  const heading = c.heading ? normalizeLocalizedText(c.heading, '') : undefined;
  const principle = normalizeLocalizedText(c.principle, heading?.en || number);
  const explanation = normalizeLocalizedText(c.explanation ?? c.simpleExplanation, text.en);
  const realWorldExample = normalizeLocalizedText(c.realWorldExample, explanation.en);
  const audioAttachments =
    c.audioAttachments && typeof c.audioAttachments === 'object'
      ? (c.audioAttachments as Clause['audioAttachments'])
      : undefined;
  return {
    id,
    number,
    ...(heading && heading.en ? { heading } : {}),
    principle,
    text,
    explanation,
    realWorldExample,
    ...(audioAttachments ? { audioAttachments } : {}),
  };
}

function normalizeChapter(raw: unknown, bookId: string, idx: number): Chapter | null {
  if (!raw || typeof raw !== 'object') return null;
  const ch = raw as Record<string, unknown>;
  const id = typeof ch.id === 'string' && ch.id.trim() ? ch.id.trim() : `${bookId}-ch-${idx + 1}`;
  const number = typeof ch.number === 'string' && ch.number.trim() ? ch.number.trim() : `Chapter ${idx + 1}`;
  const title = normalizeLocalizedText(ch.title, number);
  const summary = normalizeLocalizedText(ch.summary, title.en);
  const rawClauses = Array.isArray(ch.clauses) ? ch.clauses : [];
  const clauses = rawClauses
    .map((cl, clIdx) => normalizeClause(cl, id, clIdx))
    .filter((cl): cl is Clause => cl !== null);
  const estimatedMinutes =
    typeof ch.estimatedMinutes === 'number' && Number.isFinite(ch.estimatedMinutes) && ch.estimatedMinutes > 0
      ? Math.round(ch.estimatedMinutes)
      : Math.max(2, clauses.length * 2);
  const overviewAudioUrl =
    typeof ch.overviewAudioUrl === 'string' && ch.overviewAudioUrl.trim()
      ? ch.overviewAudioUrl.trim()
      : undefined;
  const versionNumber =
    typeof ch.versionNumber === 'number' && Number.isFinite(ch.versionNumber)
      ? ch.versionNumber
      : undefined;
  const updatedAt = typeof ch.updatedAt === 'string' ? ch.updatedAt : undefined;
  const isDeleted = typeof ch.isDeleted === 'boolean' ? ch.isDeleted : undefined;

  return {
    id,
    number,
    title,
    summary,
    estimatedMinutes,
    clauses,
    ...(overviewAudioUrl ? { overviewAudioUrl } : {}),
    ...(versionNumber !== undefined ? { versionNumber } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(isDeleted !== undefined ? { isDeleted } : {}),
  };
}

export function buildCoverFallbackMap(books: LawBook[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const book of books) {
    if (book.id && book.coverImage) {
      map.set(book.id, book.coverImage);
    }
  }
  return map;
}

export function normalizeBookForIndex(
  raw: unknown,
  fallbackCoversById?: ReadonlyMap<string, string>
): LawBook | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  if (!id) return null;

  const title = normalizeLocalizedText(b.title, '');
  const shortTitle =
    typeof b.shortTitle === 'string' && b.shortTitle.trim()
      ? b.shortTitle.trim()
      : title.en;

  if (!shortTitle && !title.en) return null;

  const resolvedTitle = title.en ? title : { en: shortTitle, te: shortTitle };
  const subtitle = normalizeLocalizedText(b.subtitle, resolvedTitle.en);
  const jurisdiction =
    typeof b.jurisdiction === 'string' && b.jurisdiction.trim()
      ? b.jurisdiction.trim()
      : 'International Law';
  const year = typeof b.year === 'string' && b.year.trim() ? b.year.trim() : '2025';
  const category: BookCategory = VALID_CATEGORIES.has(b.category as BookCategory)
    ? (b.category as BookCategory)
    : 'constitutions';
  const coverTone: LawBook['coverTone'] = VALID_COVER_TONES.has(b.coverTone as LawBook['coverTone'])
    ? (b.coverTone as LawBook['coverTone'])
    : 'cobalt';

  const rawCoverImage = typeof b.coverImage === 'string' && b.coverImage.trim() ? b.coverImage.trim() : undefined;
  const coverImage = rawCoverImage ?? fallbackCoversById?.get(id);

  const rawChapters = Array.isArray(b.chapters) ? b.chapters : [];
  const chapters = rawChapters
    .map((ch, idx) => normalizeChapter(ch, id, idx))
    .filter((ch): ch is Chapter => ch !== null);

  const bookType =
    b.bookType === 'constitutional' || b.bookType === 'general_law' || b.bookType === 'biography'
      ? b.bookType
      : undefined;
  const masterBookId =
    typeof b.masterBookId === 'string' && b.masterBookId.trim() ? b.masterBookId.trim() : undefined;
  const editionId =
    typeof b.editionId === 'string' && b.editionId.trim() ? b.editionId.trim() : undefined;
  const descriptionAudioUrl =
    typeof b.descriptionAudioUrl === 'string' && b.descriptionAudioUrl.trim()
      ? b.descriptionAudioUrl.trim()
      : undefined;
  const versionNumber =
    typeof b.versionNumber === 'number' && Number.isFinite(b.versionNumber)
      ? b.versionNumber
      : undefined;
  const updatedAt = typeof b.updatedAt === 'string' ? b.updatedAt : undefined;
  const isDeleted = typeof b.isDeleted === 'boolean' ? b.isDeleted : undefined;

  return {
    id,
    shortTitle,
    title: resolvedTitle,
    subtitle,
    jurisdiction,
    year,
    category,
    coverTone,
    ...(coverImage ? { coverImage } : {}),
    ...(b.isUserAdded === true ? { isUserAdded: true } : {}),
    ...(bookType ? { bookType } : {}),
    ...(masterBookId ? { masterBookId } : {}),
    ...(editionId ? { editionId } : {}),
    ...(descriptionAudioUrl ? { descriptionAudioUrl } : {}),
    ...(versionNumber !== undefined ? { versionNumber } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(isDeleted !== undefined ? { isDeleted } : {}),
    chapters,
  };
}

export function mapCmsBookRecordToLawBook(
  docId: string,
  data: Record<string, unknown>,
  fallbackCoversById?: ReadonlyMap<string, string>
): LawBook | null {
  return normalizeBookForIndex(
    {
      ...data,
      id: typeof data.id === 'string' && data.id.trim() ? data.id.trim() : docId,
      isUserAdded: false,
    },
    fallbackCoversById
  );
}

/**
 * Deterministic 32-bit FNV-1a hash used to fingerprint books and catalog versions
 * cleanly across browser and Node environments without platform crypto dependencies.
 */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeBookFingerprint(book: LawBook): string {
  const canonical = {
    id: book.id,
    shortTitle: book.shortTitle,
    title: book.title,
    subtitle: book.subtitle,
    jurisdiction: book.jurisdiction,
    year: book.year,
    category: book.category,
    coverTone: book.coverTone,
    coverImage: book.coverImage ?? '',
    descriptionAudioUrl: book.descriptionAudioUrl ?? '',
    versionNumber: book.versionNumber ?? 0,
    chapters: book.chapters.map((ch) => ({
      id: ch.id,
      number: ch.number,
      title: ch.title,
      summary: ch.summary,
      estimatedMinutes: ch.estimatedMinutes,
      overviewAudioUrl: ch.overviewAudioUrl ?? '',
      versionNumber: ch.versionNumber ?? 0,
      clauses: ch.clauses.map((cl) => ({
        id: cl.id,
        number: cl.number,
        heading: cl.heading ?? null,
        principle: cl.principle,
        text: cl.text,
        explanation: cl.explanation,
        realWorldExample: cl.realWorldExample,
        audioAttachments: cl.audioAttachments ?? null,
      })),
    })),
  };
  return fnv1aHash(JSON.stringify(canonical));
}

export function computeCatalogVersion(books: LawBook[]): string {
  const signature = books
    .map((b) => `${b.id}:${computeBookFingerprint(b)}`)
    .sort()
    .join('|');
  return `idx-${books.length}-${fnv1aHash(signature)}`;
}

/**
 * Deterministically merges newly fetched remote catalog books into the locally cached book index.
 * - Preserves local book ordering for existing entries.
 * - Updates existing catalog books when content or metadata changes (preserving local cover fallbacks).
 * - Appends brand-new backend books.
 * - Never overwrites user-added personal custom books (`isUserAdded === true`).
 */
export function mergeBookIndex(
  localBooks: LawBook[],
  remoteBooks: LawBook[],
  fallbackCoversById?: ReadonlyMap<string, string>
): BookIndexDiffResult {
  const merged = localBooks.map((book) => ({ ...book }));
  const indexById = new Map<string, number>();
  merged.forEach((book, idx) => indexById.set(book.id, idx));

  const addedBooks: LawBook[] = [];
  const updatedBooks: LawBook[] = [];

  for (const rawRemote of remoteBooks) {
    const normalized = normalizeBookForIndex(rawRemote, fallbackCoversById);
    if (!normalized) continue;

    const existingIdx = indexById.get(normalized.id);
    if (existingIdx === undefined) {
      merged.push(normalized);
      indexById.set(normalized.id, merged.length - 1);
      addedBooks.push(normalized);
      continue;
    }

    const existingBook = merged[existingIdx];
    if (existingBook.isUserAdded) {
      // Never clobber a user's personal custom book with a remote catalog entry
      continue;
    }

    const mergedCandidate: LawBook = {
      ...normalized,
      coverImage: normalized.coverImage ?? existingBook.coverImage ?? fallbackCoversById?.get(normalized.id),
    };

    if (computeBookFingerprint(existingBook) !== computeBookFingerprint(mergedCandidate)) {
      merged[existingIdx] = mergedCandidate;
      updatedBooks.push(mergedCandidate);
    }
  }

  return {
    books: merged,
    addedBooks,
    updatedBooks,
    addedBookIds: addedBooks.map((b) => b.id),
    updatedBookIds: updatedBooks.map((b) => b.id),
    hasChanges: addedBooks.length > 0 || updatedBooks.length > 0,
  };
}

export function createInitialBookIndex(fallbackBooks: LawBook[]): CachedBookIndex {
  const normalized = fallbackBooks
    .map((b) => normalizeBookForIndex(b))
    .filter((b): b is LawBook => b !== null);
  return {
    books: normalized,
    version: computeCatalogVersion(normalized),
    lastSyncedAt: null,
    etag: null,
  };
}

export function loadCachedBookIndexFromStorage(
  storage: StorageLike | null | undefined,
  fallbackBooks: LawBook[]
): CachedBookIndex {
  const baseIndex = createInitialBookIndex(fallbackBooks);
  if (!storage) return baseIndex;

  try {
    const raw = storage.getItem(BOOK_INDEX_STORAGE_KEY);
    if (!raw) return baseIndex;
    const parsed = JSON.parse(raw) as Partial<CachedBookIndex>;
    if (!parsed || !Array.isArray(parsed.books) || parsed.books.length === 0) {
      return baseIndex;
    }

    const fallbackCovers = buildCoverFallbackMap(fallbackBooks);
    const merged = mergeBookIndex(baseIndex.books, parsed.books, fallbackCovers);

    return {
      books: merged.books,
      version:
        typeof parsed.version === 'string' && parsed.version.trim()
          ? parsed.version.trim()
          : computeCatalogVersion(merged.books),
      lastSyncedAt:
        typeof parsed.lastSyncedAt === 'string' && parsed.lastSyncedAt.trim()
          ? parsed.lastSyncedAt.trim()
          : null,
      etag: typeof parsed.etag === 'string' && parsed.etag.trim() ? parsed.etag.trim() : null,
    };
  } catch {
    return baseIndex;
  }
}

export function saveCachedBookIndexToStorage(
  index: CachedBookIndex,
  storage: StorageLike | null | undefined
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(BOOK_INDEX_STORAGE_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

export interface LibraryBackgroundSyncServiceOptions {
  fetchRemoteIndex: (opts: {
    etag: string | null;
    signal?: AbortSignal;
  }) => Promise<RemoteBookIndexPayload>;
  getInitialIndex: () => CachedBookIndex;
  saveIndex: (index: CachedBookIndex) => void;
  fallbackBooks?: LawBook[];
  initialOnline?: boolean;
  minSyncIntervalMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  now?: () => number;
  onStatusChange?: (status: BookIndexSyncStatus, errorMessage: string | null) => void;
  onIndexUpdated?: (index: CachedBookIndex, summary: BookIndexSyncSummary) => void;
}

export interface LibraryBackgroundSyncService {
  getCurrentIndex: () => CachedBookIndex;
  getStatus: () => BookIndexSyncStatus;
  isOnline: () => boolean;
  syncNow: (trigger?: BookIndexSyncTrigger) => Promise<BookIndexSyncSummary | null>;
  handleOnline: () => Promise<BookIndexSyncSummary | null>;
  handleOffline: () => void;
  handleVisibilityVisible: () => Promise<BookIndexSyncSummary | null>;
  attachListeners: (
    windowTarget?: EventTargetLike | null,
    documentTarget?: VisibilityDocumentLike | null
  ) => () => void;
  dispose: () => void;
}

export function createLibraryBackgroundSyncService(
  options: LibraryBackgroundSyncServiceOptions
): LibraryBackgroundSyncService {
  const fallbackCovers = buildCoverFallbackMap(options.fallbackBooks ?? []);
  const minSyncIntervalMs = options.minSyncIntervalMs ?? 30_000;
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 1_500;
  const now = options.now ?? (() => Date.now());

  let currentIndex: CachedBookIndex = options.getInitialIndex();
  let online = options.initialOnline ?? true;
  let status: BookIndexSyncStatus = online ? 'idle' : 'offline';
  let inFlightSync: Promise<BookIndexSyncSummary | null> | null = null;
  let activeAbortController: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempts = 0;
  let lastAttemptMs = 0;
  let disposed = false;
  let detachListenersFn: (() => void) | null = null;

  const setStatus = (nextStatus: BookIndexSyncStatus, errorMessage: string | null = null) => {
    status = nextStatus;
    options.onStatusChange?.(nextStatus, errorMessage);
  };

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const abortInFlight = () => {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  };

  const syncNow = async (
    trigger: BookIndexSyncTrigger = 'manual'
  ): Promise<BookIndexSyncSummary | null> => {
    if (disposed) return null;

    if (!online) {
      setStatus('offline', null);
      return null;
    }

    if (inFlightSync) {
      return inFlightSync;
    }

    clearRetryTimer();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeAbortController = controller;
    lastAttemptMs = now();
    setStatus('syncing', null);

    const run = (async (): Promise<BookIndexSyncSummary | null> => {
      try {
        const payload = await options.fetchRemoteIndex({
          etag: currentIndex.etag,
          signal: controller?.signal,
        });

        if (disposed || !online || controller?.signal.aborted) {
          return null;
        }

        const syncedAt = new Date(now()).toISOString();
        const source: BookIndexSyncSource = payload.source ?? 'backend';

        if (payload.notModified) {
          const refreshedIndex: CachedBookIndex = {
            ...currentIndex,
            lastSyncedAt: syncedAt,
            etag: payload.etag ?? currentIndex.etag,
          };
          currentIndex = refreshedIndex;
          options.saveIndex(refreshedIndex);
          retryAttempts = 0;
          setStatus('synced', null);

          const summary: BookIndexSyncSummary = {
            addedBookIds: [],
            updatedBookIds: [],
            totalBooks: refreshedIndex.books.length,
            syncedAt,
            version: refreshedIndex.version,
            source,
            hasChanges: false,
            trigger,
          };
          options.onIndexUpdated?.(refreshedIndex, summary);
          return summary;
        }

        const diff = mergeBookIndex(currentIndex.books, payload.books, fallbackCovers);
        const nextVersion =
          typeof payload.version === 'string' && payload.version.trim()
            ? payload.version.trim()
            : computeCatalogVersion(diff.books);

        const nextIndex: CachedBookIndex = {
          books: diff.books,
          version: nextVersion,
          lastSyncedAt: syncedAt,
          etag: payload.etag ?? currentIndex.etag,
        };

        currentIndex = nextIndex;
        options.saveIndex(nextIndex);
        retryAttempts = 0;
        setStatus('synced', null);

        const summary: BookIndexSyncSummary = {
          addedBookIds: diff.addedBookIds,
          updatedBookIds: diff.updatedBookIds,
          totalBooks: nextIndex.books.length,
          syncedAt,
          version: nextIndex.version,
          source,
          hasChanges: diff.hasChanges,
          trigger,
        };
        options.onIndexUpdated?.(nextIndex, summary);
        return summary;
      } catch (err) {
        if (disposed || !online || controller?.signal.aborted) {
          return null;
        }

        const message = err instanceof Error ? err.message : 'Background book index sync failed.';
        setStatus('error', message);

        if (retryAttempts < maxRetries && retryBaseDelayMs > 0) {
          const delay = retryBaseDelayMs * Math.pow(2, retryAttempts);
          retryAttempts += 1;
          clearRetryTimer();
          retryTimer = setTimeout(() => {
            retryTimer = null;
            if (!disposed && online) {
              void syncNow(trigger);
            }
          }, delay);
        }

        return null;
      } finally {
        if (activeAbortController === controller) {
          activeAbortController = null;
        }
        inFlightSync = null;
      }
    })();

    inFlightSync = run;
    return run;
  };

  const handleOffline = () => {
    if (disposed) return;
    online = false;
    retryAttempts = 0;
    clearRetryTimer();
    abortInFlight();
    setStatus('offline', null);
  };

  const handleOnline = async (): Promise<BookIndexSyncSummary | null> => {
    if (disposed) return null;
    const wasOffline = !online;
    online = true;
    retryAttempts = 0;
    clearRetryTimer();

    if (wasOffline || currentIndex.lastSyncedAt === null) {
      return syncNow(wasOffline ? 'online-return' : 'initial');
    }

    if (now() - lastAttemptMs >= minSyncIntervalMs) {
      return syncNow('online-return');
    }

    return null;
  };

  const handleVisibilityVisible = async (): Promise<BookIndexSyncSummary | null> => {
    if (disposed || !online) return null;
    if (now() - lastAttemptMs < minSyncIntervalMs) return null;
    return syncNow('visibility');
  };

  const attachListeners = (
    windowTarget?: EventTargetLike | null,
    documentTarget?: VisibilityDocumentLike | null
  ): (() => void) => {
    detachListenersFn?.();

    const onOnline = () => {
      void handleOnline();
    };
    const onOffline = () => {
      handleOffline();
    };
    const onVisibilityChange = () => {
      if (!documentTarget || documentTarget.visibilityState === 'visible') {
        void handleVisibilityVisible();
      }
    };

    windowTarget?.addEventListener('online', onOnline);
    windowTarget?.addEventListener('offline', onOffline);
    documentTarget?.addEventListener('visibilitychange', onVisibilityChange);

    const detach = () => {
      windowTarget?.removeEventListener('online', onOnline);
      windowTarget?.removeEventListener('offline', onOffline);
      documentTarget?.removeEventListener('visibilitychange', onVisibilityChange);
      if (detachListenersFn === detach) {
        detachListenersFn = null;
      }
    };

    detachListenersFn = detach;
    return detach;
  };

  const dispose = () => {
    disposed = true;
    clearRetryTimer();
    abortInFlight();
    detachListenersFn?.();
  };

  return {
    getCurrentIndex: () => currentIndex,
    getStatus: () => status,
    isOnline: () => online,
    syncNow,
    handleOnline,
    handleOffline,
    handleVisibilityVisible,
    attachListeners,
    dispose,
  };
}
