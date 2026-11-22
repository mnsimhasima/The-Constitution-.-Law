/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckCircle2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { AuthModal } from './components/AuthModal';
import { HomeView } from './components/HomeView';
import { LibraryView } from './components/LibraryView';
import { NavigationShell, type ReadMenuAction } from './components/NavigationShell';
import type { OttFocusTarget } from './components/OttLibraryExplorer';
import { PlansView } from './components/PlansView';
import { ProfileQrModal } from './components/ProfileQrModal';
import { ReaderView } from './components/ReaderView';
import { SavedView } from './components/SavedView';
import { SettingsModal } from './components/SettingsModal';
import { SupportTicketModal } from './components/SupportTicketModal';
import { useAudioReader } from './hooks/useAudioReader';
import { useAuth } from './hooks/useAuth';
import { useBackendStore } from './hooks/useBackendStore';
import { useLibraryStorage } from './hooks/useLibraryStorage';
import { useMobileBackgroundSync } from './hooks/useMobileBackgroundSync';
import { useScrollAutoHide } from './hooks/useScrollAutoHide';
import type { AppTab, CachedChapterSummary, SettingsSection, StudioSubTab } from './types/library';
import {
  clearChapterAudioSpeedInMap,
  loadChapterSpeedsFromStorage,
  saveChapterSpeedsToStorage,
  setChapterAudioSpeedInMap,
} from './utils/chapterAudioSpeed';
import {
  loadReadingProgressFromStorage,
  normalizeMonthlyGoalMinutes,
  recordReadingMinutesForDate,
  saveReadingProgressToStorage,
  type ReadingProgressState,
} from './utils/readingProgress';
import {
  addRecentSearch,
  loadRecentSearchesFromStorage,
  removeRecentSearch,
  saveRecentSearchesToStorage,
  type LibraryQuickMatch,
} from './utils/librarySearchOverlay';
import {
  buildQuizContextFromBook,
  getChapterCompletionKey,
  loadCompletedChaptersFromStorage,
  saveCompletedChaptersToStorage,
  type CompletedChapterRecord,
  type QuizContextTarget,
} from './utils/legalQuiz';

function checkIsAdminPath(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.startsWith('/admin');
}

