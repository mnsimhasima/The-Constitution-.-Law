import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BarChart3, BookOpen, Check, Flame, PartyPopper, Plus } from 'lucide-react';
import {
  computeReadingStreakSummary,
  getStreakStatusCopy,
  hasCelebratedStreakOnDate,
  markStreakCelebratedOnDate,
} from '../utils/readingStreak';

interface ReadingStreakWidgetProps {
  dailyMinutes: Record<string, number>;
  onCheckInToday: () => void;
  onOpenReader: () => void;
  onViewProgress: () => void;
}

interface ConfettiSpec {
  id: string;
  tx: string;
  ty: string;
  rot: string;
  delay: string;
  colorClass: string;
  shapeClass: string;
}

const CONFETTI_PARTICLES: readonly ConfettiSpec[] = [
  { id: 'p1', tx: '-34px', ty: '-30px', rot: '-115deg', delay: '0ms', colorClass: 'bg-amber-400', shapeClass: 'h-2 w-2 rounded-xs' },
  { id: 'p2', tx: '34px', ty: '-32px', rot: '125deg', delay: '30ms', colorClass: 'bg-blue-500', shapeClass: 'h-2 w-1.5 rounded-xs' },
  { id: 'p3', tx: '-44px', ty: '-4px', rot: '-90deg', delay: '50ms', colorClass: 'bg-emerald-500', shapeClass: 'h-1.5 w-2 rounded-full' },
  { id: 'p4', tx: '44px', ty: '-6px', rot: '95deg', delay: '20ms', colorClass: 'bg-amber-500', shapeClass: 'h-2 w-2 rounded-full' },
  { id: 'p5', tx: '-20px', ty: '-42px', rot: '-160deg', delay: '45ms', colorClass: 'bg-rose-500', shapeClass: 'h-2 w-1.5 rounded-xs' },
  { id: 'p6', tx: '18px', ty: '-44px', rot: '150deg', delay: '60ms', colorClass: 'bg-sky-400', shapeClass: 'h-1.5 w-2 rounded-xs' },
  { id: 'p7', tx: '-32px', ty: '26px', rot: '-75deg', delay: '75ms', colorClass: 'bg-blue-400', shapeClass: 'h-1.5 w-1.5 rounded-full' },
  { id: 'p8', tx: '32px', ty: '28px', rot: '85deg', delay: '40ms', colorClass: 'bg-amber-300', shapeClass: 'h-2 w-1.5 rounded-xs' },
  { id: 'p9', tx: '0px', ty: '-48px', rot: '180deg', delay: '15ms', colorClass: 'bg-emerald-400', shapeClass: 'h-2 w-2 rounded-xs' },
  { id: 'p10', tx: '0px', ty: '36px', rot: '-140deg', delay: '65ms', colorClass: 'bg-rose-400', shapeClass: 'h-1.5 w-2 rounded-full' },
];

