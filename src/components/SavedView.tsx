import type { User } from 'firebase/auth';
import {
  Activity,
  ArrowRight,
  Bookmark,
  BookMarked,
  BookOpen,
  Check,
  Cloud,
  Compass,
  Download,
  Flame,
  HardDrive,
  Headphones,
  HeartHandshake,
  Highlighter,
  Loader2,
  LogIn,
  MessageSquareText,
  QrCode,
  RefreshCw,
  Rss,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { COMMUNITY_SCHOLARS, INITIAL_READING_PLANS } from '../data/booksData';
import type { CloudSyncState } from '../hooks/useLibraryStorage';
import type { MobileBackgroundSyncController } from '../hooks/useMobileBackgroundSync';
import type {
  ActivityItem,
  AudioMode,
  AudioVoiceName,
  CachedChapterSummary,
  ChapterCacheProgress,
  ClauseBookmark,
  ClauseHighlight,
  ClauseNote,
  LanguageCode,
  LawBook,
} from '../types/library';
import { calculatePlanProgress, getLocalizedText } from '../utils/libraryLogic';
import { buildChapterCacheKey, formatBytes } from '../utils/offlineAudioCache';
import { BookCover } from './BookCover';
import { ReadingProgressSection } from './ReadingProgressSection';

interface SavedViewProps {
  user: User | null;
  cloudSyncState: CloudSyncState;
  books: LawBook[];
  language: LanguageCode;
  highlights: Record<string, ClauseHighlight>;
  bookmarks: Record<string, ClauseBookmark>;
  notes: ClauseNote[];
  savedBookIds: string[];
  savedPlanIds: string[];
  followedBookIds: string[];
  followedPeopleIds: string[];
  friendIds: string[];
  completedPlanDayIds: string[];
  activities: ActivityItem[];
  streakDays: number;
  audioMinutes: number;
  totalDonatedAmount: number;
  onToggleSavedBook: (bookId: string) => void;
  onToggleSavedPlan: (planId: string, planTitle?: string) => void;
  onToggleFollowBook: (bookId: string) => void;
  onToggleFollowPerson: (personId: string) => void;
  onToggleFriend: (personId: string) => void;
  onRecordDonation: (amount: number, frequency: 'once' | 'monthly') => void;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
  onPlayChapterAudio: (bookId: string, chapterId: string, startClauseIndex?: number) => void;
  onDeleteNote: (noteId: string) => void;
  onRemoveBookmark: (bookId: string, chapterId: string, clauseId: string) => void;
  onOpenAuthModal: () => void;
  onOpenQrModal: () => void;
  cachedChapters?: CachedChapterSummary[];
  cachedAudioTotalBytes?: number;
  chapterCacheProgress?: Record<string, ChapterCacheProgress>;
  audioVoice?: AudioVoiceName;
  audioMode?: AudioMode;
  isOffline?: boolean;
  onCacheChapterOffline?: (bookId: string, chapterId: string) => Promise<void>;
  onRemoveCachedChapter?: (chapterCacheKey: string) => Promise<void>;
  onClearAllOfflineAudio?: () => Promise<void>;
  onPlayOfflineChapter?: (cached: CachedChapterSummary) => void;
  dailyReadingMinutes?: Record<string, number>;
  monthlyGoalMinutes?: number;
  onUpdateMonthlyGoal?: (minutes: number) => void;
  onLogReadingMinutes?: (minutes: number) => void;
  mobileSync?: MobileBackgroundSyncController;
  onOpenOttEdition?: (masterBookId: string, editionId: string) => void;
}

type MainHubTab = 'activities' | 'saved' | 'friends' | 'following' | 'donate';
type SavedSubTab = 'books' | 'offline' | 'plans' | 'notes' | 'highlights' | 'bookmarks';

const DONATION_PRESETS = [100, 250, 500, 1000];

export function SavedView({
  user,
  cloudSyncState,
  books,
  language,
  highlights,
  bookmarks,
  notes,
  savedBookIds,
  savedPlanIds,
  followedBookIds,
  followedPeopleIds,
  friendIds,
  completedPlanDayIds,
  activities,
  streakDays,
  audioMinutes,
  totalDonatedAmount,
  onToggleSavedBook,
  onToggleSavedPlan,
  onToggleFollowBook,
  onToggleFollowPerson,
  onToggleFriend,
  onRecordDonation,
  onOpenReader,
  onPlayChapterAudio,
  onDeleteNote,
  onRemoveBookmark,
  onOpenAuthModal,
  onOpenQrModal,
  cachedChapters = [],
  cachedAudioTotalBytes = 0,
  chapterCacheProgress = {},
  audioVoice = 'Kore',
  audioMode = 'both',
  isOffline = false,
  onCacheChapterOffline,
  onRemoveCachedChapter,
  onClearAllOfflineAudio,
  onPlayOfflineChapter,
  dailyReadingMinutes = {},
  monthlyGoalMinutes = 300,
  onUpdateMonthlyGoal,
  onLogReadingMinutes,
  mobileSync,
  onOpenOttEdition,
}: SavedViewProps) {
  const [activeHubTab, setActiveHubTab] = useState<MainHubTab>('activities');
  const [savedSubTab, setSavedSubTab] = useState<SavedSubTab>('books');
  const [donationAmount, setDonationAmount] = useState<number>(250);
  const [donationFreq, setDonationFreq] = useState<'once' | 'monthly'>('monthly');
  const [donationConfirmed, setDonationConfirmed] = useState<string | null>(null);

  const highlightList = Object.values(highlights);
  const bookmarkList = Object.values(bookmarks);
  const savedBooks = books.filter((b) => savedBookIds.includes(b.id));
  const savedPlans = INITIAL_READING_PLANS.filter((p) => savedPlanIds.includes(p.id));

  const lookupClause = (bookId: string, chapterId: string, clauseId: string) => {
    const book = books.find((b) => b.id === bookId);
    const chapter = book?.chapters.find((c) => c.id === chapterId);
    const clause = chapter?.clauses.find((cl) => cl.id === clauseId);
    return { book, chapter, clause };
  };

  const handleConfirmDonation = () => {
    onRecordDonation(donationAmount, donationFreq);
    setDonationConfirmed(
      `Thank you! Your ₹${donationAmount} ${donationFreq === 'monthly' ? 'monthly' : 'one-time'} civic education pledge was recorded.`
    );
  };

  return (
    <div className="min-w-0 space-y-5">
      {/* Profile Hero Card with 3 Primary Profile Action Buttons (Make Friends, Follow People & Books, Donate) */}
      <section className="min-w-0 overflow-hidden rounded-[26px] bg-gradient-to-br from-[#0F1E4A] via-[#172554] to-[#2563EB] p-5 text-white shadow-xl sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? 'Profile'}
                referrerPolicy="no-referrer"
                className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/30 sm:h-16 sm:w-16"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 font-display text-2xl font-bold sm:h-16 sm:w-16">
                {user ? (user.displayName ?? 'U').slice(0, 1).toUpperCase() : <Cloud className="h-7 w-7" />}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200">
                {user ? `Cloud Synced · ${cloudSyncState}` : 'Civic Reader Profile'}
              </p>
              <h1 className="mt-0.5 truncate font-display text-xl font-bold sm:text-2xl">
                {user ? user.displayName ?? 'Legal Scholar' : 'Civic Scholar Profile'}
              </h1>
              <p className="mt-1 break-words font-mono text-[11px] text-blue-100/90 sm:text-xs">
                {friendIds.length} Friends · {followedPeopleIds.length + followedBookIds.length}{' '}
                Following · {streakDays}d Streak · {audioMinutes}m Audio
              </p>
            </div>
          </div>

          {!user && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-blue-50 cursor-pointer"
            >
              <LogIn className="h-4 w-4" />
              <span>Login</span>
            </button>
          )}
        </div>

        {/* Three Requested Profile Action Buttons */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setActiveHubTab('friends')}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'friends'
                ? 'bg-white text-slate-950 shadow-md'
                : 'border border-white/25 bg-white/12 text-white hover:bg-white/22'
            }`}
          >
            <UserPlus className="h-4 w-4" />
            <span>Make Friends ({friendIds.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('following')}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'following'
                ? 'bg-white text-slate-950 shadow-md'
                : 'border border-white/25 bg-white/12 text-white hover:bg-white/22'
            }`}
          >
            <Rss className="h-4 w-4" />
            <span>Follow People & Books ({followedPeopleIds.length + followedBookIds.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveHubTab('donate')}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
              activeHubTab === 'donate'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'border border-amber-300/40 bg-amber-400/20 text-amber-100 hover:bg-amber-400/30'
            }`}
          >
            <HeartHandshake className="h-4 w-4" />
            <span>Donate to App</span>
          </button>
        </div>
      </section>

      {/* Main Profile Navigation Strip: Activities & Saved (+ Active Social/Donate Indicator) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveHubTab('activities')}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
            activeHubTab === 'activities'
              ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
              : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
          }`}
        >
          <Activity className="h-4 w-4" />
          <span>Activities ({activities.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveHubTab('saved')}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
            activeHubTab === 'saved'
              ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
              : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
          }`}
        >
          <BookMarked className="h-4 w-4" />
          <span>
            Saved ({savedBooks.length + savedPlans.length + notes.length + highlightList.length + bookmarkList.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveHubTab('saved');
            setSavedSubTab('books');
          }}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
            activeHubTab === 'saved' && savedSubTab === 'books'
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-500/20 dark:text-blue-200 dark:ring-blue-500/40'
              : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Saved Books ({savedBooks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveHubTab('saved');
            setSavedSubTab('plans');
          }}
          className={`inline-flex min-h-[42px] items-center gap-2 rounded-2xl px-4 text-xs font-bold transition cursor-pointer ${
            activeHubTab === 'saved' && savedSubTab === 'plans'
              ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-300 dark:bg-blue-500/20 dark:text-blue-200 dark:ring-blue-500/40'
              : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-950 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
          }`}
        >
          <Compass className="h-4 w-4" />
          <span>Saved Plans ({savedPlans.length})</span>
        </button>
      </div>

      {/* TAB 1: ACTIVITIES */}
      {activeHubTab === 'activities' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Study Streak</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-2xl font-bold text-slate-950 dark:text-white">
                <Flame className="h-5 w-5 text-amber-500" />
                {streakDays} days
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Audio Time</p>
              <p className="mt-1 flex items-center gap-1.5 font-mono text-2xl font-bold text-slate-950 dark:text-white">
                <Headphones className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                {audioMinutes} mins
              </p>
            </div>
            <div className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Saved Items</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-950 dark:text-white">
                {savedBooks.length} books · {savedPlans.length} plans
              </p>
            </div>
          </div>

          <ReadingProgressSection
            dailyMinutes={dailyReadingMinutes}
            monthlyGoalMinutes={monthlyGoalMinutes}
            streakDays={streakDays}
            onUpdateMonthlyGoal={(minutes) => onUpdateMonthlyGoal?.(minutes)}
            onLogReadingMinutes={(minutes) => onLogReadingMinutes?.(minutes)}
          />

          <div className="rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              Recent Activity Feed
            </h2>
            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/80">
              {activities.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{item.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SAVED ITEMS (Books, Plans, Notes, Highlights, Bookmarks) */}
      {activeHubTab === 'saved' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'books', label: `Saved Books (${savedBooks.length})`, icon: BookOpen },
                {
                  id: 'offline',
                  label: `Offline Audio (${cachedChapters.length + (mobileSync?.offlinePackages.length ?? 0)})`,
                  icon: HardDrive,
                },
                { id: 'plans', label: `Saved Plans (${savedPlans.length})`, icon: Compass },
                { id: 'notes', label: `Notes (${notes.length})`, icon: MessageSquareText },
                { id: 'highlights', label: `Highlights (${highlightList.length})`, icon: Highlighter },
                { id: 'bookmarks', label: `Bookmarks (${bookmarkList.length})`, icon: Bookmark },
              ] as const
            ).map((sub) => {
              const Icon = sub.icon;
              const active = savedSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSavedSubTab(sub.id)}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#2563EB] text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>

          {savedSubTab === 'books' && (
            <div className="grid gap-4 md:grid-cols-2">
              {savedBooks.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620] md:col-span-2">
                  No saved books yet. Tap the bookmark icon on any Constitution, Law, or Ambedkar History book in the Library.
                </div>
              ) : (
                savedBooks.map((book) => {
                  const firstChapter = book.chapters[0];
                  const chapterKey = firstChapter
                    ? buildChapterCacheKey(book.id, firstChapter.id, language, audioVoice, audioMode)
                    : '';
                  const cachedEntry = cachedChapters.find(
                    (c) =>
                      c.bookId === book.id &&
                      firstChapter &&
                      c.chapterId === firstChapter.id &&
                      c.language === language
                  );
                  const prog = chapterKey ? chapterCacheProgress[chapterKey] : undefined;
                  const isCaching = prog?.status === 'caching';

                  return (
                    <article
                      key={book.id}
                      className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <BookCover book={book} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-display text-base font-bold text-slate-950 dark:text-white">
                            {getLocalizedText(book.title, language)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {book.jurisdiction} · {book.chapters.length} chapters
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {firstChapter && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenReader(book.id, firstChapter.id)}
                                  className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white dark:bg-blue-600 cursor-pointer"
                                >
                                  Read
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    cachedEntry && onPlayOfflineChapter
                                      ? onPlayOfflineChapter(cachedEntry)
                                      : onPlayChapterAudio(book.id, firstChapter.id, 0)
                                  }
                                  className="rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 cursor-pointer"
                                >
                                  {cachedEntry ? 'Listen Offline' : 'Listen'}
                                </button>
                                {cachedEntry ? (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2 py-1 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                    <HardDrive className="h-3 w-3" />
                                    {formatBytes(cachedEntry.totalBytes)}
                                  </span>
                                ) : onCacheChapterOffline ? (
                                  <button
                                    type="button"
                                    disabled={isCaching || isOffline}
                                    onClick={() => void onCacheChapterOffline(book.id, firstChapter.id)}
                                    aria-label={`Save ${book.shortTitle} offline audio`}
                                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 cursor-pointer"
                                  >
                                    {isCaching ? (
                                      <>
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span>
                                          {prog.completedSegments}/{prog.totalSegments}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Download className="h-3 w-3" />
                                        <span>Save Offline</span>
                                      </>
                                    )}
                                  </button>
                                ) : null}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onToggleSavedBook(book.id)}
                        aria-label={`Remove ${book.shortTitle} from saved books`}
                        className="shrink-0 text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {savedSubTab === 'offline' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                      IndexedDB Offline Audio Vault
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {cachedChapters.length} cached chapter{cachedChapters.length === 1 ? '' : 's'} ·{' '}
                      {formatBytes(cachedAudioTotalBytes)} stored on this device
                      {isOffline ? ' · Offline Mode Active' : ''}
                    </p>
                  </div>
                </div>
                {cachedChapters.length > 0 && onClearAllOfflineAudio && (
                  <button
                    type="button"
                    onClick={() => void onClearAllOfflineAudio()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              {mobileSync && mobileSync.offlinePackages.length > 0 && (
                <div className="space-y-3 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
                        Offline Multi-Language Books ({mobileSync.offlinePackages.length})
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Automatically compares local version numbers and downloads new or updated chapters &amp; sections on reconnect.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={mobileSync.isSyncing || !mobileSync.isOnline}
                      onClick={() => void mobileSync.syncNow('manual')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${mobileSync.isSyncing ? 'animate-spin' : ''}`} />
                      <span>{mobileSync.isSyncing ? 'Checking…' : 'Check for Updates'}</span>
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {mobileSync.offlinePackages.map((pkg) => (
                      <article
                        key={pkg.editionId}
                        className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400 tabular-nums">
                            {pkg.edition.nativeLanguageName} · v{pkg.manifest.editionVersion} ·{' '}
                            {pkg.chapters.length} ch · {pkg.units.length} sections ·{' '}
                            {formatBytes(pkg.manifest.totalAudioBytes)}
                          </p>
                          <p className="mt-1 truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                            {pkg.edition.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Synced {new Date(pkg.manifest.lastSyncedAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {onOpenOttEdition && (
                            <button
                              type="button"
                              onClick={() => onOpenOttEdition(pkg.masterBook.id, pkg.editionId)}
                              className="inline-flex h-8 flex-1 items-center justify-center rounded-xl bg-[#2563EB] px-3 text-xs font-bold text-white hover:bg-[#1D4ED8] cursor-pointer"
                            >
                              Open Book
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void mobileSync.removeOfflineEdition(pkg.editionId)}
                            aria-label={`Remove offline ${pkg.edition.title}`}
                            className="inline-flex h-8 items-center justify-center rounded-xl border border-rose-200 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {cachedChapters.length === 0 && (mobileSync?.offlinePackages.length ?? 0) === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620]">
                  No offline chapters saved yet. Open any chapter in the Reader → Select Audio or tap{' '}
                  <span className="font-bold text-slate-700 dark:text-slate-200">Save Offline</span>{' '}
                  on your Saved Books to download audio blobs into IndexedDB.
                </div>
              ) : cachedChapters.length === 0 ? null : (
                <div className="grid gap-3 md:grid-cols-2">
                  {cachedChapters.map((cached) => (
                    <article
                      key={cached.chapterCacheKey}
                      className="flex flex-col justify-between gap-3 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                            {cached.language.toUpperCase()} · {cached.voiceName} · {cached.segmentCount}{' '}
                            clips · {formatBytes(cached.totalBytes)}
                          </p>
                          <p className="mt-1 truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                            {cached.bookTitle}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                            {cached.chapterNumber} · {cached.chapterTitle}
                          </p>
                        </div>
                        {onRemoveCachedChapter && (
                          <button
                            type="button"
                            onClick={() => void onRemoveCachedChapter(cached.chapterCacheKey)}
                            aria-label={`Delete offline audio for ${cached.chapterTitle}`}
                            className="shrink-0 text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            onPlayOfflineChapter
                              ? onPlayOfflineChapter(cached)
                              : onPlayChapterAudio(cached.bookId, cached.chapterId, 0)
                          }
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-3 text-xs font-bold text-white hover:bg-[#1D4ED8] cursor-pointer"
                        >
                          {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Headphones className="h-3.5 w-3.5" />}
                          <span>Listen Offline</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenReader(cached.bookId, cached.chapterId)}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          Open
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {savedSubTab === 'plans' && (
            <div className="grid gap-4 md:grid-cols-2">
              {savedPlans.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620] md:col-span-2">
                  No saved plans yet. Save any guided study plan in the Plans tab.
                </div>
              ) : (
                savedPlans.map((plan) => {
                  const stat = calculatePlanProgress(plan, completedPlanDayIds);
                  const nextDay =
                    plan.days.find((d) => !completedPlanDayIds.includes(d.id)) ?? plan.days[0];
                  return (
                    <article
                      key={plan.id}
                      className="flex flex-col justify-between rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                            {plan.category} · {stat.completedCount}/{stat.totalCount} Days
                          </span>
                          <button
                            type="button"
                            onClick={() => onToggleSavedPlan(plan.id)}
                            aria-label="Remove saved plan"
                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <h3 className="mt-1 font-display text-base font-bold text-slate-950 dark:text-white">
                          {getLocalizedText(plan.title, language)}
                        </h3>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full bg-[#2563EB]"
                            style={{ width: `${Math.max(6, stat.percentage)}%` }}
                          />
                        </div>
                      </div>
                      {nextDay && (
                        <button
                          type="button"
                          onClick={() => onOpenReader(nextDay.bookId, nextDay.chapterId, nextDay.clauseId)}
                          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                        >
                          Continue Day {nextDay.dayNumber}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}

          {savedSubTab === 'notes' && (
            <div className="space-y-3">
              {notes.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620]">
                  Tap any clause in Read mode to write your first study note.
                </div>
              ) : (
                notes.map((note) => {
                  const { book, clause } = lookupClause(note.bookId, note.chapterId, note.clauseId);
                  return (
                    <article
                      key={note.id}
                      className="rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
                            {book?.shortTitle ?? note.bookId} · {clause?.number ?? note.clauseId}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
                            {note.content}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDeleteNote(note.id)}
                          aria-label="Delete note"
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenReader(note.bookId, note.chapterId, note.clauseId)}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                      >
                        Jump to Clause
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {savedSubTab === 'highlights' && (
            <div className="space-y-3">
              {highlightList.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620]">
                  No highlighted clauses yet.
                </div>
              ) : (
                highlightList.map((hl) => {
                  const { book, clause } = lookupClause(hl.bookId, hl.chapterId, hl.clauseId);
                  return (
                    <article
                      key={hl.clauseKey}
                      className="rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
                        {book?.shortTitle ?? hl.bookId} · {clause?.number ?? hl.clauseId}
                      </p>
                      {clause && (
                        <p className="mt-2 line-clamp-3 font-reading text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                          {getLocalizedText(clause.text, language)}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenReader(hl.bookId, hl.chapterId, hl.clauseId)}
                        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                      >
                        Open in Reader
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {savedSubTab === 'bookmarks' && (
            <div className="space-y-3">
              {bookmarkList.length === 0 ? (
                <div className="rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-[#121620]">
                  No bookmarked clauses yet.
                </div>
              ) : (
                bookmarkList.map((bm) => {
                  const { book, clause } = lookupClause(bm.bookId, bm.chapterId, bm.clauseId);
                  return (
                    <article
                      key={bm.clauseKey}
                      className="flex items-start justify-between gap-4 rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
                    >
                      <div>
                        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-amber-600 dark:text-amber-400">
                          {book?.shortTitle ?? bm.bookId} · {clause?.number ?? bm.clauseId}
                        </p>
                        {clause && (
                          <p className="mt-1 font-display text-base font-bold text-slate-950 dark:text-white">
                            {getLocalizedText(clause.principle, language)}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenReader(bm.bookId, bm.chapterId, bm.clauseId)}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                        >
                          Open in Reader
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveBookmark(bm.bookId, bm.chapterId, bm.clauseId)}
                        aria-label="Remove bookmark"
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MAKE FRIENDS */}
      {activeHubTab === 'friends' && (
        <section className="space-y-4 rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                Study Circle & Friends
              </p>
              <h2 className="mt-0.5 font-display text-xl font-bold text-slate-950 dark:text-white">
                Make Friends & Study Together
              </h2>
            </div>
            <button
              type="button"
              onClick={onOpenQrModal}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 cursor-pointer"
            >
              <QrCode className="h-4 w-4" />
              Share My QR
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {COMMUNITY_SCHOLARS.map((person) => {
              const isFriend = friendIds.includes(person.id);
              return (
                <div
                  key={person.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold text-white ${person.tone}`}
                    >
                      {person.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                        {person.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{person.focus}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onToggleFriend(person.id)}
                    className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                      isFriend
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
                    }`}
                  >
                    {isFriend ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    <span>{isFriend ? 'Friends' : 'Add Friend'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 4: FOLLOW PEOPLE & BOOKS */}
      {activeHubTab === 'following' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Follow People */}
          <section className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Follow Scholars & Readers
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {COMMUNITY_SCHOLARS.map((person) => {
                const following = followedPeopleIds.includes(person.id);
                return (
                  <div
                    key={person.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0D111A]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                        {person.name}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {person.handle} · {person.role}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleFollowPerson(person.id)}
                      className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                        following
                          ? 'bg-slate-900 text-white dark:bg-blue-600'
                          : 'border border-slate-300 bg-white text-slate-800 hover:border-blue-500 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200'
                      }`}
                    >
                      {following ? 'Following' : 'Follow'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Follow Books */}
          <section className="rounded-[28px] border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                Follow Law & History Books
              </h2>
            </div>
            <div className="mt-4 space-y-3">
              {books.slice(0, 6).map((book) => {
                const following = followedBookIds.includes(book.id);
                return (
                  <div
                    key={book.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0D111A]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">
                        {getLocalizedText(book.title, language)}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {book.jurisdiction} · {book.chapters.length} chapters
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleFollowBook(book.id)}
                      className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                        following
                          ? 'bg-[#2563EB] text-white'
                          : 'border border-slate-300 bg-white text-slate-800 hover:border-blue-500 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200'
                      }`}
                    >
                      {following ? 'Following' : 'Follow Book'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 5: DONATE TO APPLICATION */}
      {activeHubTab === 'donate' && (
        <section className="rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#121620]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
                <Sparkles className="h-3.5 w-3.5" />
                Open-Access Civic Literacy Mission
              </span>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-950 dark:text-white">
                Support Free Constitutional & Law Audiobooks
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Contributions fund Telugu, Hindi, and regional-language translations, Dr. B. R. Ambedkar historical archives, and accessible audio editions for students everywhere.
              </p>
            </div>
            {totalDonatedAmount > 0 && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-right dark:bg-amber-500/15">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                  Your Total Support
                </p>
                <p className="font-mono text-xl font-bold text-slate-950 dark:text-white">
                  ₹{totalDonatedAmount}
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-2">
            {(['monthly', 'once'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => setDonationFreq(freq)}
                className={`min-h-[38px] rounded-xl px-4 text-xs font-bold transition cursor-pointer ${
                  donationFreq === freq
                    ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-300'
                }`}
              >
                {freq === 'monthly' ? 'Monthly Supporter' : 'One-Time Gift'}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DONATION_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setDonationAmount(amt);
                  setDonationConfirmed(null);
                }}
                className={`min-h-[54px] rounded-2xl border font-mono text-lg font-bold transition cursor-pointer ${
                  donationAmount === amt
                    ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-200'
                    : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-blue-300 dark:border-slate-800 dark:bg-[#0D111A] dark:text-white'
                }`}
              >
                ₹{amt}
              </button>
            ))}
          </div>

          {donationConfirmed && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
              {donationConfirmed}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pledge preview — no card is charged in this demo environment.
            </p>
            <button
              type="button"
              onClick={handleConfirmDonation}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-[#2563EB] px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              <HeartHandshake className="h-4 w-4" />
              Donate ₹{donationAmount} {donationFreq === 'monthly' ? '/ mo' : ''}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