export default function App() {
  const auth = useAuth();
  const storage = useLibraryStorage(auth.user);
  const backendStore = useBackendStore(auth.user);

  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => checkIsAdminPath());
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [studioSubTab, setStudioSubTab] = useState<StudioSubTab>('today');
  const [librarySearch, setLibrarySearch] = useState('');
  const [plansSearch, setPlansSearch] = useState('');
  const [readSearchOpen, setReadSearchOpen] = useState(false);
  const [readDrawer, setReadDrawer] = useState<ReadMenuAction | null>(null);
  const [selectedClauseId, setSelectedClauseId] = useState<string | undefined>(
    storage.lastPosition.clauseId
  );

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [isShellChromeLocked, setIsShellChromeLocked] = useState(false);
  const [chapterAudioSpeeds, setChapterAudioSpeeds] = useState<Record<string, number>>(() =>
    loadChapterSpeedsFromStorage()
  );
  const [recentLibrarySearches, setRecentLibrarySearches] = useState<string[]>(() =>
    loadRecentSearchesFromStorage()
  );
  const [completedChapters, setCompletedChapters] = useState<
    Record<string, CompletedChapterRecord>
  >(() => loadCompletedChaptersFromStorage());
  const [libraryQuizContext, setLibraryQuizContext] = useState<QuizContextTarget | null>(null);
  const [libraryQuizLaunchToken, setLibraryQuizLaunchToken] = useState<number>(0);
  const [ottFocusTarget, setOttFocusTarget] = useState<OttFocusTarget | null>(null);

  const mobileSync = useMobileBackgroundSync({
    enabled: !isAdminRoute,
  });

  const handleOpenOttEdition = useCallback((masterBookId?: string, editionId?: string) => {
    setOttFocusTarget((prev) => ({
      masterBookId,
      editionId,
      token: (prev?.token ?? 0) + 1,
    }));
    setActiveTab('library');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleCommitLibrarySearch = useCallback((query: string) => {
    setRecentLibrarySearches((prev) => {
      const next = addRecentSearch(prev, query);
      saveRecentSearchesToStorage(next);
      return next;
    });
  }, []);

  const handleRemoveRecentLibrarySearch = useCallback((query: string) => {
    setRecentLibrarySearches((prev) => {
      const next = removeRecentSearch(prev, query);
      saveRecentSearchesToStorage(next);
      return next;
    });
  }, []);

  const handleClearRecentLibrarySearches = useCallback(() => {
    setRecentLibrarySearches([]);
    saveRecentSearchesToStorage([]);
  }, []);

  const handleSetChapterAudioSpeed = useCallback((bookId: string, chapterId: string, speed: number) => {
    setChapterAudioSpeeds((prev) => {
      const next = setChapterAudioSpeedInMap(prev, bookId, chapterId, speed);
      if (next !== prev) {
        saveChapterSpeedsToStorage(next);
      }
      return next;
    });
  }, []);

  const handleResetChapterAudioSpeed = useCallback((bookId: string, chapterId: string) => {
    setChapterAudioSpeeds((prev) => {
      const next = clearChapterAudioSpeedInMap(prev, bookId, chapterId);
      if (next !== prev) {
        saveChapterSpeedsToStorage(next);
      }
      return next;
    });
  }, []);

  const [readingProgress, setReadingProgress] = useState<ReadingProgressState>(() =>
    loadReadingProgressFromStorage(new Date(), storage.audioMinutes)
  );

  const handleLogReadingMinutes = useCallback((deltaMinutes: number) => {
    if (!Number.isFinite(deltaMinutes) || deltaMinutes <= 0) return;
    setReadingProgress((prev) => {
      const next: ReadingProgressState = {
        ...prev,
        dailyMinutes: recordReadingMinutesForDate(prev.dailyMinutes, new Date(), deltaMinutes),
      };
      saveReadingProgressToStorage(next);
      return next;
    });
  }, []);

  const handleUpdateMonthlyGoal = useCallback((minutes: number) => {
    const normalized = normalizeMonthlyGoalMinutes(minutes);
    setReadingProgress((prev) => {
      if (prev.monthlyGoalMinutes === normalized) return prev;
      const next: ReadingProgressState = {
        ...prev,
        monthlyGoalMinutes: normalized,
      };
      saveReadingProgressToStorage(next);
      return next;
    });
  }, []);

  // Track active reading time (1 minute increments) while studying in ReaderView
  useEffect(() => {
    if (isAdminRoute || activeTab !== 'read') return;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        handleLogReadingMinutes(1);
      }
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, isAdminRoute, handleLogReadingMinutes]);

  // Sync /admin vs / route with browser history
  useEffect(() => {
    const handlePopState = () => setIsAdminRoute(checkIsAdminPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToAdmin = useCallback(() => {
    if (!window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/admin');
    }
    setIsAdminRoute(true);
    window.scrollTo({ top: 0 });
  }, []);

  const navigateToMobileApp = useCallback(() => {
    if (window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
    }
    setIsAdminRoute(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Merge background-synced cached books and live published CMS books into the library
  const mergedBooks = useMemo(() => {
    const cmsPublished = backendStore.publishedLawBooks;
    if (cmsPublished.length === 0) return storage.allBooks;
    const map = new Map(storage.allBooks.map((b) => [b.id, b]));
    cmsPublished.forEach((book) => {
      const existing = map.get(book.id);
      if (existing?.isUserAdded) return;
      map.set(book.id, {
        ...book,
        coverImage: book.coverImage ?? existing?.coverImage,
      });
    });
    return Array.from(map.values());
  }, [backendStore.publishedLawBooks, storage.allBooks]);

  const isChromeHidden = useScrollAutoHide({
    isLocked:
      isAdminRoute ||
      isAuthModalOpen ||
      isQrModalOpen ||
      isSettingsOpen ||
      isSupportModalOpen ||
      isShellChromeLocked ||
      readSearchOpen ||
      readDrawer !== null,
    resetKey: `${activeTab}:${studioSubTab}`,
  });

  const handleOpenSettings = useCallback((section: SettingsSection = 'general') => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  }, []);

  const handleActiveAudioClauseChange = useCallback((clauseId: string) => {
    setSelectedClauseId(clauseId);
  }, []);

  const handleListenMinute = useCallback(() => {
    storage.incrementAudioMinutes(1);
    handleLogReadingMinutes(1);
  }, [storage.incrementAudioMinutes, handleLogReadingMinutes]);

  const audioReader = useAudioReader({
    language: storage.preferences.language,
    speed: storage.preferences.audioSpeed,
    chapterSpeeds: chapterAudioSpeeds,
    mode: storage.preferences.audioMode,
    autoAdvance: storage.generalSettings.audioAutoAdvance,
    persistToIndexedDb: storage.generalSettings.offlineAudioCache,
    onActiveClauseChange: handleActiveAudioClauseChange,
    onListenMinute: handleListenMinute,
    onAudioCacheUpdated: storage.refreshOfflineAudioCache,
  });

  const handleToggleAutoAdvance = useCallback(
    (enabled: boolean) => {
      audioReader.setAutoAdvance(enabled);
      storage.updateGeneralSettings({ audioAutoAdvance: enabled });
    },
    [audioReader.setAutoAdvance, storage.updateGeneralSettings]
  );

  const handleCacheChapterOffline = useCallback(
    async (bookId: string, chapterId: string) => {
      const book = mergedBooks.find((b) => b.id === bookId);
      const chapter = book?.chapters.find((c) => c.id === chapterId);
      if (!book || !chapter) return;
      await storage.cacheChapterForOffline(book, chapter, {
        language: storage.preferences.language,
        voiceName: audioReader.voiceName,
        mode: storage.preferences.audioMode,
      });
    },
    [
      mergedBooks,
      storage.cacheChapterForOffline,
      storage.preferences.language,
      storage.preferences.audioMode,
      audioReader.voiceName,
    ]
  );

  const handlePlayOfflineChapter = useCallback(
    (cached: CachedChapterSummary) => {
      const book = mergedBooks.find((b) => b.id === cached.bookId);
      const chapter = book?.chapters.find((c) => c.id === cached.chapterId);
      if (!book || !chapter) return;
      if (
        storage.preferences.language !== cached.language ||
        storage.preferences.audioMode !== cached.mode
      ) {
        storage.updatePreferences({ language: cached.language, audioMode: cached.mode });
      }
      if (audioReader.voiceName !== cached.voiceName) {
        audioReader.setVoiceName(cached.voiceName);
      }
      storage.setLastPosition({ bookId: book.id, chapterId: chapter.id });
      setActiveTab('read');
      // Small defer if language/voice changed so audioReader refs pick up the cached edition cleanly
      window.setTimeout(() => {
        audioReader.startPlayback(book, chapter, 0, cached.mode, true);
      }, 30);
    },
    [
      mergedBooks,
      storage.preferences.language,
      storage.preferences.audioMode,
      storage.updatePreferences,
      storage.setLastPosition,
      audioReader.voiceName,
      audioReader.setVoiceName,
      audioReader.startPlayback,
    ]
  );

  const activeReadBook = useMemo(
    () => mergedBooks.find((b) => b.id === storage.lastPosition.bookId) ?? mergedBooks[0],
    [mergedBooks, storage.lastPosition.bookId]
  );

  const handleOpenReader = useCallback(
    (bookId: string, chapterId: string, clauseId?: string) => {
      storage.setLastPosition({ bookId, chapterId, clauseId });
      setSelectedClauseId(clauseId);
      setActiveTab('read');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [storage.setLastPosition]
  );

  const handleOpenLibrarySearchMatch = useCallback(
    (match: LibraryQuickMatch) => {
      handleOpenReader(match.bookId, match.chapterId, match.clauseId);
    },
    [handleOpenReader]
  );

  const handleCompleteChapterAndStartQuiz = useCallback(
    (bookId: string, chapterId: string) => {
      const key = getChapterCompletionKey(bookId, chapterId);
      setCompletedChapters((prev) => {
        const next: Record<string, CompletedChapterRecord> = {
          ...prev,
          [key]: {
            chapterKey: key,
            bookId,
            chapterId,
            completedAt: new Date().toISOString(),
          },
        };
        saveCompletedChaptersToStorage(next);
        return next;
      });

      const context = buildQuizContextFromBook(
        mergedBooks,
        bookId,
        chapterId,
        storage.preferences.language
      );
      setLibraryQuizContext(context);
      setLibraryQuizLaunchToken((prev) => prev + 1);
      setReadDrawer(null);
      setReadSearchOpen(false);
      setActiveTab('library');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [mergedBooks, storage.preferences.language]
  );

  const handleSelectBookChapter = useCallback(
    (bookId: string, chapterId: string, clauseId?: string) => {
      storage.setLastPosition({ bookId, chapterId, clauseId });
      setSelectedClauseId(clauseId);
    },
    [storage.setLastPosition]
  );

  const handlePlayChapterAudio = useCallback(
    (
      bookId: string,
      chapterId: string,
      startClauseIndex = 0,
      includeChapterHeader?: boolean
    ) => {
      const book = mergedBooks.find((b) => b.id === bookId);
      const chapter = book?.chapters.find((c) => c.id === chapterId);
      if (!book || !chapter) return;

      const targetClause = chapter.clauses[startClauseIndex] ?? chapter.clauses[0];
      storage.setLastPosition({
        bookId: book.id,
        chapterId: chapter.id,
        clauseId: targetClause?.id,
      });
      setSelectedClauseId(targetClause?.id);
      audioReader.startPlayback(book, chapter, startClauseIndex, undefined, includeChapterHeader);
    },
    [mergedBooks, storage.setLastPosition, audioReader.startPlayback]
  );

  const handleTriggerReadAudio = useCallback(() => {
    const isSameChapterLoaded =
      audioReader.audio.isOpen &&
      audioReader.audio.bookId === storage.lastPosition.bookId &&
      audioReader.audio.chapterId === storage.lastPosition.chapterId;

    if (isSameChapterLoaded) {
      audioReader.togglePlayPause();
    } else {
      handlePlayChapterAudio(storage.lastPosition.bookId, storage.lastPosition.chapterId, 0);
    }
  }, [
    audioReader.audio.isOpen,
    audioReader.audio.bookId,
    audioReader.audio.chapterId,
    audioReader.togglePlayPause,
    storage.lastPosition.bookId,
    storage.lastPosition.chapterId,
    handlePlayChapterAudio,
  ]);

  const handleTriggerReadMenuAction = useCallback((action: ReadMenuAction) => {
    setReadDrawer((prev) => (prev === action ? null : action));
  }, []);

  // SEPARATE BACKEND ADMIN / EDITORIAL DASHBOARD (/admin)
  if (isAdminRoute) {
    return (
      <AdminDashboard
        user={auth.user}
        authBusy={auth.authBusy}
        onSignInGoogle={auth.signInWithGoogle}
        onSignOut={auth.signOutUser}
        store={backendStore}
        onExitToMobileApp={navigateToMobileApp}
      />
    );
  }

  // MOBILE READER APPLICATION (/)
  return (
    <>
      <NavigationShell
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'read') {
            setReadDrawer(null);
            setReadSearchOpen(false);
          }
        }}
        studioSubTab={studioSubTab}
        onSelectStudioSubTab={setStudioSubTab}
        language={storage.preferences.language}
        onChangeLanguage={(lang) => storage.updatePreferences({ language: lang })}
        appDarkMode={storage.preferences.appDarkMode}
        onToggleDarkMode={() =>
          storage.updatePreferences({
            appDarkMode: !storage.preferences.appDarkMode,
            readerTheme: !storage.preferences.appDarkMode ? 'dark' : 'light',
          })
        }
        hasActiveAudio={audioReader.audio.isOpen}
        isAudioPlaying={audioReader.audio.isPlaying}
        user={auth.user}
        notifications={storage.notifications}
        onMarkNotificationRead={storage.markNotificationRead}
        onMarkAllNotificationsRead={storage.markAllNotificationsRead}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={auth.signOutUser}
        onOpenQrModal={() => setIsQrModalOpen(true)}
        onOpenSettings={handleOpenSettings}
        onOpenSupportModal={() => setIsSupportModalOpen(true)}
        onOpenAdminDashboard={navigateToAdmin}
        librarySearch={librarySearch}
        onLibrarySearchChange={setLibrarySearch}
        libraryBooks={mergedBooks}
        libraryRecentSearches={recentLibrarySearches}
        onCommitLibrarySearch={handleCommitLibrarySearch}
        onRemoveRecentSearch={handleRemoveRecentLibrarySearch}
        onClearRecentSearches={handleClearRecentLibrarySearches}
        onOpenLibrarySearchMatch={handleOpenLibrarySearchMatch}
        plansSearch={plansSearch}
        onPlansSearchChange={setPlansSearch}
        readBookTitle={activeReadBook?.shortTitle ?? 'Read'}
        readSearchOpen={readSearchOpen}
        onToggleReadSearch={() => setReadSearchOpen((prev) => !prev)}
        onTriggerReadAudio={handleTriggerReadAudio}
        onTriggerReadMenuAction={handleTriggerReadMenuAction}
        isChromeHidden={isChromeHidden}
        onChromeLockChange={setIsShellChromeLocked}
      >
        {activeTab !== 'library' && mobileSync.syncNotice?.report.hasChanges && (
          <div
            role="status"
            className="mb-4 flex flex-col gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="flex-1 leading-relaxed">{mobileSync.syncNotice.message}</span>
              <button
                type="button"
                onClick={mobileSync.dismissSyncNotice}
                aria-label="Dismiss background sync notice"
                className="shrink-0 text-emerald-700 hover:text-emerald-950 dark:text-emerald-300 cursor-pointer sm:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 pl-6 sm:pl-0">
              {mobileSync.syncNotice.focusEditionId && (
                <button
                  type="button"
                  onClick={() => {
                    const notice = mobileSync.syncNotice;
                    mobileSync.dismissSyncNotice();
                    handleOpenOttEdition(notice?.focusMasterBookId, notice?.focusEditionId);
                  }}
                  className="inline-flex h-8 items-center rounded-xl bg-emerald-700 px-3.5 text-[11px] font-bold text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
                >
                  View Updates
                </button>
              )}
              <button
                type="button"
                onClick={mobileSync.dismissSyncNotice}
                aria-label="Dismiss background sync notice"
                className="hidden shrink-0 text-emerald-700 hover:text-emerald-950 dark:text-emerald-300 cursor-pointer sm:inline-flex"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'home' && (
          <HomeView
            studioSubTab={studioSubTab}
            books={mergedBooks}
            language={storage.preferences.language}
            user={auth.user}
            liveCommunityPosts={backendStore.communityPosts}
            streakDays={storage.streakDays}
            dailyReadingMinutes={readingProgress.dailyMinutes}
            audioMinutes={storage.audioMinutes}
            completedTaskIds={storage.completedTaskIds}
            rsvpEventIds={storage.rsvpEventIds}
            likedPostIds={storage.likedPostIds}
            followedPeopleIds={storage.followedPeopleIds}
            isAudioPlaying={audioReader.audio.isPlaying}
            activeAudioClauseId={audioReader.currentSegment?.clauseId}
            onToggleDailyTask={(taskId, taskTitle) => {
              const wasDone = storage.completedTaskIds.includes(taskId);
              storage.toggleDailyTask(taskId, taskTitle);
              if (!wasDone) {
                handleLogReadingMinutes(5);
              }
            }}
            onToggleEventRsvp={storage.toggleEventRsvp}
            onTogglePostLike={storage.togglePostLike}
            onToggleFollowPerson={storage.toggleFollowPerson}
            onSubmitCommunityPost={backendStore.createModeratedCommunityPost}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenReader={handleOpenReader}
            onPlayChapterAudio={handlePlayChapterAudio}
            onLogReadingMinutes={handleLogReadingMinutes}
            onNavigateProfile={() => setActiveTab('profile')}
          />
        )}

        {activeTab === 'read' && (
          <ReaderView
            books={mergedBooks}
            bookId={storage.lastPosition.bookId}
            chapterId={storage.lastPosition.chapterId}
            selectedClauseId={selectedClauseId}
            activeAudioBookId={audioReader.audio.bookId}
            activeAudioChapterId={audioReader.audio.chapterId}
            activeAudioClauseId={audioReader.currentSegment?.clauseId}
            activeAudioSegment={audioReader.currentSegment}
            audioQueue={audioReader.audio.queue}
            audioQueueIndex={audioReader.audio.currentIndex}
            audioCompletedIds={audioReader.audio.completedIds}
            audioAutoAdvance={audioReader.audio.autoAdvance}
            onToggleAutoAdvance={handleToggleAutoAdvance}
            onJumpToQueueIndex={audioReader.jumpToQueueIndex}
            isAudioPlaying={audioReader.audio.isPlaying}
            isAudioLoading={audioReader.audio.isLoadingClip}
            audioError={audioReader.audio.audioError}
            audioVoice={audioReader.voiceName}
            onChangeAudioVoice={audioReader.setVoiceName}
            chapterAudioSpeeds={chapterAudioSpeeds}
            onSetChapterAudioSpeed={handleSetChapterAudioSpeed}
            onResetChapterAudioSpeed={handleResetChapterAudioSpeed}
            audioElapsedSeconds={audioReader.audio.elapsedSeconds}
            audioDurationSeconds={audioReader.currentDuration}
            searchOpen={readSearchOpen}
            onCloseSearch={() => setReadSearchOpen(false)}
            activeDrawer={readDrawer}
            onCloseDrawer={() => setReadDrawer(null)}
            preferences={storage.preferences}
            highlights={storage.highlights}
            bookmarks={storage.bookmarks}
            notes={storage.notes}
            onSelectBookChapter={handleSelectBookChapter}
            onUpdatePreferences={storage.updatePreferences}
            onToggleHighlight={storage.toggleHighlight}
            onToggleBookmark={storage.toggleBookmark}
            onSaveNote={storage.saveNote}
            onDeleteNote={storage.deleteNote}
            onPlayChapterAudio={handlePlayChapterAudio}
            onTogglePlayPause={audioReader.togglePlayPause}
            onSkipAudioSegment={audioReader.skipSegment}
            cachedChapters={storage.cachedChapters}
            chapterCacheProgress={storage.chapterCacheProgress}
            isOffline={storage.isOffline}
            onCacheChapterOffline={handleCacheChapterOffline}
            onCancelCacheChapter={storage.cancelChapterOfflineCaching}
            onRemoveCachedChapter={storage.removeCachedChapterAudio}
            completedChapterKeys={Object.keys(completedChapters)}
            onCompleteChapterAndStartQuiz={handleCompleteChapterAndStartQuiz}
            isChromeHidden={isChromeHidden}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            books={mergedBooks}
            language={storage.preferences.language}
            searchQuery={librarySearch}
            savedBookIds={storage.savedBookIds}
            followedBookIds={storage.followedBookIds}
            quizContext={libraryQuizContext}
            quizLaunchToken={libraryQuizLaunchToken}
            completedChapters={completedChapters}
            mobileSync={mobileSync}
            ottFocusTarget={ottFocusTarget}
            onClearSearch={() => setLibrarySearch('')}
            onToggleSavedBook={storage.toggleSavedBook}
            onToggleFollowBook={storage.toggleFollowBook}
            onOpenReader={handleOpenReader}
            onPlayChapterAudio={handlePlayChapterAudio}
          />
        )}

        {activeTab === 'plans' && (
          <PlansView
            books={mergedBooks}
            language={storage.preferences.language}
            searchQuery={plansSearch}
            startedPlanIds={storage.startedPlanIds}
            savedPlanIds={storage.savedPlanIds}
            completedPlanDayIds={storage.completedPlanDayIds}
            onClearSearch={() => setPlansSearch('')}
            onStartPlan={storage.startPlan}
            onToggleSavedPlan={storage.toggleSavedPlan}
            onTogglePlanDayComplete={storage.togglePlanDayComplete}
            onOpenReader={handleOpenReader}
            onPlayChapterAudio={handlePlayChapterAudio}
          />
        )}

        {activeTab === 'profile' && (
          <SavedView
            user={auth.user}
            cloudSyncState={storage.cloudSyncState}
            books={mergedBooks}
            language={storage.preferences.language}
            highlights={storage.highlights}
            bookmarks={storage.bookmarks}
            notes={storage.notes}
            savedBookIds={storage.savedBookIds}
            savedPlanIds={storage.savedPlanIds}
            followedBookIds={storage.followedBookIds}
            followedPeopleIds={storage.followedPeopleIds}
            friendIds={storage.friendIds}
            completedPlanDayIds={storage.completedPlanDayIds}
            activities={storage.activities}
            streakDays={storage.streakDays}
            audioMinutes={storage.audioMinutes}
            totalDonatedAmount={storage.totalDonatedAmount}
            onToggleSavedBook={storage.toggleSavedBook}
            onToggleSavedPlan={storage.toggleSavedPlan}
            onToggleFollowBook={storage.toggleFollowBook}
            onToggleFollowPerson={storage.toggleFollowPerson}
            onToggleFriend={storage.toggleFriend}
            onRecordDonation={storage.recordDonation}
            onOpenReader={handleOpenReader}
            onPlayChapterAudio={handlePlayChapterAudio}
            onDeleteNote={storage.deleteNote}
            onRemoveBookmark={storage.toggleBookmark}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onOpenQrModal={() => setIsQrModalOpen(true)}
            cachedChapters={storage.cachedChapters}
            cachedAudioTotalBytes={storage.cachedAudioTotalBytes}
            chapterCacheProgress={storage.chapterCacheProgress}
            audioVoice={audioReader.voiceName}
            audioMode={storage.preferences.audioMode}
            isOffline={storage.isOffline}
            onCacheChapterOffline={handleCacheChapterOffline}
            onRemoveCachedChapter={storage.removeCachedChapterAudio}
            onClearAllOfflineAudio={storage.clearAllOfflineAudio}
            onPlayOfflineChapter={handlePlayOfflineChapter}
            dailyReadingMinutes={readingProgress.dailyMinutes}
            monthlyGoalMinutes={readingProgress.monthlyGoalMinutes}
            onUpdateMonthlyGoal={handleUpdateMonthlyGoal}
            onLogReadingMinutes={handleLogReadingMinutes}
            mobileSync={mobileSync}
            onOpenOttEdition={handleOpenOttEdition}
          />
        )}
      </NavigationShell>

      {activeTab !== 'read' && (
        <AudioPlayerBar
          audio={audioReader.audio}
          currentSegment={audioReader.currentSegment}
          currentDuration={audioReader.currentDuration}
          language={storage.preferences.language}
          speed={audioReader.effectiveSpeed}
          mode={storage.preferences.audioMode}
          onTogglePlayPause={audioReader.togglePlayPause}
          onSkipSegment={audioReader.skipSegment}
          onJumpToQueueIndex={audioReader.jumpToQueueIndex}
          onToggleAutoAdvance={handleToggleAutoAdvance}
          onSeek={audioReader.seekWithinSegment}
          onChangeSpeed={(speed) => {
            if (audioReader.isChapterSpeedOverride && audioReader.audio.bookId && audioReader.audio.chapterId) {
              handleSetChapterAudioSpeed(audioReader.audio.bookId, audioReader.audio.chapterId, speed);
            } else {
              storage.updatePreferences({ audioSpeed: speed });
            }
          }}
          onChangeMode={(mode) => storage.updatePreferences({ audioMode: mode })}
          onChangeSleep={audioReader.setSleepMinutes}
          onClose={audioReader.closePlayer}
          isChromeHidden={isChromeHidden}
          onOpenCurrentClause={() => {
            if (audioReader.audio.bookId && audioReader.audio.chapterId) {
              handleOpenReader(
                audioReader.audio.bookId,
                audioReader.audio.chapterId,
                audioReader.currentSegment?.clauseId
              );
            }
          }}
        />
      )}

      <AuthModal
        isOpen={isAuthModalOpen}
        user={auth.user}
        authBusy={auth.authBusy}
        authError={auth.authError}
        cloudSyncState={storage.cloudSyncState}
        onSignInGoogle={auth.signInWithGoogle}
        onSignOut={auth.signOutUser}
        onClearError={auth.clearAuthError}
        onClose={() => setIsAuthModalOpen(false)}
      />

      <ProfileQrModal
        isOpen={isQrModalOpen}
        user={auth.user}
        streakDays={storage.streakDays}
        friendsCount={storage.friendIds.length}
        onClose={() => setIsQrModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        activeSection={settingsSection}
        onChangeSection={setSettingsSection}
        user={auth.user}
        cloudSyncState={storage.cloudSyncState}
        preferences={storage.preferences}
        generalSettings={storage.generalSettings}
        cachedChaptersCount={storage.cachedChapters.length}
        cachedAudioTotalBytes={storage.cachedAudioTotalBytes}
        onClearOfflineAudio={storage.clearAllOfflineAudio}
        onUpdatePreferences={storage.updatePreferences}
        onUpdateGeneralSettings={storage.updateGeneralSettings}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={auth.signOutUser}
        onClose={() => setIsSettingsOpen(false)}
      />

      <SupportTicketModal
        isOpen={isSupportModalOpen}
        user={auth.user}
        tickets={backendStore.supportTickets}
        onSubmitTicket={backendStore.createSupportTicket}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onClose={() => setIsSupportModalOpen(false)}
      />
    </>
  );
}