export function ReadingStreakWidget({
  dailyMinutes,
  onCheckInToday,
  onOpenReader,
  onViewProgress,
}: ReadingStreakWidgetProps) {
  const summary = useMemo(
    () => computeReadingStreakSummary(dailyMinutes, new Date()),
    [dailyMinutes]
  );
  const statusCopy = useMemo(() => getStreakStatusCopy(summary), [summary]);

  const [celebrationRunId, setCelebrationRunId] = useState(0);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const celebrationTimerRef = useRef<number | null>(null);
  const prevMaintainedRef = useRef<boolean>(summary.isMaintainedToday);

  const triggerCelebration = useCallback(() => {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }
    setCelebrationRunId((prev) => prev + 1);
    setIsCelebrating(true);
    markStreakCelebratedOnDate(summary.todayDateKey);
    celebrationTimerRef.current = window.setTimeout(() => {
      setIsCelebrating(false);
      celebrationTimerRef.current = null;
    }, 1600);
  }, [summary.todayDateKey]);

  // Trigger celebration once automatically on the first visit today when streak is maintained,
  // or immediately when the user transitions from not-maintained -> maintained today.
  useEffect(() => {
    const wasMaintained = prevMaintainedRef.current;
    prevMaintainedRef.current = summary.isMaintainedToday;

    if (!wasMaintained && summary.isMaintainedToday) {
      triggerCelebration();
      return;
    }

    if (summary.isMaintainedToday && !hasCelebratedStreakOnDate(summary.todayDateKey)) {
      const startTimer = window.setTimeout(() => {
        triggerCelebration();
      }, 220);
      return () => window.clearTimeout(startTimer);
    }
  }, [summary.isMaintainedToday, summary.todayDateKey, triggerCelebration]);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference - (ringCircumference * summary.dailyGoalPercent) / 100;

  return (
    <section
      aria-labelledby="reading-streak-heading"
      data-testid="reading-streak-widget"
      data-celebrating={isCelebrating ? 'true' : 'false'}
      data-maintained={summary.isMaintainedToday ? 'true' : 'false'}
      className="relative overflow-hidden rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-sm transition-colors dark:border-slate-800 dark:bg-[#121620] sm:p-6"
    >
      <div className="grid gap-5 lg:grid-cols-12 lg:items-center">
        {/* Left Zone: Flame Medallion + Consecutive Days Read */}
        <div className="flex min-w-0 items-center gap-4 lg:col-span-5">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            {/* Radial Celebration Ring Burst */}
            {isCelebrating && (
              <span
                key={`ring-${celebrationRunId}`}
                aria-hidden="true"
                className="streak-ring-burst pointer-events-none absolute inset-0 rounded-full border-2 border-amber-400/80 dark:border-amber-300/80"
              />
            )}

            {/* Geometric Confetti Burst */}
            {isCelebrating && (
              <div
                key={`confetti-${celebrationRunId}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                {CONFETTI_PARTICLES.map((p) => {
                  const style = {
                    '--tx': p.tx,
                    '--ty': p.ty,
                    '--rot': p.rot,
                    animationDelay: p.delay,
                  } as CSSProperties;
                  return (
                    <span
                      key={p.id}
                      style={style}
                      className={`streak-confetti-particle absolute ${p.colorClass} ${p.shapeClass}`}
                    />
                  );
                })}
              </div>
            )}

            {/* Daily Goal SVG Progress Ring */}
            <svg
              className="absolute inset-0 h-16 w-16 -rotate-90"
              viewBox="0 0 64 64"
              aria-hidden="true"
            >
              <circle
                cx="32"
                cy="32"
                r={ringRadius}
                fill="none"
                strokeWidth="3.5"
                className="stroke-slate-100 dark:stroke-slate-800"
              />
              <circle
                cx="32"
                cy="32"
                r={ringRadius}
                fill="none"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className={`transition-[stroke-dashoffset] duration-500 ${
                  summary.isMaintainedToday
                    ? 'stroke-amber-500 dark:stroke-amber-400'
                    : 'stroke-blue-500 dark:stroke-blue-400'
                }`}
              />
            </svg>

            {/* Flame Icon Core */}
            <div
              key={`flame-${celebrationRunId}`}
              className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-full ${
                summary.isMaintainedToday
                  ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
              } ${isCelebrating ? 'streak-flame-celebrate' : ''}`}
            >
              <Flame
                className={`h-5 w-5 ${summary.isMaintainedToday ? 'fill-current' : ''}`}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                data-testid="reading-streak-count"
                className="font-display text-3xl font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-white sm:text-4xl"
              >
                {summary.currentStreakDays}
              </span>
              <span className="font-display text-base font-bold text-slate-700 dark:text-slate-200">
                {summary.currentStreakDays === 1 ? 'consecutive day' : 'consecutive days'}
              </span>
            </div>

            <h2
              id="reading-streak-heading"
              className={`mt-1 text-sm font-semibold transition-colors duration-300 ${
                isCelebrating
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {statusCopy.headline}
            </h2>

            <p className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
              <span>Best {summary.longestStreakDays}d</span>
              <span aria-hidden="true"> · </span>
              <span>{summary.todayMinutes}m today</span>
              <span aria-hidden="true"> · </span>
              <span>Next goal {summary.nextMilestoneDays}d</span>
            </p>

            <p role="status" aria-live="polite" className="sr-only">
              {isCelebrating && summary.isMaintainedToday
                ? `Streak celebrated — ${summary.currentStreakDays} consecutive ${summary.currentStreakDays === 1 ? 'day' : 'days'} read!`
                : ''}
            </p>
          </div>
        </div>

        {/* Center Zone: 7-Day Consecutive Calendar Strip */}
        <div className="min-w-0 lg:col-span-4">
          <div
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
            role="list"
            aria-label="Past 7 days reading streak"
          >
            {summary.last7Days.map((slot) => (
              <div
                key={slot.dateKey}
                role="listitem"
                title={`${slot.dayLabel} ${slot.dayNumber}: ${slot.minutes}m read`}
                aria-label={`${slot.dayLabel} ${slot.dayNumber}, ${
                  slot.completed ? `${slot.minutes} minutes read, completed` : 'not read yet'
                }`}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={`text-[11px] font-semibold ${
                    slot.isToday
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {slot.dayLabel.slice(0, 1)}
                </span>

                <div
                  key={slot.isToday ? `today-${celebrationRunId}` : slot.dateKey}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold tabular-nums transition-colors sm:h-10 sm:w-10 ${
                    slot.completed
                      ? slot.isToday
                        ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30 dark:bg-amber-400 dark:text-slate-950'
                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                      : slot.isToday
                        ? 'border border-dashed border-blue-400 bg-blue-50/60 text-blue-700 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-300'
                        : 'bg-slate-100/90 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500'
                  } ${slot.isToday && slot.completed && isCelebrating ? 'streak-day-pop' : ''}`}
                >
                  {slot.completed ? (
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  ) : (
                    <span>{slot.dayNumber}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400 lg:text-left">
            {statusCopy.detail}
          </p>
        </div>

        {/* Right Zone: Contextual Actions */}
        <div className="flex flex-wrap items-center gap-2.5 lg:col-span-3 lg:justify-end">
          {!summary.isMaintainedToday ? (
            <>
              <button
                type="button"
                data-testid="streak-checkin-btn"
                onClick={onCheckInToday}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] active:scale-[0.98] cursor-pointer sm:flex-initial"
              >
                <Plus className="h-4 w-4 shrink-0" />
                Log Today (+5m)
              </button>
              <button
                type="button"
                onClick={onOpenReader}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-slate-200 px-3.5 text-xs font-bold text-slate-700 transition hover:border-blue-500 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:text-blue-300 cursor-pointer"
              >
                <BookOpen className="h-4 w-4 shrink-0" />
                Read
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-testid="streak-celebrate-btn"
                onClick={triggerCelebration}
                aria-label="Replay streak celebration"
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-amber-200 bg-amber-50/70 px-3.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 active:scale-[0.98] dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200 dark:hover:bg-amber-500/25 cursor-pointer"
              >
                <PartyPopper className="h-4 w-4 shrink-0" />
                Celebrate
              </button>
              <button
                type="button"
                onClick={onViewProgress}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-slate-800 active:scale-[0.98] dark:bg-[#2563EB] dark:hover:bg-[#1D4ED8] cursor-pointer sm:flex-initial"
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                Progress
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
