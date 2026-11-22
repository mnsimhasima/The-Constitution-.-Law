import { useMemo, useState } from 'react';
import { Bookmark, BookOpen, CheckCircle2, Circle, Compass, Headphones } from 'lucide-react';
import { INITIAL_READING_PLANS } from '../data/booksData';
import type { LanguageCode, LawBook } from '../types/library';
import { calculatePlanProgress, getLocalizedText } from '../utils/libraryLogic';

interface PlansViewProps {
  books: LawBook[];
  language: LanguageCode;
  searchQuery: string;
  startedPlanIds: string[];
  savedPlanIds: string[];
  completedPlanDayIds: string[];
  onClearSearch: () => void;
  onStartPlan: (planId: string) => void;
  onToggleSavedPlan: (planId: string, planTitle?: string) => void;
  onTogglePlanDayComplete: (planId: string, dayId: string) => void;
  onOpenReader: (bookId: string, chapterId: string, clauseId?: string) => void;
  onPlayChapterAudio: (bookId: string, chapterId: string, startClauseIndex?: number) => void;
}

export function PlansView({
  books,
  language,
  searchQuery,
  startedPlanIds,
  savedPlanIds,
  completedPlanDayIds,
  onClearSearch,
  onStartPlan,
  onToggleSavedPlan,
  onTogglePlanDayComplete,
  onOpenReader,
  onPlayChapterAudio,
}: PlansViewProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(INITIAL_READING_PLANS[0].id);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return INITIAL_READING_PLANS;
    return INITIAL_READING_PLANS.filter((plan) => {
      const haystack = [
        plan.category,
        plan.title.en,
        getLocalizedText(plan.title, language),
        plan.description.en,
        getLocalizedText(plan.description, language),
        ...plan.days.map((d) => `${d.title.en} ${getLocalizedText(d.title, language)}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, language]);

  const selectedPlan =
    filteredPlans.find((p) => p.id === selectedPlanId) ?? filteredPlans[0] ?? null;

  if (!selectedPlan) {
    return (
      <div className="min-w-0 space-y-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
            Daily Audio &amp; Reading Sprints
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            Guided Study Plans
          </h1>
        </div>
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-[#121620]">
          <p className="font-display text-base font-bold text-slate-900 dark:text-white">
            No study plans match &ldquo;{searchQuery}&rdquo;
          </p>
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-4 inline-flex min-h-[40px] items-center rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      </div>
    );
  }

  const progress = calculatePlanProgress(selectedPlan, completedPlanDayIds);
  const isStarted = startedPlanIds.includes(selectedPlan.id);
  const isSelectedSaved = savedPlanIds.includes(selectedPlan.id);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
          Daily Audio &amp; Reading Sprints
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          Guided Study Plans
        </h1>
      </div>

      {/* Plan Selector Cards */}
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
        {filteredPlans.map((plan) => {
          const stat = calculatePlanProgress(plan, completedPlanDayIds);
          const active = plan.id === selectedPlan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanId(plan.id)}
              className={`flex min-w-0 flex-col justify-between rounded-[24px] border p-4 text-left transition sm:p-5 cursor-pointer ${
                active
                  ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-lg shadow-blue-600/25'
                  : 'border-slate-200/90 bg-white text-slate-900 hover:border-blue-400 dark:border-slate-800 dark:bg-[#121620] dark:text-white'
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-[10px] font-bold uppercase tracking-[0.14em] ${
                      active ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {plan.category}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-bold">
                    {stat.completedCount}/{stat.totalCount}
                  </span>
                </div>
                <h2 className="mt-2 break-words font-display text-base font-bold leading-snug sm:text-lg">
                  {getLocalizedText(plan.title, language)}
                </h2>
                <p
                  className={`mt-1.5 line-clamp-2 break-words text-xs leading-relaxed ${
                    active ? 'text-blue-100/90' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {getLocalizedText(plan.description, language)}
                </p>
              </div>

              <div
                className={`mt-4 h-1.5 overflow-hidden rounded-full ${
                  active ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-all ${
                    active ? 'bg-amber-300' : 'bg-[#2563EB]'
                  }`}
                  style={{ width: `${Math.max(6, stat.percentage)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Plan Schedule */}
      <section className="min-w-0 rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
              <Compass className="h-3.5 w-3.5 shrink-0" />
              {progress.percentage}% Complete · {selectedPlan.days.length} Sessions
            </span>
            <h2 className="mt-1 break-words font-display text-lg font-bold text-slate-950 dark:text-white sm:text-xl">
              {getLocalizedText(selectedPlan.title, language)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onToggleSavedPlan(selectedPlan.id, getLocalizedText(selectedPlan.title, language))
              }
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                isSelectedSaved
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-500 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isSelectedSaved ? 'fill-current' : ''}`} />
              <span>{isSelectedSaved ? 'Saved Plan' : 'Save Plan'}</span>
            </button>

            {!isStarted && (
              <button
                type="button"
                onClick={() => onStartPlan(selectedPlan.id)}
                className="min-h-[40px] rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-md shadow-blue-600/25 hover:bg-[#1D4ED8] cursor-pointer"
              >
                Start Plan
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {selectedPlan.days.map((day) => {
            const done = completedPlanDayIds.includes(day.id);
            const targetBook = books.find((b) => b.id === day.bookId);
            const targetChapter = targetBook?.chapters.find((c) => c.id === day.chapterId);
            const clauseIdx = Math.max(
              0,
              targetChapter?.clauses.findIndex((cl) => cl.id === day.clauseId) ?? 0
            );

            return (
              <div
                key={day.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A] sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <button
                    type="button"
                    onClick={() => onTogglePlanDayComplete(selectedPlan.id, day.id)}
                    aria-label={
                      done
                        ? `Mark Day ${day.dayNumber} incomplete`
                        : `Mark Day ${day.dayNumber} complete`
                    }
                    className="mt-0.5 shrink-0 text-blue-600 transition hover:scale-105 dark:text-blue-400 cursor-pointer"
                  >
                    {done ? (
                      <CheckCircle2 className="h-6 w-6 fill-blue-600 text-white dark:fill-blue-500" />
                    ) : (
                      <Circle className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                      Day {day.dayNumber} · {day.durationMinutes} min ·{' '}
                      {targetBook?.shortTitle ?? 'Library'}
                    </p>
                    <h3
                      className={`mt-0.5 break-words font-display text-sm font-bold sm:text-base ${
                        done
                          ? 'text-slate-400 line-through dark:text-slate-500'
                          : 'text-slate-950 dark:text-white'
                      }`}
                    >
                      {getLocalizedText(day.title, language)}
                    </h3>
                    <p className="mt-1 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {getLocalizedText(day.reflection, language)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 pl-9 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => onPlayChapterAudio(day.bookId, day.chapterId, clauseIdx)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs font-bold text-blue-700 transition hover:bg-blue-600 hover:text-white dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white cursor-pointer"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenReader(day.bookId, day.chapterId, day.clauseId)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 text-xs font-bold text-white transition hover:bg-blue-600 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-500 dark:hover:text-white cursor-pointer"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Read
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
