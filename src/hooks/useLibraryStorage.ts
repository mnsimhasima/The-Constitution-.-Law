import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { COMMUNITY_SCHOLARS, INITIAL_LAW_BOOKS, INITIAL_NOTIFICATIONS } from '../data/booksData';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivityItem,
  AudioMode,
  AudioVoiceName,
  BookCategory,
  CachedChapterSummary,
  Chapter,
  ChapterCacheProgress,
  ClauseBookmark,
  ClauseHighlight,
  ClauseNote,
  GeneralSettings,
  HighlightColor,
  LanguageCode,
  LawBook,
  NotificationItem,
  ReaderPreferences,
  ReadingPosition,
} from '../types/library';
import {
  clearMemoryAudioClipUrls,
  fetchTtsAudioBlobFromServer,
} from '../utils/audioTtsClient';
import { estimateSpeechSeconds, getClauseKey, sanitizeDocId, toggleHighlightInMap } from '../utils/libraryLogic';
import {
  buildChapterCacheKey,
  createChapterCacheManager,
  formatBytes,
  getCachedAudioBlobFromDb,
  getOfflineAudioStore,
  putCachedAudioBlobInDb,
} from '../utils/offlineAudioCache';
import {
  buildCoverFallbackMap,
  createLibraryBackgroundSyncService,
  loadCachedBookIndexFromStorage,
  mapCmsBookRecordToLawBook,
  mergeBookIndex,
  saveCachedBookIndexToStorage,
  type BookIndexSyncStatus,
  type BookIndexSyncSummary,
  type BookIndexSyncTrigger,
  type CachedBookIndex,
  type LibraryBackgroundSyncService,
  type RemoteBookIndexPayload,
} from '../utils/bookIndexSync';

const STORAGE_KEY = 'constitution_law_library_v3';

export type CloudSyncState = 'local' | 'syncing' | 'synced' | 'error';

interface PersistedLibraryState {
  customBooks: LawBook[];
  highlights: Record<string, ClauseHighlight>;
  bookmarks: Record<string, ClauseBookmark>;
  notes: ClauseNote[];
  startedPlanIds: string[];
  completedPlanDayIds: string[];
  readChapterIds: string[];
  savedBookIds: string[];
  savedPlanIds: string[];
  followedBookIds: string[];
  followedPeopleIds: string[];
  friendIds: string[];
  completedTaskIds: string[];
  rsvpEventIds: string[];
  likedPostIds: string[];
  activities: ActivityItem[];
  notifications: NotificationItem[];
  generalSettings: GeneralSettings;
  totalDonatedAmount: number;
  audioMinutes: number;
  streakDays: number;
  lastPosition: ReadingPosition;
  preferences: ReaderPreferences;
}

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  dailyReminders: true,
  audioAutoAdvance: true,
  friendActivityAlerts: true,
  offlineAudioCache: false,
};

const DEFAULT_PREFERENCES: ReaderPreferences = {
  language: 'en',
  compareLanguage: 'te',
  showInlineExplanations: true,
  showParallelLanguage: false,
  readerTheme: 'light',
  appDarkMode: false,
  fontSize: 'md',
  fontFace: 'sans',
  audioSpeed: 1,
  audioMode: 'both',
};

const DEFAULT_STATE: PersistedLibraryState = {
  customBooks: [],
  highlights: {
    'ambedkar-constitutional-history::amb-ch2-mahad-constitution::amb-2-2': {
      clauseKey: 'ambedkar-constitutional-history::amb-ch2-mahad-constitution::amb-2-2',
      bookId: 'ambedkar-constitutional-history',
      chapterId: 'amb-ch2-mahad-constitution',
      clauseId: 'amb-2-2',
      color: 'sky',
      updatedAt: '2026-11-20T09:00:00.000Z',
    },
  },
  bookmarks: {
    'india-constitution::in-part3::in-art-21': {
      clauseKey: 'india-constitution::in-part3::in-art-21',
      bookId: 'india-constitution',
      chapterId: 'in-part3',
      clauseId: 'in-art-21',
      createdAt: '2026-11-20T10:15:00.000Z',
    },
  },
  notes: [
    {
      id: 'note-seed-1',
      clauseKey: 'ambedkar-constitutional-history::amb-ch2-mahad-constitution::amb-2-2',
      bookId: 'ambedkar-constitutional-history',
      chapterId: 'amb-ch2-mahad-constitution',
      clauseId: 'amb-2-2',
      content: 'Dr. Ambedkar emphasized that liberty, equality, and fraternity form an inseparable trinity in a living democracy.',
      updatedAt: '2026-11-20T09:10:00.000Z',
    },
  ],
  startedPlanIds: ['plan-ambedkar-morality'],
  completedPlanDayIds: ['amb-day-1'],
  readChapterIds: ['amb-ch1-scholarship', 'in-part3'],
  savedBookIds: ['ambedkar-constitutional-history', 'indian-law-handbook'],
  savedPlanIds: ['plan-ambedkar-morality', 'plan-fundamental-rights'],
  followedBookIds: ['ambedkar-constitutional-history', 'india-constitution'],
  followedPeopleIds: ['person-ananya'],
  friendIds: ['person-karthik'],
  completedTaskIds: ['task-1'],
  rsvpEventIds: ['evt-1'],
  likedPostIds: [],
  activities: [
    {
      id: 'act-seed-1',
      kind: 'plan',
      title: 'Completed Day 1 · Education as Emancipation',
      detail: 'Dr. Ambedkar & Constitutional Morality track',
      timestamp: 'Today · 09:20 AM',
    },
    {
      id: 'act-seed-2',
      kind: 'highlight',
      title: 'Highlighted Section 2.2 in Dr. Ambedkar History',
      detail: 'Liberty, Equality & Fraternity as a Union',
      timestamp: 'Yesterday · 07:45 PM',
    },
    {
      id: 'act-seed-3',
      kind: 'save',
      title: 'Saved Indian Constitutional & Civil Law Handbook',
      detail: 'Added to Saved Books shelf',
      timestamp: '2 days ago',
    },
    {
      id: 'act-seed-4',
      kind: 'social',
      title: 'Connected with Karthik Reddy',
      detail: 'Dr. B. R. Ambedkar Study Circle',
      timestamp: '3 days ago',
    },
  ],
  notifications: INITIAL_NOTIFICATIONS,
  generalSettings: DEFAULT_GENERAL_SETTINGS,
  totalDonatedAmount: 0,
  audioMinutes: 24,
  streakDays: 5,
  lastPosition: {
    bookId: 'ambedkar-constitutional-history',
    chapterId: 'amb-ch1-scholarship',
    clauseId: 'amb-1-1',
  },
  preferences: DEFAULT_PREFERENCES,
};

