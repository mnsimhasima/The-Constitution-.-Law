import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Lightbulb,
  List,
  RotateCcw,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import type { LanguageCode, LawBook } from '../types/library';
import {
  buildLibraryFlashcards,
  computeFlashcardStats,
  filterFlashcards,
  FLASHCARD_CATEGORY_TABS,
  loadFlashcardMasteryFromStorage,
  saveFlashcardMasteryToStorage,
  shuffleFlashcards,
  updateFlashcardMastery,
  type FlashcardCategory,
  type FlashcardMastery,
} from '../utils/legalFlashcards';
import { getLocalizedText } from '../utils/libraryLogic';
import {
  applyQuizResultsToMastery,
  type CompletedChapterRecord,
  type QuizAttemptSummary,
  type QuizContextTarget,
} from '../utils/legalQuiz';
import { LegalQuizPanel } from './LegalQuizPanel';

interface LegalFlashcardsDeckProps {
  books: LawBook[];
  language: LanguageCode;
  searchQuery: string;
  quizContext?: QuizContextTarget | null;
  quizLaunchToken?: number;
  completedChapters?: Record<string, CompletedChapterRecord>;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
}

export function LegalFlashcardsDeck({
  books,
  language,
  searchQuery,
  quizContext = null,
  quizLaunchToken = 0,
  completedChapters = {},
  onOpenReader,
}: LegalFlashcardsDeckProps) {
  const baseCards = useMemo(() => buildLibraryFlashcards(books), [books]);

  const [studyMode, setStudyMode] = useState<'flashcards' | 'quiz'>(() =>
    quizContext ? 'quiz' : 'flashcards'
  );
  const [category, setCategory] = useState<FlashcardCategory>('all');
  const [shuffleOrder, setShuffleOrder] = useState<string[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [showTermIndex, setShowTermIndex] = useState<boolean>(false);
  const [masteryMap, setMasteryMap] = useState<Record<string, FlashcardMastery>>(() =>
    loadFlashcardMasteryFromStorage()
  );

  // Automatically open Quiz Mode whenever launched from ReaderView after finishing a chapter
  useEffect(() => {
    if (quizLaunchToken > 0) {
      setStudyMode('quiz');
    }
  }, [quizLaunchToken]);

  const handleSyncQuizMastery = (
    summary: Pick<QuizAttemptSummary, 'correctCardIds' | 'missedCardIds'>
  ) => {
    setMasteryMap((prev) => {
      const next = applyQuizResultsToMastery(prev, summary);
      saveFlashcardMasteryToStorage(next);
      return next;
    });
  };

  const orderedCards = useMemo(() => {
    if (!shuffleOrder) return baseCards;
    const rank = new Map(shuffleOrder.map((id, idx) => [id, idx]));
    return [...baseCards].sort(
      (a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [baseCards, shuffleOrder]);

  const filteredCards = useMemo(
    () =>
      filterFlashcards(orderedCards, {
        category,
        query: searchQuery,
        masteryMap,
        language,
      }),
    [orderedCards, category, searchQuery, masteryMap, language]
  );

  const overallStats = useMemo(
    () => computeFlashcardStats(baseCards, masteryMap),
    [baseCards, masteryMap]
  );

  // Keep active index cleanly clamped whenever filters or review queue change
  useEffect(() => {
    setCurrentIndex((prev) => {
      if (filteredCards.length === 0) return 0;
      return Math.min(prev, filteredCards.length - 1);
    });
    setIsFlipped(false);
  }, [filteredCards.length, category, searchQuery]);

  const activeCard = filteredCards[currentIndex] ?? null;
  const activeStatus: FlashcardMastery = activeCard
    ? masteryMap[activeCard.id] ?? 'unseen'
    : 'unseen';

  const handleGoPrev = () => {
    if (filteredCards.length <= 1) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + filteredCards.length) % filteredCards.length);
  };

  const handleGoNext = () => {
    if (filteredCards.length <= 1) return;
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const handleShuffle = () => {
    const shuffled = shuffleFlashcards(baseCards);
    setShuffleOrder(shuffled.map((c) => c.id));
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleMarkStatus = (status: FlashcardMastery) => {
    if (!activeCard) return;
    setMasteryMap((prev) => {
      const next = updateFlashcardMastery(prev, activeCard.id, status);
      saveFlashcardMasteryToStorage(next);
      return next;
    });
    setIsFlipped(false);
    if (filteredCards.length > 1) {
      // If marking mastered inside Needs Review filter, current index automatically slides onto next unmastered card
      if (!(category === 'review_only' && status === 'mastered')) {
        setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
      }
    }
  };

  const handleResetProgress = () => {
    setMasteryMap({});
    saveFlashcardMasteryToStorage({});
    setShuffleOrder(null);
    setCategory('all');
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const reviewQueueCount = overallStats.total - overallStats.mastered;

  return (
    <section
      aria-label="Legal Terms Flashcards"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleGoNext();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleGoPrev();
        }
      }}
      className="min-w-0 rounded-[26px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620] sm:p-5"
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-400">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              {studyMode === 'quiz' ? 'Legal Quiz Mode' : 'Legal Terms Flashcards'}
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              <span data-flashcard-mastered-count={overallStats.mastered}>
                {overallStats.mastered}/{overallStats.total} mastered
              </span>{' '}
              · {overallStats.masteryPercent}% ·{' '}
              {studyMode === 'quiz' ? 'Multiple-choice practice' : 'Tap card to flip'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented Mode Toggle: Flashcards | Quiz Mode */}
          <div
            role="tablist"
            aria-label="Study mode"
            className="inline-flex items-center rounded-xl bg-slate-100 p-1 dark:bg-[#0D111A]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={studyMode === 'flashcards'}
              onClick={() => setStudyMode('flashcards')}
              className={`min-h-[32px] whitespace-nowrap rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                studyMode === 'flashcards'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Flashcards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={studyMode === 'quiz'}
              onClick={() => setStudyMode('quiz')}
              className={`min-h-[32px] whitespace-nowrap rounded-lg px-3 text-xs font-bold transition cursor-pointer ${
                studyMode === 'quiz'
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                  : 'text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Quiz Mode
            </button>
          </div>

          {studyMode === 'flashcards' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleShuffle}
                aria-label="Shuffle flashcard deck"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
              >
                <Shuffle className="h-3.5 w-3.5" />
                <span>Shuffle</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTermIndex((prev) => !prev)}
                aria-expanded={showTermIndex}
                className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition cursor-pointer ${
                  showTermIndex
                    ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span>All ({filteredCards.length})</span>
              </button>

              {(overallStats.mastered > 0 || overallStats.needsReview > 0) && (
                <button
                  type="button"
                  onClick={handleResetProgress}
                  aria-label="Reset flashcard mastery progress"
                  className="inline-flex h-8 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-300 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mastery Progress Bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            data-flashcard-progress-pct={overallStats.masteryPercent}
            className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-emerald-500 transition-all duration-300"
            style={{ width: `${Math.max(overallStats.mastered > 0 ? 6 : 0, overallStats.masteryPercent)}%` }}
          />
        </div>
      </div>

      {studyMode === 'quiz' ? (
        <LegalQuizPanel
          cards={baseCards}
          books={books}
          language={language}
          initialContext={quizContext}
          completedChapters={completedChapters}
          onSyncMastery={handleSyncQuizMastery}
          onOpenReader={onOpenReader}
          onSwitchToFlashcards={() => setStudyMode('flashcards')}
        />
      ) : (
        <>
          {/* Wrapping Topic Filter Strip */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {FLASHCARD_CATEGORY_TABS.map((tab) => {
              const active = category === tab.id;
              const label =
                tab.id === 'review_only' ? `${tab.label} (${reviewQueueCount})` : tab.label;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id)}
                  aria-pressed={active}
                  className={`min-h-[32px] rounded-xl px-2.5 text-[11px] font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#0C1018] text-white dark:bg-[#2563EB]'
                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:text-slate-950 dark:border-slate-800 dark:bg-[#0D111A] dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

      {/* Active Flashcard Stage */}
      {!activeCard ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-[#0D111A]">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            {category === 'review_only' && overallStats.mastered === overallStats.total
              ? 'All legal terms mastered!'
              : 'No matching flashcards found'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {category === 'review_only' && overallStats.mastered === overallStats.total
              ? 'Great work—switch back to All Terms or reset progress to study again.'
              : 'Try another category or clear the Library search term.'}
          </p>
          <button
            type="button"
            onClick={() => setCategory('all')}
            className="mt-3 inline-flex h-9 items-center rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white cursor-pointer"
          >
            Show All Terms
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Interactive Flip Surface */}
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            aria-pressed={isFlipped}
            aria-label={
              isFlipped
                ? `Definition shown for ${getLocalizedText(activeCard.term, language)}. Activate to flip back to term.`
                : `Legal term ${getLocalizedText(activeCard.term, language)}. Activate to flip and reveal definition.`
            }
            data-flashcard-id={activeCard.id}
            data-flashcard-side={isFlipped ? 'back' : 'front'}
            className={`group relative flex min-h-[236px] w-full flex-col justify-between overflow-hidden rounded-[22px] p-5 text-left transition-all duration-200 cursor-pointer sm:min-h-[250px] sm:p-6 ${
              isFlipped
                ? 'border-2 border-blue-400/70 bg-[#FAF8F3] text-slate-950 shadow-md dark:border-blue-500/50 dark:bg-[#0D1424] dark:text-white'
                : 'border border-blue-500/30 bg-gradient-to-br from-[#0F1E4A] via-[#172554] to-[#1D4ED8] text-white shadow-lg'
            }`}
          >
            {/* Card Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                    isFlipped
                      ? 'bg-blue-500/12 text-[#2563EB] dark:bg-blue-500/20 dark:text-blue-300'
                      : 'bg-white/15 text-blue-100'
                  }`}
                >
                  {isFlipped ? 'Definition & Context' : activeCard.topicLabel}
                </span>
                {activeStatus === 'mastered' && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      isFlipped
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-emerald-400/20 text-emerald-100'
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Mastered
                  </span>
                )}
                {activeStatus === 'review' && (
                  <span
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      isFlipped
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'bg-amber-400/25 text-amber-100'
                    }`}
                  >
                    Needs Review
                  </span>
                )}
              </div>

              <span
                data-flashcard-position={`${currentIndex + 1}/${filteredCards.length}`}
                className={`font-mono text-[11px] font-bold tabular-nums ${
                  isFlipped ? 'text-slate-500 dark:text-slate-400' : 'text-blue-200'
                }`}
              >
                {currentIndex + 1} / {filteredCards.length}
              </span>
            </div>

            {/* Card Center Content */}
            {!isFlipped ? (
              <div className="my-5 flex flex-col items-center text-center">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-200/90">
                  {activeCard.citation}
                </p>
                <h3 className="mt-2.5 max-w-xl break-words font-display text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl">
                  {getLocalizedText(activeCard.term, language)}
                </h3>
                {language !== 'en' && (
                  <p className="mt-1.5 text-xs font-medium text-blue-200/85">
                    {activeCard.term.en}
                  </p>
                )}
              </div>
            ) : (
              <div className="my-4 space-y-3">
                <div>
                  <p className="font-display text-sm font-bold text-[#2563EB] dark:text-blue-300">
                    {getLocalizedText(activeCard.term, language)} ·{' '}
                    <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {activeCard.citation}
                    </span>
                  </p>
                  <p className="mt-1.5 break-words font-reading text-sm leading-relaxed text-slate-900 dark:text-slate-100 sm:text-[15px]">
                    {getLocalizedText(activeCard.definition, language)}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-3 dark:bg-amber-500/12">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-300">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                    <span>Real-World Example</span>
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    {getLocalizedText(activeCard.example, language)}
                  </p>
                </div>
              </div>
            )}

            {/* Card Bottom Hint */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                  isFlipped ? 'text-slate-500 dark:text-slate-400' : 'text-blue-100/90'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isFlipped ? 'Tap card to return to legal term' : 'Tap card to reveal definition & example'}
              </span>
            </div>
          </button>

          {/* Navigation + Self-Assessment Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Prev / Flip / Next */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoPrev}
                disabled={filteredCards.length <= 1}
                aria-label="Previous flashcard"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFlipped((prev) => !prev)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-blue-400 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
              >
                {isFlipped ? 'Show Term' : 'Reveal Answer'}
              </button>

              <button
                type="button"
                onClick={handleGoNext}
                disabled={filteredCards.length <= 1}
                aria-label="Next flashcard"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Mastery Marking Buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleMarkStatus('review')}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition cursor-pointer ${
                  activeStatus === 'review'
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-amber-300/80 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200'
                }`}
              >
                <span>Needs Review</span>
              </button>

              <button
                type="button"
                onClick={() => handleMarkStatus('mastered')}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                  activeStatus === 'mastered'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-emerald-600/12 text-emerald-700 ring-1 ring-emerald-500/30 hover:bg-emerald-600 hover:text-white dark:bg-emerald-500/20 dark:text-emerald-200'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Mastered</span>
              </button>
            </div>
          </div>

          {/* Direct Source Reading Link (when linked to a Library book) */}
          {activeCard.sourceBookId && activeCard.sourceChapterId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-[#0D111A]">
              <span className="truncate text-slate-600 dark:text-slate-300">
                Source reference:{' '}
                <strong className="text-slate-900 dark:text-white">{activeCard.citation}</strong>
              </span>
              <button
                type="button"
                onClick={() =>
                  onOpenReader(
                    activeCard.sourceBookId!,
                    activeCard.sourceChapterId!,
                    activeCard.sourceClauseId
                  )
                }
                className="inline-flex shrink-0 items-center gap-1 font-bold text-[#2563EB] hover:underline dark:text-blue-400 cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Read in Library</span>
              </button>
            </div>
          )}

          {/* Optional Term Index Drawer */}
          {showTermIndex && (
            <div
              aria-label="Flashcard term directory"
              className="grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-2"
            >
              {filteredCards.map((card, idx) => {
                const status = masteryMap[card.id] ?? 'unseen';
                const isSelected = idx === currentIndex;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsFlipped(false);
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition cursor-pointer ${
                      isSelected
                        ? 'border-[#2563EB] bg-blue-50/80 dark:border-blue-500 dark:bg-blue-500/15'
                        : 'border-slate-200/80 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-[#0D111A]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900 dark:text-white">
                        {getLocalizedText(card.term, language)}
                      </p>
                      <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {card.citation}
                      </p>
                    </div>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        status === 'mastered'
                          ? 'bg-emerald-500'
                          : status === 'review'
                            ? 'bg-amber-400'
                            : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      title={status}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}
    </section>
  );
}
