import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { LanguageCode, LawBook } from '../types/library';
import type { LegalFlashcard } from '../utils/legalFlashcards';
import {
  buildQuizContextFromBook,
  DEFAULT_QUIZ_QUESTION_COUNT,
  generateQuizQuestions,
  getBestQuizScore,
  getChapterCompletionKey,
  loadQuizHistoryFromStorage,
  saveQuizHistoryToStorage,
  scoreQuizAttempt,
  type CompletedChapterRecord,
  type QuizAttemptSummary,
  type QuizContextTarget,
} from '../utils/legalQuiz';
import { getLocalizedText } from '../utils/libraryLogic';

interface LegalQuizPanelProps {
  cards: LegalFlashcard[];
  books: LawBook[];
  language: LanguageCode;
  initialContext?: QuizContextTarget | null;
  completedChapters: Record<string, CompletedChapterRecord>;
  onSyncMastery: (summary: Pick<QuizAttemptSummary, 'correctCardIds' | 'missedCardIds'>) => void;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
  onSwitchToFlashcards: () => void;
}

export function LegalQuizPanel({
  cards,
  books,
  language,
  initialContext = null,
  completedChapters,
  onSyncMastery,
  onOpenReader,
  onSwitchToFlashcards,
}: LegalQuizPanelProps) {
  const [selectedScopeKey, setSelectedScopeKey] = useState<string>(() =>
    initialContext
      ? getChapterCompletionKey(initialContext.bookId, initialContext.chapterId)
      : 'all'
  );
  const [quizSeed, setQuizSeed] = useState<number>(() => Date.now());
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [completedSummary, setCompletedSummary] = useState<QuizAttemptSummary | null>(null);
  const [quizHistory, setQuizHistory] = useState<QuizAttemptSummary[]>(() =>
    loadQuizHistoryFromStorage()
  );

  // Sync incoming post-chapter context whenever user finishes a chapter in ReaderView
  useEffect(() => {
    if (!initialContext) return;
    const nextKey = getChapterCompletionKey(initialContext.bookId, initialContext.chapterId);
    setSelectedScopeKey(nextKey);
    setQuizSeed(Date.now());
    setCurrentIndex(0);
    setSelectedAnswers({});
    setCompletedSummary(null);
  }, [initialContext?.bookId, initialContext?.chapterId]);

  const chapterScopeOptions = useMemo(() => {
    const items: { key: string; label: string; isCompleted: boolean; context: QuizContextTarget }[] =
      [];
    for (const book of books) {
      for (const ch of book.chapters) {
        const key = getChapterCompletionKey(book.id, ch.id);
        const ctx = buildQuizContextFromBook(books, book.id, ch.id, language);
        if (!ctx) continue;
        items.push({
          key,
          label: `${book.shortTitle} · ${ch.number}`,
          isCompleted: Boolean(completedChapters[key]),
          context: ctx,
        });
      }
    }
    // Sort completed chapters first so finished readings appear right at the top
    return items.sort((a, b) => Number(b.isCompleted) - Number(a.isCompleted));
  }, [books, completedChapters, language]);

  const activeContext: QuizContextTarget | null = useMemo(() => {
    if (selectedScopeKey === 'all') return null;
    const found = chapterScopeOptions.find((opt) => opt.key === selectedScopeKey);
    if (found) return found.context;
    if (
      initialContext &&
      getChapterCompletionKey(initialContext.bookId, initialContext.chapterId) === selectedScopeKey
    ) {
      return initialContext;
    }
    return null;
  }, [selectedScopeKey, chapterScopeOptions, initialContext]);

  const questions = useMemo(
    () =>
      generateQuizQuestions(cards, {
        language,
        questionCount: Math.min(DEFAULT_QUIZ_QUESTION_COUNT, cards.length),
        context: activeContext,
        seed: quizSeed,
      }),
    [cards, language, activeContext, quizSeed]
  );

  const activeQuestion = questions[currentIndex] ?? null;
  const selectedOptionId = activeQuestion ? selectedAnswers[activeQuestion.id] : undefined;
  const isAnswered = Boolean(selectedOptionId);
  const isCorrectSelection =
    Boolean(activeQuestion) && selectedOptionId === activeQuestion?.correctOptionId;

  const bestScore = useMemo(() => getBestQuizScore(quizHistory), [quizHistory]);

  const contextDisplayLabel = activeContext
    ? `${activeContext.bookTitle} · ${activeContext.chapterLabel}`
    : 'All Legal Concepts';

  const handleSelectScope = (nextKey: string) => {
    setSelectedScopeKey(nextKey);
    setQuizSeed(Date.now());
    setCurrentIndex(0);
    setSelectedAnswers({});
    setCompletedSummary(null);
  };

  const handleRetakeQuiz = () => {
    setQuizSeed((prev) => prev + 137);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setCompletedSummary(null);
  };

  const handleSelectOption = (optionId: string) => {
    if (!activeQuestion || isAnswered) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [activeQuestion.id]: optionId,
    }));
  };

  const handleAdvance = () => {
    if (!activeQuestion || !isAnswered) return;
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    const summary = scoreQuizAttempt(questions, selectedAnswers, {
      contextLabel: contextDisplayLabel,
      bookId: activeContext?.bookId,
      chapterId: activeContext?.chapterId,
    });
    setCompletedSummary(summary);
    onSyncMastery(summary);
    setQuizHistory((prev) => {
      const next = [summary, ...prev].slice(0, 20);
      saveQuizHistoryToStorage(next);
      return next;
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const runningCorrectCount = useMemo(() => {
    let count = 0;
    for (const q of questions) {
      if (selectedAnswers[q.id] && selectedAnswers[q.id] === q.correctOptionId) {
        count += 1;
      }
    }
    return count;
  }, [questions, selectedAnswers]);

  // Keyboard shortcuts: 1-4 selects option, Enter advances
  useEffect(() => {
    if (completedSummary || !activeQuestion) return;
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (!isAnswered && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const opt = activeQuestion.options[idx];
        if (opt) {
          e.preventDefault();
          handleSelectOption(opt.id);
        }
      } else if (isAnswered && e.key === 'Enter') {
        e.preventDefault();
        handleAdvance();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (questions.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-[#0D111A]">
        <p className="font-display text-base font-bold text-slate-900 dark:text-white">
          Not enough flashcards to build a quiz
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Clear your search filter or switch back to Flashcards to browse all terms.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4" data-testid="legal-quiz-panel">
      {/* Scope & Chapter Selector Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#0D111A]">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {activeContext ? 'Post-Chapter Knowledge Check' : 'Practice Quiz Scope'}
            {bestScore !== null ? ` · Best ${bestScore}%` : ''}
          </p>
          <p className="truncate font-display text-xs font-bold text-slate-950 dark:text-white sm:text-sm">
            {activeContext
              ? `${activeContext.bookTitle} — ${activeContext.chapterLabel}: ${activeContext.chapterTitle}`
              : 'All Legal Terms & Constitutional Doctrines'}
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span className="sr-only">Choose quiz chapter scope</span>
          <select
            aria-label="Choose quiz chapter scope"
            value={selectedScopeKey}
            onChange={(e) => handleSelectScope(e.target.value)}
            className="h-9 max-w-[260px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 outline-none focus:border-[#2563EB] dark:border-slate-700 dark:bg-[#121620] dark:text-slate-100 cursor-pointer"
          >
            <option value="all">All Legal Concepts ({Math.min(DEFAULT_QUIZ_QUESTION_COUNT, cards.length)} Qs)</option>
            {chapterScopeOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.isCompleted ? '✓ ' : ''}
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Results View */}
      {completedSummary ? (
        <div
          data-testid="quiz-results-summary"
          className="space-y-4 rounded-[22px] border border-slate-200/90 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-[#0D111A]/80 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0F1E4A] text-white dark:bg-[#2563EB]">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Quiz Complete · {completedSummary.ratingLabel}
                </p>
                <h3 className="font-display text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                  {completedSummary.correctCount} / {completedSummary.totalCount}{' '}
                  <span className="text-base font-semibold text-[#2563EB] dark:text-blue-400">
                    ({completedSummary.accuracyPercent}%)
                  </span>
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Progress synced to Flashcards mastery · {completedSummary.contextLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRetakeQuiz}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0C1018] px-4 text-xs font-bold text-white transition hover:bg-[#2563EB] dark:bg-[#2563EB] dark:hover:bg-blue-500 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Retake Quiz</span>
              </button>
              <button
                type="button"
                onClick={onSwitchToFlashcards}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
              >
                <span>Back to Flashcards</span>
              </button>
            </div>
          </div>

          {/* Per-Question Review Breakdown */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Question Breakdown
            </p>
            <ul className="divide-y divide-slate-200/70 rounded-2xl border border-slate-200/80 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#121620]">
              {questions.map((q, idx) => {
                const chosenId = selectedAnswers[q.id];
                const isRight = chosenId === q.correctOptionId;
                const matchedCard = cards.find((c) => c.id === q.cardId);
                const termLabel = matchedCard
                  ? getLocalizedText(matchedCard.term, language)
                  : q.citation;

                return (
                  <li
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {isRight ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-950 dark:text-white">
                          <span className="font-mono tabular-nums text-slate-400">
                            {String(idx + 1).padStart(2, '0')}.{' '}
                          </span>
                          {termLabel}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {isRight ? 'Answered correctly' : 'Marked for review'} · {q.citation}
                        </p>
                      </div>
                    </div>

                    {q.sourceBookId && q.sourceChapterId && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenReader(q.sourceBookId!, q.sourceChapterId!, q.sourceClauseId)
                        }
                        className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[#2563EB] hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/15 cursor-pointer"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Read</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : activeQuestion ? (
        /* Active Question View */
        <div className="space-y-4">
          {/* Question Progress & Score Metadata */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span
                data-quiz-position={`${currentIndex + 1}/${questions.length}`}
                className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200"
              >
                Question {currentIndex + 1} of {questions.length} · {activeQuestion.styleLabel}
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                Score {runningCorrectCount}/{Object.keys(selectedAnswers).length}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                style={{
                  width: `${Math.round(((currentIndex + (isAnswered ? 1 : 0)) / questions.length) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Prompt Card */}
          <div className="rounded-[22px] border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A] sm:p-5">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {activeQuestion.topicLabel} · {activeQuestion.citation}
            </p>
            <h3 className="mt-1.5 font-display text-base font-bold leading-snug text-slate-950 dark:text-white sm:text-lg">
              {activeQuestion.prompt}
            </h3>
            {activeQuestion.supportingText && activeQuestion.style !== 'term_to_definition' && (
              <p className="mt-2.5 font-reading text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                &ldquo;{activeQuestion.supportingText}&rdquo;
              </p>
            )}
          </div>

          {/* 4 Multiple-Choice Options */}
          <div
            role="radiogroup"
            aria-label={`Answer choices for question ${currentIndex + 1}`}
            className="grid grid-cols-1 gap-2.5"
          >
            {activeQuestion.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              const isCorrectOption = opt.id === activeQuestion.correctOptionId;

              let optionSurface =
                'border-slate-200 bg-white text-slate-900 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-[#121620] dark:text-slate-100 dark:hover:border-blue-500/60';
              let badgeStyle =
                'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';

              if (isAnswered) {
                if (isCorrectOption) {
                  optionSurface =
                    'border-emerald-500 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/70 dark:bg-emerald-500/15 dark:text-emerald-100';
                  badgeStyle = 'bg-emerald-600 text-white';
                } else if (isSelected) {
                  optionSurface =
                    'border-rose-400 bg-rose-50/80 text-rose-950 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-100';
                  badgeStyle = 'bg-rose-600 text-white';
                } else {
                  optionSurface =
                    'border-slate-200/70 bg-white/60 text-slate-500 opacity-70 dark:border-slate-800/70 dark:bg-[#121620]/60 dark:text-slate-400';
                }
              }

              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isAnswered}
                  data-quiz-option-correct={isCorrectOption ? 'true' : 'false'}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`flex min-h-[52px] w-full items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
                    isAnswered ? 'cursor-default' : 'cursor-pointer'
                  } ${optionSurface}`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${badgeStyle}`}
                    >
                      {opt.label}
                    </span>
                    <span className="break-words text-xs font-semibold leading-relaxed sm:text-[13px]">
                      {opt.text}
                    </span>
                  </div>

                  {isAnswered && isCorrectOption && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Correct</span>
                    </span>
                  )}
                  {isAnswered && isSelected && !isCorrectOption && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                      <XCircle className="h-4 w-4" />
                      <span>Incorrect</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Instant Answer Explanation & Next Action */}
          {isAnswered && (
            <div
              data-testid="quiz-answer-feedback"
              className={`rounded-2xl border p-4 ${
                isCorrectSelection
                  ? 'border-emerald-500/35 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                  : 'border-amber-500/35 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p
                    className={`flex items-center gap-1.5 text-xs font-bold ${
                      isCorrectSelection
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    <Lightbulb className="h-4 w-4 shrink-0" />
                    <span>
                      {isCorrectSelection
                        ? 'Correct — concept reinforced'
                        : 'Review this legal principle'}
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200">
                    {activeQuestion.explanation}
                  </p>
                </div>
              </div>

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800/80">
                {activeQuestion.sourceBookId && activeQuestion.sourceChapterId ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenReader(
                        activeQuestion.sourceBookId!,
                        activeQuestion.sourceChapterId!,
                        activeQuestion.sourceClauseId
                      )
                    }
                    className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>Open Source Chapter</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {activeQuestion.citation}
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleAdvance}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0C1018] px-4 text-xs font-bold text-white transition hover:bg-[#2563EB] dark:bg-[#2563EB] dark:hover:bg-blue-500 cursor-pointer"
                >
                  <span>
                    {currentIndex + 1 < questions.length ? 'Next Question' : 'View Quiz Results'}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