function loadInitialState(): PersistedLibraryState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedLibraryState>;
    const validTheme =
      parsed.preferences?.readerTheme === 'light' ||
      parsed.preferences?.readerTheme === 'warm' ||
      parsed.preferences?.readerTheme === 'dark'
        ? parsed.preferences.readerTheme
        : DEFAULT_PREFERENCES.readerTheme;
    const validFace =
      parsed.preferences?.fontFace === 'sans' || parsed.preferences?.fontFace === 'display'
        ? parsed.preferences.fontFace
        : DEFAULT_PREFERENCES.fontFace;

    return {
      ...DEFAULT_STATE,
      ...parsed,
      generalSettings: {
        ...DEFAULT_GENERAL_SETTINGS,
        ...(parsed.generalSettings ?? {}),
      },
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...(parsed.preferences ?? {}),
        readerTheme: validTheme,
        fontFace: validFace,
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function hydrateCustomBookFromDoc(bookId: string, data: Record<string, unknown>): LawBook {
  const titleEn = String(data.titleEn ?? 'Custom Statute');
  const shortTitle = String(data.shortTitle ?? titleEn.slice(0, 24));
  const jurisdiction = String(data.jurisdiction ?? 'General Law');
  const year = String(data.year ?? new Date().getFullYear());
  const rawCategory = String(data.category ?? 'custom');
  const category: BookCategory =
    rawCategory === 'constitutions' ||
    rawCategory === 'history' ||
    rawCategory === 'statutory' ||
    rawCategory === 'international' ||
    rawCategory === 'custom'
      ? rawCategory
      : 'custom';
  const chapterTitleEn = String(data.chapterTitleEn ?? 'Chapter 1');
  const clauseNumber = String(data.clauseNumber ?? 'Section 1');
  const principleEn = String(data.principleEn ?? 'Core Legal Provision');
  const clauseTextEn = String(data.clauseTextEn ?? '');
  const explanationEn = String(data.explanationEn ?? '');
  const clauseTextTe = typeof data.clauseTextTe === 'string' && data.clauseTextTe.trim() ? data.clauseTextTe.trim() : undefined;
  const explanationTe =
    typeof data.explanationTe === 'string' && data.explanationTe.trim() ? data.explanationTe.trim() : undefined;

  return {
    id: bookId,
    shortTitle,
    title: { en: titleEn },
    subtitle: {
      en: `${jurisdiction} · Cloud-synced legal edition with multilingual audio & commentary`,
    },
    jurisdiction,
    year,
    category,
    coverTone: 'cobalt',
    isUserAdded: true,
    chapters: [
      {
        id: `${bookId}-ch1`,
        number: 'Chapter 1',
        title: { en: chapterTitleEn },
        summary: { en: explanationEn.slice(0, 140) },
        estimatedMinutes: Math.max(2, Math.ceil(estimateSpeechSeconds(`${clauseTextEn} ${explanationEn}`) / 60)),
        clauses: [
          {
            id: `${bookId}-cl1`,
            number: clauseNumber,
            principle: { en: principleEn },
            text: {
              en: clauseTextEn,
              ...(clauseTextTe ? { te: clauseTextTe } : {}),
            },
            explanation: {
              en: explanationEn,
              ...(explanationTe ? { te: explanationTe } : {}),
            },
            realWorldExample: {
              en: 'Applied in courts and civic practice within this jurisdiction.',
            },
          },
        ],
      },
    ],
  };
}

export function useLibraryStorage(user: User | null) {
  const [state, setState] = useState<PersistedLibraryState>(loadInitialState);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>('local');
  const [cachedChapters, setCachedChapters] = useState<CachedChapterSummary[]>([]);
  const [cachedAudioTotalBytes, setCachedAudioTotalBytes] = useState<number>(0);
  const [chapterCacheProgress, setChapterCacheProgress] = useState<
    Record<string, ChapterCacheProgress>
  >({});
  const [isOffline, setIsOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  );
  const [cachedBookIndex, setCachedBookIndex] = useState<CachedBookIndex>(() =>
    loadCachedBookIndexFromStorage(
      typeof window !== 'undefined' ? window.localStorage : null,
      INITIAL_LAW_BOOKS
    )
  );
  const [bookIndexSyncState, setBookIndexSyncState] = useState<BookIndexSyncStatus>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'idle'
  );
  const [lastBookIndexSyncSummary, setLastBookIndexSyncSummary] =
    useState<BookIndexSyncSummary | null>(null);
  const [bookIndexSyncError, setBookIndexSyncError] = useState<string | null>(null);
  const userDocReadyRef = useRef<boolean>(false);
  const stateRef = useRef<PersistedLibraryState>(state);
  stateRef.current = state;
  const cachedBookIndexRef = useRef<CachedBookIndex>(cachedBookIndex);
  cachedBookIndexRef.current = cachedBookIndex;
  const bookIndexSyncServiceRef = useRef<LibraryBackgroundSyncService | null>(null);
  const cacheAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const cacheManagerRef = useRef(
    createChapterCacheManager(getOfflineAudioStore(), fetchTtsAudioBlobFromServer)
  );

  const isCloudVerifiedUser = Boolean(user && user.emailVerified);

  const refreshOfflineAudioCache = useCallback(async () => {
    try {
      const { chapters, totalBytes } = await cacheManagerRef.current.listCachedChapters();
      setCachedChapters(chapters);
      setCachedAudioTotalBytes(totalBytes);
    } catch {
      // IndexedDB unavailable; keep empty local cache list
    }
  }, []);

  // Hydrate IndexedDB offline audio manifests on mount
  useEffect(() => {
    void refreshOfflineAudioCache();
  }, [refreshOfflineAudioCache]);

  // Background book index sync service: detects offline -> online return and refreshes local cache
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fallbackCovers = buildCoverFallbackMap(INITIAL_LAW_BOOKS);

    const fetchRemoteBookIndex = async ({
      etag,
      signal,
    }: {
      etag: string | null;
      signal?: AbortSignal;
    }): Promise<RemoteBookIndexPayload> => {
      let apiBooks: LawBook[] = [];
      let apiVersion: string | undefined;
      let apiEtag: string | null = etag;
      let apiNotModified = false;
      let apiSucceeded = false;
      let apiError: unknown = null;

      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (etag) {
          headers['If-None-Match'] = etag;
        }
        const response = await fetch('/api/library/book-index', {
          method: 'GET',
          headers,
          cache: 'no-store',
          signal,
        });
        if (response.status === 304) {
          apiNotModified = true;
          apiSucceeded = true;
          apiEtag = response.headers.get('etag') ?? etag;
        } else if (response.ok) {
          const data = (await response.json()) as {
            version?: string;
            books?: LawBook[];
          };
          apiBooks = Array.isArray(data.books) ? data.books : [];
          apiVersion = typeof data.version === 'string' ? data.version : undefined;
          apiEtag = response.headers.get('etag') ?? null;
          apiSucceeded = true;
        } else {
          apiError = new Error(`Book index API responded with HTTP ${response.status}`);
        }
      } catch (err) {
        apiError = err;
      }

      if (signal?.aborted) {
        throw new DOMException('Background book index sync aborted', 'AbortError');
      }

      let firestoreBooks: LawBook[] = [];
      let firestoreSucceeded = false;
      let firestoreError: unknown = null;

      try {
        const cmsSnapshot = await getDocs(
          query(collection(db, 'cmsBooks'), where('status', '==', 'published'))
        );
        firestoreBooks = cmsSnapshot.docs
          .map((docSnap) =>
            mapCmsBookRecordToLawBook(
              docSnap.id,
              docSnap.data() as Record<string, unknown>,
              fallbackCovers
            )
          )
          .filter((b): b is LawBook => b !== null);
        firestoreSucceeded = true;
      } catch (err) {
        firestoreError = err;
      }

      if (!apiSucceeded && !firestoreSucceeded) {
        throw apiError ?? firestoreError ?? new Error('Unable to reach backend book catalog.');
      }

      if (apiNotModified && firestoreBooks.length === 0) {
        return {
          books: [],
          etag: apiEtag,
          notModified: true,
          source: 'backend',
        };
      }

      if (apiNotModified && firestoreBooks.length > 0) {
        return {
          books: firestoreBooks,
          etag: apiEtag,
          notModified: false,
          source: 'firestore',
        };
      }

      if (apiBooks.length > 0 && firestoreBooks.length > 0) {
        const combined = mergeBookIndex(apiBooks, firestoreBooks, fallbackCovers);
        return {
          books: combined.books,
          etag: apiEtag,
          source: 'merged',
        };
      }

      if (apiSucceeded) {
        return {
          books: apiBooks,
          version: apiVersion,
          etag: apiEtag,
          source: 'backend',
        };
      }

      return {
        books: firestoreBooks,
        etag: apiEtag,
        source: 'firestore',
      };
    };

    const service = createLibraryBackgroundSyncService({
      initialOnline: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
      fallbackBooks: INITIAL_LAW_BOOKS,
      getInitialIndex: () => cachedBookIndexRef.current,
      saveIndex: (nextIndex) => {
        saveCachedBookIndexToStorage(nextIndex, window.localStorage);
      },
      fetchRemoteIndex: fetchRemoteBookIndex,
      onStatusChange: (nextStatus, errorMessage) => {
        setBookIndexSyncState(nextStatus);
        setBookIndexSyncError(errorMessage);
      },
      onIndexUpdated: (nextIndex, summary) => {
        setCachedBookIndex(nextIndex);
        setLastBookIndexSyncSummary(summary);

        if (summary.hasChanges) {
          const addedCount = summary.addedBookIds.length;
          const updatedCount = summary.updatedBookIds.length;
          const parts: string[] = [];
          if (addedCount > 0) {
            parts.push(`${addedCount} new ${addedCount === 1 ? 'book' : 'books'}`);
          }
          if (updatedCount > 0) {
            parts.push(`${updatedCount} updated ${updatedCount === 1 ? 'book' : 'books'}`);
          }
          const detailText = `${parts.join(' and ')} synced to your local library catalog.`;
          const notifId = `notif-sync-${summary.version}-${addedCount}-${updatedCount}`;

          setState((prev) => {
            if (prev.notifications.some((n) => n.id === notifId)) {
              return prev;
            }
            const nextNotification: NotificationItem = {
              id: notifId,
              title: 'Library Catalog Updated',
              body: detailText,
              timeLabel: 'Just now',
              unread: true,
              targetTab: 'library',
            };
            return {
              ...prev,
              notifications: [nextNotification, ...prev.notifications].slice(0, 40),
            };
          });
        }
      },
    });

    bookIndexSyncServiceRef.current = service;

    const handleOnline = () => {
      setIsOffline(false);
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const detachSyncListeners = service.attachListeners(window, document);

    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void service.syncNow('initial');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      detachSyncListeners();
      service.dispose();
      if (bookIndexSyncServiceRef.current === service) {
        bookIndexSyncServiceRef.current = null;
      }
    };
  }, []);

  // Persist to localStorage for instant offline/guest availability
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (state.preferences.appDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [state.preferences.appDarkMode]);

  // Real-time Firestore Cloud Sync when authenticated
  useEffect(() => {
    if (!isCloudVerifiedUser || !user) {
      userDocReadyRef.current = false;
      setCloudSyncState('local');
      return;
    }

    let cancelled = false;
    const unsubscribers: Array<() => void> = [];
    const uid = user.uid;
    const userDisplayName = (user.displayName ?? 'Legal Scholar').slice(0, 120);
    const userEmail = (user.email ?? '').slice(0, 180);
    const userPhotoURL = (user.photoURL ?? '').slice(0, 500);
    const userDocRef = doc(db, 'users', uid);

    async function bootstrapCloudSync() {
      setCloudSyncState('syncing');
      try {
        const snapshot = await getDoc(userDocRef);
        if (cancelled) return;

        if (!snapshot.exists()) {
          const current = stateRef.current;
          await setDoc(userDocRef, {
            uid,
            displayName: userDisplayName,
            email: userEmail,
            photoURL: userPhotoURL,
            preferredLanguage: current.preferences.language,
            streakDays: Math.min(10000, Math.max(0, current.streakDays)),
            audioMinutes: Math.min(1000000, Math.max(0, current.audioMinutes)),
            startedPlanIds: current.startedPlanIds.slice(0, 30),
            completedPlanDayIds: current.completedPlanDayIds.slice(0, 100),
            readChapterIds: current.readChapterIds.slice(0, 100),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (cancelled) return;
        userDocReadyRef.current = true;

        // 1. Profile listener
        const unsubProfile = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (!docSnap.exists()) return;
            const d = docSnap.data();
            const lang = d.preferredLanguage as LanguageCode | undefined;
            setState((prev) => ({
              ...prev,
              streakDays: typeof d.streakDays === 'number' ? d.streakDays : prev.streakDays,
              audioMinutes: typeof d.audioMinutes === 'number' ? d.audioMinutes : prev.audioMinutes,
              startedPlanIds: Array.isArray(d.startedPlanIds) ? (d.startedPlanIds as string[]) : prev.startedPlanIds,
              completedPlanDayIds: Array.isArray(d.completedPlanDayIds)
                ? (d.completedPlanDayIds as string[])
                : prev.completedPlanDayIds,
              readChapterIds: Array.isArray(d.readChapterIds) ? (d.readChapterIds as string[]) : prev.readChapterIds,
              preferences: {
                ...prev.preferences,
                language: lang && ['en', 'te', 'hi', 'es', 'fr', 'ar'].includes(lang) ? lang : prev.preferences.language,
              },
            }));
            setCloudSyncState('synced');
          },
          (err) => {
            setCloudSyncState('error');
            handleFirestoreError(err, OperationType.GET, `users/${uid}`);
          }
        );
        unsubscribers.push(unsubProfile);

        // 2. Notes listener (scoped with where('ownerId', '==', uid) to satisfy list rule)
        const notesQuery = query(collection(db, 'users', uid, 'notes'), where('ownerId', '==', uid));
        const unsubNotes = onSnapshot(
          notesQuery,
          (snap) => {
            const cloudNotes: ClauseNote[] = snap.docs
              .map((docItem) => {
                const d = docItem.data();
                return {
                  id: docItem.id,
                  clauseKey: String(d.clauseKey ?? ''),
                  bookId: String(d.bookId ?? ''),
                  chapterId: String(d.chapterId ?? ''),
                  clauseId: String(d.clauseId ?? ''),
                  content: String(d.content ?? ''),
                  updatedAt: timestampToIso(d.updatedAt),
                };
              })
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            setState((prev) => ({ ...prev, notes: cloudNotes }));
          },
          (err) => {
            setCloudSyncState('error');
            handleFirestoreError(err, OperationType.LIST, `users/${uid}/notes`);
          }
        );
        unsubscribers.push(unsubNotes);

        // 3. Annotations (highlights + bookmarks) listener
        const annQuery = query(collection(db, 'users', uid, 'annotations'), where('ownerId', '==', uid));
        const unsubAnnotations = onSnapshot(
          annQuery,
          (snap) => {
            const nextHighlights: Record<string, ClauseHighlight> = {};
            const nextBookmarks: Record<string, ClauseBookmark> = {};
            for (const docItem of snap.docs) {
              const d = docItem.data();
              const clauseKey = String(d.clauseKey ?? '');
              if (!clauseKey) continue;
              if (d.kind === 'highlight' && d.color && d.color !== 'none') {
                nextHighlights[clauseKey] = {
                  clauseKey,
                  bookId: String(d.bookId ?? ''),
                  chapterId: String(d.chapterId ?? ''),
                  clauseId: String(d.clauseId ?? ''),
                  color: d.color as HighlightColor,
                  updatedAt: timestampToIso(d.updatedAt),
                };
              } else if (d.kind === 'bookmark') {
                nextBookmarks[clauseKey] = {
                  clauseKey,
                  bookId: String(d.bookId ?? ''),
                  chapterId: String(d.chapterId ?? ''),
                  clauseId: String(d.clauseId ?? ''),
                  createdAt: timestampToIso(d.createdAt),
                };
              }
            }
            setState((prev) => ({
              ...prev,
              highlights: nextHighlights,
              bookmarks: nextBookmarks,
            }));
          },
          (err) => {
            setCloudSyncState('error');
            handleFirestoreError(err, OperationType.LIST, `users/${uid}/annotations`);
          }
        );
        unsubscribers.push(unsubAnnotations);

        // 4. Custom books listener
        const booksQuery = query(collection(db, 'users', uid, 'customBooks'), where('ownerId', '==', uid));
        const unsubBooks = onSnapshot(
          booksQuery,
          (snap) => {
            const hydrated: LawBook[] = snap.docs.map((docItem) =>
              hydrateCustomBookFromDoc(docItem.id, docItem.data() as Record<string, unknown>)
            );
            setState((prev) => ({ ...prev, customBooks: hydrated }));
          },
          (err) => {
            setCloudSyncState('error');
            handleFirestoreError(err, OperationType.LIST, `users/${uid}/customBooks`);
          }
        );
        unsubscribers.push(unsubBooks);
      } catch (err) {
        if (!cancelled) {
          setCloudSyncState('error');
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
        }
      }
    }

    void bootstrapCloudSync();

    return () => {
      cancelled = true;
      userDocReadyRef.current = false;
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [isCloudVerifiedUser, user]);

  const syncUserProfilePatch = useCallback(
    (patch: Record<string, unknown>) => {
      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const path = `users/${user.uid}`;
      void updateDoc(doc(db, 'users', user.uid), {
        ...patch,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        setCloudSyncState('error');
        handleFirestoreError(err, OperationType.UPDATE, path);
      });
    },
    [isCloudVerifiedUser, user]
  );

  const allBooks: LawBook[] = useMemo(() => {
    const map = new Map<string, LawBook>();
    for (const book of cachedBookIndex.books) {
      map.set(book.id, book);
    }
    for (const customBook of state.customBooks) {
      if (!map.has(customBook.id)) {
        map.set(customBook.id, customBook);
      }
    }
    return Array.from(map.values());
  }, [cachedBookIndex.books, state.customBooks]);

  const syncBookIndexNow = useCallback(
    (trigger: BookIndexSyncTrigger = 'manual') => {
      const service = bookIndexSyncServiceRef.current;
      if (!service) return Promise.resolve(null);
      return service.syncNow(trigger);
    },
    []
  );

  const updatePreferences = useCallback(
    (patch: Partial<ReaderPreferences>) => {
      setState((prev) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          ...patch,
        },
      }));
      if (patch.language) {
        syncUserProfilePatch({ preferredLanguage: patch.language });
      }
    },
    [syncUserProfilePatch]
  );

  const setLastPosition = useCallback(
    (pos: ReadingPosition) => {
      setState((prev) => {
        const alreadyRead = prev.readChapterIds.includes(pos.chapterId);
        const nextReadChapters = alreadyRead
          ? prev.readChapterIds
          : [...prev.readChapterIds, pos.chapterId].slice(-100);
        if (!alreadyRead) {
          syncUserProfilePatch({ readChapterIds: nextReadChapters });
        }
        return {
          ...prev,
          lastPosition: pos,
          readChapterIds: nextReadChapters,
        };
      });
    },
    [syncUserProfilePatch]
  );

  const toggleHighlight = useCallback(
    (bookId: string, chapterId: string, clauseId: string, color: HighlightColor | null) => {
      const clauseKey = getClauseKey(bookId, chapterId, clauseId);
      const existing = stateRef.current.highlights[clauseKey];

      setState((prev) => ({
        ...prev,
        highlights: toggleHighlightInMap(prev.highlights, bookId, chapterId, clauseId, color),
      }));

      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const docId = sanitizeDocId(`hl_${clauseKey}`);
      const docRef = doc(db, 'users', user.uid, 'annotations', docId);
      const path = `users/${user.uid}/annotations/${docId}`;

      if (color === null || existing?.color === color) {
        void deleteDoc(docRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, path));
      } else if (existing) {
        void updateDoc(docRef, {
          color,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, path));
      } else {
        void setDoc(docRef, {
          ownerId: user.uid,
          clauseKey: clauseKey.slice(0, 160),
          bookId: bookId.slice(0, 80),
          chapterId: chapterId.slice(0, 80),
          clauseId: clauseId.slice(0, 80),
          kind: 'highlight',
          color,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, path));
      }
    },
    [isCloudVerifiedUser, user]
  );

  const toggleBookmark = useCallback(
    (bookId: string, chapterId: string, clauseId: string) => {
      const clauseKey = getClauseKey(bookId, chapterId, clauseId);
      const hadBookmark = Boolean(stateRef.current.bookmarks[clauseKey]);

      setState((prev) => {
        const next = { ...prev.bookmarks };
        if (next[clauseKey]) {
          delete next[clauseKey];
        } else {
          next[clauseKey] = {
            clauseKey,
            bookId,
            chapterId,
            clauseId,
            createdAt: new Date().toISOString(),
          };
        }
        return { ...prev, bookmarks: next };
      });

      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const docId = sanitizeDocId(`bm_${clauseKey}`);
      const docRef = doc(db, 'users', user.uid, 'annotations', docId);
      const path = `users/${user.uid}/annotations/${docId}`;

      if (hadBookmark) {
        void deleteDoc(docRef).catch((err) => handleFirestoreError(err, OperationType.DELETE, path));
      } else {
        void setDoc(docRef, {
          ownerId: user.uid,
          clauseKey: clauseKey.slice(0, 160),
          bookId: bookId.slice(0, 80),
          chapterId: chapterId.slice(0, 80),
          clauseId: clauseId.slice(0, 80),
          kind: 'bookmark',
          color: 'none',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, path));
      }
    },
    [isCloudVerifiedUser, user]
  );

  const saveNote = useCallback(
    (bookId: string, chapterId: string, clauseId: string, content: string, existingNoteId?: string) => {
      const trimmed = content.trim().slice(0, 2000);
      if (!trimmed) return;
      const clauseKey = getClauseKey(bookId, chapterId, clauseId);
      const now = new Date().toISOString();
      const noteId = sanitizeDocId(existingNoteId ?? `note_${Date.now()}`);

      setState((prev) => {
        if (existingNoteId) {
          return {
            ...prev,
            notes: prev.notes.map((n) => (n.id === existingNoteId ? { ...n, content: trimmed, updatedAt: now } : n)),
          };
        }
        const newNote: ClauseNote = {
          id: noteId,
          clauseKey,
          bookId,
          chapterId,
          clauseId,
          content: trimmed,
          updatedAt: now,
        };
        return {
          ...prev,
          notes: [newNote, ...prev.notes],
        };
      });

      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const docRef = doc(db, 'users', user.uid, 'notes', noteId);
      const path = `users/${user.uid}/notes/${noteId}`;

      if (existingNoteId) {
        void updateDoc(docRef, {
          content: trimmed,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, path));
      } else {
        void setDoc(docRef, {
          ownerId: user.uid,
          clauseKey: clauseKey.slice(0, 160),
          bookId: bookId.slice(0, 80),
          chapterId: chapterId.slice(0, 80),
          clauseId: clauseId.slice(0, 80),
          content: trimmed,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.CREATE, path));
      }
    },
    [isCloudVerifiedUser, user]
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      setState((prev) => ({
        ...prev,
        notes: prev.notes.filter((n) => n.id !== noteId),
      }));

      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const cleanId = sanitizeDocId(noteId);
      const path = `users/${user.uid}/notes/${cleanId}`;
      void deleteDoc(doc(db, 'users', user.uid, 'notes', cleanId)).catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, path)
      );
    },
    [isCloudVerifiedUser, user]
  );

  const addCustomBook = useCallback(
    (book: LawBook) => {
      setState((prev) => ({
        ...prev,
        customBooks: [book, ...prev.customBooks],
      }));

      if (!isCloudVerifiedUser || !user || !userDocReadyRef.current) return;
      const cleanBookId = sanitizeDocId(book.id);
      const firstChapter = book.chapters[0];
      const firstClause = firstChapter?.clauses[0];
      if (!firstChapter || !firstClause) return;

      const path = `users/${user.uid}/customBooks/${cleanBookId}`;
      void setDoc(doc(db, 'users', user.uid, 'customBooks', cleanBookId), {
        ownerId: user.uid,
        shortTitle: book.shortTitle.slice(0, 80),
        titleEn: book.title.en.slice(0, 160),
        jurisdiction: book.jurisdiction.slice(0, 120),
        year: book.year.slice(0, 32),
        category: book.category,
        chapterTitleEn: firstChapter.title.en.slice(0, 160),
        clauseNumber: firstClause.number.slice(0, 60),
        principleEn: firstClause.principle.en.slice(0, 120),
        clauseTextEn: firstClause.text.en.slice(0, 4000),
        explanationEn: firstClause.explanation.en.slice(0, 4000),
        clauseTextTe: (firstClause.text.te ?? '').slice(0, 4000),
        explanationTe: (firstClause.explanation.te ?? '').slice(0, 4000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.CREATE, path));
    },
    [isCloudVerifiedUser, user]
  );

  const startPlan = useCallback(
    (planId: string) => {
      setState((prev) => {
        if (prev.startedPlanIds.includes(planId)) return prev;
        const nextStarted = [...prev.startedPlanIds, planId].slice(-30);
        syncUserProfilePatch({ startedPlanIds: nextStarted });
        return {
          ...prev,
          startedPlanIds: nextStarted,
        };
      });
    },
    [syncUserProfilePatch]
  );

  const togglePlanDayComplete = useCallback(
    (planId: string, dayId: string) => {
      setState((prev) => {
        const started = prev.startedPlanIds.includes(planId)
          ? prev.startedPlanIds
          : [...prev.startedPlanIds, planId].slice(-30);
        const exists = prev.completedPlanDayIds.includes(dayId);
        const completed = exists
          ? prev.completedPlanDayIds.filter((id) => id !== dayId)
          : [...prev.completedPlanDayIds, dayId].slice(-100);
        syncUserProfilePatch({
          startedPlanIds: started,
          completedPlanDayIds: completed,
        });
        return {
          ...prev,
          startedPlanIds: started,
          completedPlanDayIds: completed,
        };
      });
    },
    [syncUserProfilePatch]
  );

  const incrementAudioMinutes = useCallback(
    (delta: number) => {
      setState((prev) => {
        const nextMinutes = Math.min(1000000, prev.audioMinutes + delta);
        syncUserProfilePatch({ audioMinutes: nextMinutes });
        return {
          ...prev,
          audioMinutes: nextMinutes,
        };
      });
    },
    [syncUserProfilePatch]
  );

  const pushActivity = useCallback((kind: ActivityItem['kind'], title: string, detail: string) => {
    const item: ActivityItem = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      title,
      detail,
      timestamp: 'Just now',
    };
    setState((prev) => ({
      ...prev,
      activities: [item, ...prev.activities].slice(0, 40),
    }));
  }, []);

  const toggleSavedBook = useCallback(
    (bookId: string) => {
      const book = [...INITIAL_LAW_BOOKS, ...stateRef.current.customBooks].find((b) => b.id === bookId);
      const alreadySaved = stateRef.current.savedBookIds.includes(bookId);
      setState((prev) => ({
        ...prev,
        savedBookIds: alreadySaved
          ? prev.savedBookIds.filter((id) => id !== bookId)
          : [bookId, ...prev.savedBookIds],
      }));
      if (!alreadySaved && book) {
        pushActivity('save', `Saved ${book.shortTitle}`, 'Added to your Saved Books');
      }
    },
    [pushActivity]
  );

  const toggleSavedPlan = useCallback(
    (planId: string, planTitle?: string) => {
      const alreadySaved = stateRef.current.savedPlanIds.includes(planId);
      setState((prev) => ({
        ...prev,
        savedPlanIds: alreadySaved
          ? prev.savedPlanIds.filter((id) => id !== planId)
          : [planId, ...prev.savedPlanIds],
      }));
      if (!alreadySaved) {
        pushActivity('plan', `Saved study plan`, planTitle ?? planId);
      }
    },
    [pushActivity]
  );

  const toggleFollowBook = useCallback(
    (bookId: string) => {
      const book = [...INITIAL_LAW_BOOKS, ...stateRef.current.customBooks].find((b) => b.id === bookId);
      const alreadyFollowed = stateRef.current.followedBookIds.includes(bookId);
      setState((prev) => ({
        ...prev,
        followedBookIds: alreadyFollowed
          ? prev.followedBookIds.filter((id) => id !== bookId)
          : [bookId, ...prev.followedBookIds],
      }));
      if (!alreadyFollowed && book) {
        pushActivity('social', `Followed ${book.shortTitle}`, 'You will receive chapter & audio updates');
      }
    },
    [pushActivity]
  );

  const toggleFollowPerson = useCallback(
    (personId: string) => {
      const person = COMMUNITY_SCHOLARS.find((p) => p.id === personId);
      const alreadyFollowed = stateRef.current.followedPeopleIds.includes(personId);
      setState((prev) => ({
        ...prev,
        followedPeopleIds: alreadyFollowed
          ? prev.followedPeopleIds.filter((id) => id !== personId)
          : [personId, ...prev.followedPeopleIds],
      }));
      if (!alreadyFollowed && person) {
        pushActivity('social', `Followed ${person.name}`, person.role);
      }
    },
    [pushActivity]
  );

  const toggleFriend = useCallback(
    (personId: string) => {
      const person = COMMUNITY_SCHOLARS.find((p) => p.id === personId);
      const alreadyFriend = stateRef.current.friendIds.includes(personId);
      setState((prev) => ({
        ...prev,
        friendIds: alreadyFriend
          ? prev.friendIds.filter((id) => id !== personId)
          : [personId, ...prev.friendIds],
      }));
      if (!alreadyFriend && person) {
        pushActivity('social', `Added ${person.name} as a study friend`, person.focus);
      }
    },
    [pushActivity]
  );

  const markNotificationRead = useCallback((notificationId: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === notificationId ? { ...n, unread: false } : n)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, unread: false })),
    }));
  }, []);

  const updateGeneralSettings = useCallback((patch: Partial<GeneralSettings>) => {
    setState((prev) => ({
      ...prev,
      generalSettings: {
        ...prev.generalSettings,
        ...patch,
      },
    }));
  }, []);

  const recordDonation = useCallback(
    (amount: number, frequency: 'once' | 'monthly') => {
      setState((prev) => ({
        ...prev,
        totalDonatedAmount: prev.totalDonatedAmount + amount,
      }));
      pushActivity(
        'donate',
        `Supported Civic Open-Access (₹${amount})`,
        frequency === 'monthly' ? 'Monthly supporter pledge' : 'One-time supporter pledge'
      );
    },
    [pushActivity]
  );

  const toggleDailyTask = useCallback(
    (taskId: string, taskTitle?: string) => {
      const done = stateRef.current.completedTaskIds.includes(taskId);
      setState((prev) => ({
        ...prev,
        completedTaskIds: done
          ? prev.completedTaskIds.filter((id) => id !== taskId)
          : [...prev.completedTaskIds, taskId],
      }));
      if (!done && taskTitle) {
        pushActivity('plan', `Completed daily task`, taskTitle);
      }
    },
    [pushActivity]
  );

  const toggleEventRsvp = useCallback(
    (eventId: string, eventTitle?: string) => {
      const joined = stateRef.current.rsvpEventIds.includes(eventId);
      setState((prev) => ({
        ...prev,
        rsvpEventIds: joined
          ? prev.rsvpEventIds.filter((id) => id !== eventId)
          : [...prev.rsvpEventIds, eventId],
      }));
      if (!joined && eventTitle) {
        pushActivity('social', `Joined civic event`, eventTitle);
      }
    },
    [pushActivity]
  );

  const togglePostLike = useCallback((postId: string) => {
    setState((prev) => ({
      ...prev,
      likedPostIds: prev.likedPostIds.includes(postId)
        ? prev.likedPostIds.filter((id) => id !== postId)
        : [...prev.likedPostIds, postId],
    }));
  }, []);

  // --- IndexedDB Offline Audio Blob Caching API ---
  const cacheChapterForOffline = useCallback(
    async (
      book: LawBook,
      chapter: Chapter,
      options?: {
        language?: LanguageCode;
        voiceName?: AudioVoiceName;
        mode?: AudioMode;
      }
    ): Promise<CachedChapterSummary | null> => {
      const targetLang = options?.language ?? stateRef.current.preferences.language;
      const targetVoice: AudioVoiceName = options?.voiceName ?? 'Kore';
      const targetMode = options?.mode ?? stateRef.current.preferences.audioMode;
      const chapterCacheKey = buildChapterCacheKey(
        book.id,
        chapter.id,
        targetLang,
        targetVoice,
        targetMode
      );

      // Abort any existing download for the same chapter edition
      const priorController = cacheAbortControllersRef.current.get(chapterCacheKey);
      if (priorController) {
        priorController.abort();
      }
      const controller = new AbortController();
      cacheAbortControllersRef.current.set(chapterCacheKey, controller);

      try {
        const summary = await cacheManagerRef.current.cacheChapterAudio({
          book,
          chapter,
          language: targetLang,
          voiceName: targetVoice,
          mode: targetMode,
          signal: controller.signal,
          onProgress: (progress) => {
            setChapterCacheProgress((prev) => ({
              ...prev,
              [chapterCacheKey]: progress,
            }));
          },
        });

        await refreshOfflineAudioCache();
        pushActivity(
          'save',
          `Saved offline audio · ${summary.chapterNumber}`,
          `${summary.bookTitle} (${summary.segmentCount} clips · ${formatBytes(summary.totalBytes)})`
        );
        return summary;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setChapterCacheProgress((prev) => {
            const next = { ...prev };
            delete next[chapterCacheKey];
            return next;
          });
          return null;
        }
        const message =
          err instanceof Error ? err.message : 'Unable to save offline audio right now.';
        setChapterCacheProgress((prev) => ({
          ...prev,
          [chapterCacheKey]: {
            chapterCacheKey,
            status: 'error',
            completedSegments: prev[chapterCacheKey]?.completedSegments ?? 0,
            totalSegments: prev[chapterCacheKey]?.totalSegments ?? 0,
            errorMessage: message,
          },
        }));
        return null;
      } finally {
        cacheAbortControllersRef.current.delete(chapterCacheKey);
      }
    },
    [pushActivity, refreshOfflineAudioCache]
  );

  const cancelChapterOfflineCaching = useCallback((chapterCacheKey: string) => {
    const controller = cacheAbortControllersRef.current.get(chapterCacheKey);
    if (controller) {
      controller.abort();
      cacheAbortControllersRef.current.delete(chapterCacheKey);
    }
  }, []);

  const removeCachedChapterAudio = useCallback(
    async (chapterCacheKey: string) => {
      await cacheManagerRef.current.removeCachedChapter(chapterCacheKey);
      setChapterCacheProgress((prev) => {
        const next = { ...prev };
        delete next[chapterCacheKey];
        return next;
      });
      await refreshOfflineAudioCache();
    },
    [refreshOfflineAudioCache]
  );

  const clearAllOfflineAudio = useCallback(async () => {
    for (const controller of cacheAbortControllersRef.current.values()) {
      controller.abort();
    }
    cacheAbortControllersRef.current.clear();
    await cacheManagerRef.current.clearAllCachedAudio();
    clearMemoryAudioClipUrls();
    setChapterCacheProgress({});
    await refreshOfflineAudioCache();
  }, [refreshOfflineAudioCache]);

  const getCachedChapterMatch = useCallback(
    (
      bookId: string,
      chapterId: string,
      language?: LanguageCode,
      voiceName?: AudioVoiceName,
      mode?: AudioMode
    ): CachedChapterSummary | undefined => {
      const targetLang = language ?? stateRef.current.preferences.language;
      const targetMode = mode ?? stateRef.current.preferences.audioMode;
      if (voiceName) {
        const exactKey = buildChapterCacheKey(bookId, chapterId, targetLang, voiceName, targetMode);
        const exact = cachedChapters.find((c) => c.chapterCacheKey === exactKey);
        if (exact) return exact;
      }
      return cachedChapters.find(
        (c) =>
          c.bookId === bookId &&
          c.chapterId === chapterId &&
          c.language === targetLang &&
          (!mode || c.mode === targetMode)
      );
    },
    [cachedChapters]
  );

  const getCachedAudioBlob = useCallback(
    (text: string, language: LanguageCode, voiceName: AudioVoiceName = 'Kore') =>
      getCachedAudioBlobFromDb(text, language, voiceName),
    []
  );

  const saveAudioBlobToCache = useCallback(
    async (params: {
      text: string;
      language: LanguageCode;
      voiceName: AudioVoiceName;
      blob: Blob;
      bookId?: string;
      chapterId?: string;
      chapterCacheKey?: string;
      segmentId?: string;
    }) => {
      await putCachedAudioBlobInDb(params);
      await refreshOfflineAudioCache();
    },
    [refreshOfflineAudioCache]
  );

  return {
    allBooks,
    customBooks: state.customBooks,
    highlights: state.highlights,
    bookmarks: state.bookmarks,
    notes: state.notes,
    startedPlanIds: state.startedPlanIds,
    completedPlanDayIds: state.completedPlanDayIds,
    readChapterIds: state.readChapterIds,
    savedBookIds: state.savedBookIds,
    savedPlanIds: state.savedPlanIds,
    followedBookIds: state.followedBookIds,
    followedPeopleIds: state.followedPeopleIds,
    friendIds: state.friendIds,
    completedTaskIds: state.completedTaskIds,
    rsvpEventIds: state.rsvpEventIds,
    likedPostIds: state.likedPostIds,
    activities: state.activities,
    notifications: state.notifications,
    generalSettings: state.generalSettings,
    totalDonatedAmount: state.totalDonatedAmount,
    audioMinutes: state.audioMinutes,
    streakDays: state.streakDays,
    lastPosition: state.lastPosition,
    preferences: state.preferences,
    cloudSyncState,
    cachedChapters,
    cachedAudioTotalBytes,
    chapterCacheProgress,
    isOffline,
    cachedBookIndex,
    bookIndexSyncState,
    lastBookIndexSyncAt: cachedBookIndex.lastSyncedAt,
    lastBookIndexSyncSummary,
    bookIndexSyncError,
    syncBookIndexNow,
    updatePreferences,
    setLastPosition,
    toggleHighlight,
    toggleBookmark,
    saveNote,
    deleteNote,
    addCustomBook,
    startPlan,
    togglePlanDayComplete,
    incrementAudioMinutes,
    toggleSavedBook,
    toggleSavedPlan,
    toggleFollowBook,
    toggleFollowPerson,
    toggleFriend,
    markNotificationRead,
    markAllNotificationsRead,
    updateGeneralSettings,
    recordDonation,
    toggleDailyTask,
    toggleEventRsvp,
    togglePostLike,
    cacheChapterForOffline,
    cancelChapterOfflineCaching,
    removeCachedChapterAudio,
    clearAllOfflineAudio,
    getCachedChapterMatch,
    getCachedAudioBlob,
    saveAudioBlobToCache,
    refreshOfflineAudioCache,
  };
}
