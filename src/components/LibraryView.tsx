import { useEffect, useMemo, useState } from 'react';
import { Bookmark, BookOpen, Globe, Headphones } from 'lucide-react';
import type { MobileBackgroundSyncController } from '../hooks/useMobileBackgroundSync';
import type { BookCategory, LanguageCode, LawBook } from '../types/library';
import { getLocalizedText, searchLibrary } from '../utils/libraryLogic';
import type { CompletedChapterRecord, QuizContextTarget } from '../utils/legalQuiz';
import { BookCover } from './BookCover';
import { LegalFlashcardsDeck } from './LegalFlashcardsDeck';
import { OttLibraryExplorer, type OttFocusTarget } from './OttLibraryExplorer';

interface LibraryViewProps {
  books: LawBook[];
  language: LanguageCode;
  searchQuery: string;
  savedBookIds: string[];
  followedBookIds: string[];
  quizContext?: QuizContextTarget | null;
  quizLaunchToken?: number;
  completedChapters?: Record<string, CompletedChapterRecord>;
  mobileSync?: MobileBackgroundSyncController;
  ottFocusTarget?: OttFocusTarget | null;
  onClearSearch: () => void;
  onToggleSavedBook: (bookId: string) => void;
  onToggleFollowBook: (bookId: string) => void;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
  onPlayChapterAudio: (bookId: string, chapterId: string, startClauseIndex?: number) => void;
}

const CATEGORY_TABS: { id: Exclude<BookCategory, 'custom'> | 'all'; label: string }[] = [
  { id: 'all', label: 'All Books' },
  { id: 'history', label: 'Ambedkar & History' },
  { id: 'constitutions', label: 'Constitutions' },
  { id: 'statutory', label: 'Law & Statutes' },
  { id: 'international', label: 'Human Rights' },
];

export function LibraryView({
  books,
  language,
  searchQuery,
  savedBookIds,
  followedBookIds,
  quizContext = null,
  quizLaunchToken = 0,
  completedChapters = {},
  mobileSync,
  ottFocusTarget = null,
  onClearSearch,
  onToggleSavedBook,
  onToggleFollowBook,
  onOpenReader,
  onPlayChapterAudio,
}: LibraryViewProps) {
  const [libraryMode, setLibraryMode] = useState<'ott' | 'shelf'>('ott');
  const [category, setCategory] = useState<Exclude<BookCategory, 'custom'> | 'all'>('all');

  // Automatically reveal Study Shelf & Quizzes when user launches a chapter quiz or searches the shelf
  useEffect(() => {
    if (quizLaunchToken > 0 || searchQuery.trim().length > 0) {
      setLibraryMode('shelf');
    }
  }, [quizLaunchToken, searchQuery]);

  // Switch to OTT Editions when user taps "View Updates" on a background sync notification
  useEffect(() => {
    if (ottFocusTarget && ottFocusTarget.token > 0) {
      setLibraryMode('ott');
    }
  }, [ottFocusTarget]);

  const catalogBooks = useMemo(
    () => books.filter((b) => !b.isUserAdded && b.category !== 'custom'),
    [books]
  );

  const filteredBooks = useMemo(
    () => searchLibrary(catalogBooks, searchQuery, category, language),
    [catalogBooks, searchQuery, category, language]
  );

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
            Books &amp; Structures · Multi-Language Editions &amp; Native Audio
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Constitutions, Law &amp; Biography Library
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Library view mode"
          className="grid w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-[#121620] sm:inline-flex sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={libraryMode === 'ott'}
            onClick={() => setLibraryMode('ott')}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap sm:px-3.5 ${
              libraryMode === 'ott'
                ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Books &amp; Audio</span>
            <span className="hidden sm:inline">Books &amp; Structures</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={libraryMode === 'shelf'}
            onClick={() => setLibraryMode('shelf')}
            className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition cursor-pointer whitespace-nowrap sm:px-3.5 ${
              libraryMode === 'shelf'
                ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">Shelf &amp; Quizzes</span>
            <span className="hidden sm:inline">Study Shelf &amp; Quizzes</span>
          </button>
        </div>
      </div>

      {libraryMode === 'ott' ? (
        <OttLibraryExplorer syncController={mobileSync} focusTarget={ottFocusTarget} />
      ) : (
        <>
          {/* Interactive Legal Terms Flashcards & Quiz Mode */}
          <LegalFlashcardsDeck
            books={catalogBooks}
            language={language}
            searchQuery={searchQuery}
            quizContext={quizContext}
            quizLaunchToken={quizLaunchToken}
            completedChapters={completedChapters}
            onOpenReader={onOpenReader}
          />

          {/* Fully Wrapping Category Tabs — Zero Horizontal Scrolling */}
          <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_TABS.map((tab) => {
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`min-h-[36px] rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                active
                  ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-slate-950 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filteredBooks.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#121620]">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            No matching books found
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Try a different keyword or switch back to All Books.
          </p>
          {(searchQuery || category !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onClearSearch();
                setCategory('all');
              }}
              className="mt-4 inline-flex min-h-[40px] items-center rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {filteredBooks.map((book) => {
            const totalMinutes = book.chapters.reduce((sum, ch) => sum + ch.estimatedMinutes, 0);
            const totalClauses = book.chapters.reduce((sum, ch) => sum + ch.clauses.length, 0);
            const firstChapter = book.chapters[0];
            const isSaved = savedBookIds.includes(book.id);
            const isFollowing = followedBookIds.includes(book.id);

            return (
              <article
                key={book.id}
                className="flex min-w-0 w-full flex-col justify-between overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-[#121620] dark:hover:border-blue-500/40 sm:p-5"
              >
                <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
                  <BookCover
                    book={book}
                    size="md"
                    className="!h-24 !w-[70px] sm:!h-32 sm:!w-24"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:text-[11px]">
                        {book.jurisdiction} · {book.year}
                      </p>
                      <button
                        type="button"
                        onClick={() => onToggleSavedBook(book.id)}
                        aria-label={isSaved ? `Unsave ${book.shortTitle}` : `Save ${book.shortTitle}`}
                        className={`shrink-0 rounded-lg p-1 transition cursor-pointer ${
                          isSaved
                            ? 'text-amber-500'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                        }`}
                      >
                        <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <h2 className="mt-1 break-words font-display text-base font-bold leading-snug text-slate-950 dark:text-white sm:text-lg">
                      {getLocalizedText(book.title, language)}
                    </h2>
                    <p className="mt-1 line-clamp-2 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {getLocalizedText(book.subtitle, language)}
                    </p>
                    <p className="mt-2 font-mono text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">
                      {book.chapters.length} ch · {totalClauses} sections · {totalMinutes}m audio
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onToggleFollowBook(book.id)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                      isFollowing
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'border border-slate-200 text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isFollowing ? 'Following' : '+ Follow'}
                  </button>

                  {firstChapter && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onPlayChapterAudio(book.id, firstChapter.id, 0)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-600 hover:text-white dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white cursor-pointer"
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        Listen
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenReader(book.id, firstChapter.id)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 text-xs font-bold text-white transition hover:bg-blue-600 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-500 dark:hover:text-white cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        Read
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
