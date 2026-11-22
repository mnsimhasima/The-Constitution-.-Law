import {
  BarChart3,
  CheckCircle2,
  Flame,
  Minus,
  Plus,
  SlidersHorizontal,
  Target,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildWeeklyReadingSeries,
  computeMonthlyGoalSummary,
  formatReadingDuration,
  MAX_MONTHLY_GOAL_MINUTES,
  MIN_MONTHLY_GOAL_MINUTES,
  MONTHLY_GOAL_PRESETS,
  type WeeklyChartPoint,
} from '../utils/readingProgress';

interface ReadingProgressSectionProps {
  dailyMinutes: Record<string, number>;
  monthlyGoalMinutes: number;
  streakDays: number;
  onUpdateMonthlyGoal: (minutes: number) => void;
  onLogReadingMinutes: (minutes: number) => void;
}

interface CustomBarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: WeeklyChartPoint }>;
}

function WeeklyTooltip({ active, payload }: CustomBarTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  const hitTarget = point.minutes >= point.dailyTarget;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-[#0F1420]">
      <p className="font-bold text-slate-950 dark:text-white">
        {point.dayLabel} · {point.shortDate}
        {point.isToday ? ' (Today)' : ''}
      </p>
      <p className="mt-0.5 font-mono text-sm font-bold text-[#2563EB] dark:text-blue-400">
        {formatReadingDuration(point.minutes)}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {hitTarget
          ? `Reached ${point.dailyTarget}m daily pace`
          : `${point.dailyTarget - point.minutes}m below ${point.dailyTarget}m pace`}
      </p>
    </div>
  );
}

export function ReadingProgressSection({
  dailyMinutes,
  monthlyGoalMinutes,
  streakDays,
  onUpdateMonthlyGoal,
  onLogReadingMinutes,
}: ReadingProgressSectionProps) {
  const [editingGoal, setEditingGoal] = useState(false);

  const referenceDate = useMemo(() => new Date(), []);

  const weeklySeries = useMemo(
    () => buildWeeklyReadingSeries(dailyMinutes, referenceDate, monthlyGoalMinutes),
    [dailyMinutes, referenceDate, monthlyGoalMinutes]
  );

  const monthlySummary = useMemo(
    () => computeMonthlyGoalSummary(dailyMinutes, referenceDate, monthlyGoalMinutes),
    [dailyMinutes, referenceDate, monthlyGoalMinutes]
  );

  const weeklyTotalMinutes = useMemo(
    () => weeklySeries.reduce((sum, pt) => sum + pt.minutes, 0),
    [weeklySeries]
  );

  const weeklyDailyAvg = Math.round(weeklyTotalMinutes / 7);
  const todayMinutes = weeklySeries[weeklySeries.length - 1]?.minutes ?? 0;
  const dailyTarget = weeklySeries[0]?.dailyTarget ?? 10;

  const pieData = useMemo(
    () => [
      {
        name: 'Completed',
        value: Math.max(0.1, monthlySummary.clampedPercent),
      },
      {
        name: 'Remaining',
        value: Math.max(0, 100 - monthlySummary.clampedPercent),
      },
    ],
    [monthlySummary.clampedPercent]
  );

  const progressRingColor = monthlySummary.goalMet ? '#10B981' : '#2563EB';

  return (
    <section
      aria-label="Reading Progress"
      className="rounded-[26px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620] sm:p-5"
    >
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-400">
            <BarChart3 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-slate-950 dark:text-white">
              Reading Progress
            </h2>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Weekly reading time &amp; {monthlySummary.monthLabel} study goal
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onLogReadingMinutes(15)}
            aria-label="Log 15 minutes of reading time"
            className="inline-flex h-8 items-center gap-1 rounded-xl bg-[#2563EB] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Log 15m</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingGoal((prev) => !prev)}
            aria-expanded={editingGoal}
            className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition cursor-pointer ${
              editingGoal
                ? 'border-[#2563EB] bg-blue-50 text-[#2563EB] dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Edit Goal</span>
          </button>
        </div>
      </div>

      {/* Collapsible Monthly Goal Editor */}
      {editingGoal && (
        <div
          aria-label="Monthly reading goal settings"
          className="mt-3.5 rounded-2xl border border-blue-200/80 bg-blue-50/50 p-3.5 dark:border-blue-500/25 dark:bg-blue-500/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
                Monthly Reading Goal
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Target for {monthlySummary.monthLabel}:{' '}
                <strong className="font-mono text-slate-950 dark:text-white">
                  {formatReadingDuration(monthlySummary.goalMinutes)} ({monthlySummary.goalMinutes}m)
                </strong>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={monthlySummary.goalMinutes <= MIN_MONTHLY_GOAL_MINUTES}
                onClick={() => onUpdateMonthlyGoal(monthlySummary.goalMinutes - 30)}
                aria-label="Decrease monthly goal by 30 minutes"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 disabled:opacity-40 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={monthlySummary.goalMinutes >= MAX_MONTHLY_GOAL_MINUTES}
                onClick={() => onUpdateMonthlyGoal(monthlySummary.goalMinutes + 30)}
                aria-label="Increase monthly goal by 30 minutes"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-blue-400 disabled:opacity-40 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {MONTHLY_GOAL_PRESETS.map((preset) => {
              const active = monthlySummary.goalMinutes === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onUpdateMonthlyGoal(preset)}
                  className={`h-8 rounded-xl font-mono text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200'
                  }`}
                >
                  {formatReadingDuration(preset)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Two Responsive Recharts Visual Panels */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Panel 1: Weekly Total Reading Time BarChart */}
        <div
          data-reading-weekly-chart="ready"
          className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A] lg:col-span-7"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Last 7 Days · Total Reading Time
              </p>
              <p
                data-weekly-total-minutes={weeklyTotalMinutes}
                className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-slate-950 dark:text-white"
              >
                {formatReadingDuration(weeklyTotalMinutes)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Avg{' '}
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {weeklyDailyAvg}m/d
                </strong>
              </span>
              <span>
                Today{' '}
                <strong
                  data-today-reading-minutes={todayMinutes}
                  className="font-mono text-[#2563EB] dark:text-blue-400"
                >
                  {todayMinutes}m
                </strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <Flame className="h-3.5 w-3.5 text-amber-500" />
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {streakDays}d
                </strong>
              </span>
            </div>
          </div>

          <div className="mt-3 h-[210px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={210} minWidth={0}>
              <BarChart
                data={weeklySeries}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#94A3B8"
                  strokeOpacity={0.25}
                />
                <XAxis
                  dataKey="dayLabel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(v: number) => `${v}m`}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                />
                <Tooltip
                  content={<WeeklyTooltip />}
                  cursor={{ fill: 'rgba(37, 99, 235, 0.08)', radius: 8 }}
                />
                <ReferenceLine
                  y={dailyTarget}
                  stroke="#D97706"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                />
                <Bar
                  dataKey="minutes"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={false}
                >
                  {weeklySeries.map((entry) => (
                    <Cell
                      key={entry.dateKey}
                      fill={
                        entry.isToday
                          ? '#2563EB'
                          : entry.minutes >= entry.dailyTarget
                            ? '#60A5FA'
                            : '#CBD5E1'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#2563EB]" />
                Today
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#60A5FA]" />
                Goal Pace Met
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-600" />
              {dailyTarget}m/day pace
            </span>
          </div>
        </div>

        {/* Panel 2: Monthly Goal Progress Donut Chart */}
        <div
          data-reading-monthly-chart="ready"
          className="flex min-w-0 flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#0D111A] lg:col-span-5"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Monthly Goal
              </p>
              <p className="mt-0.5 font-display text-sm font-bold text-slate-950 dark:text-white">
                {monthlySummary.monthLabel}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                monthlySummary.goalMet
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-blue-500/12 text-[#2563EB] dark:bg-blue-500/20 dark:text-blue-300'
              }`}
            >
              {monthlySummary.goalMet ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Goal Met
                </>
              ) : (
                <>
                  <Target className="h-3 w-3" />
                  In Progress
                </>
              )}
            </span>
          </div>

          {/* Recharts Donut Ring */}
          <div className="relative mx-auto my-2 h-[172px] w-[172px]">
            <ResponsiveContainer width="100%" height={172} minWidth={0}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={78}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  cornerRadius={10}
                  isAnimationActive={false}
                >
                  <Cell fill={progressRingColor} />
                  <Cell fill="#94A3B8" fillOpacity={0.22} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span
                data-monthly-goal-percent={monthlySummary.percentComplete}
                className="font-mono text-2xl font-bold tabular-nums text-slate-950 dark:text-white"
              >
                {monthlySummary.percentComplete}%
              </span>
              <span
                data-monthly-goal-fraction={`${monthlySummary.totalMinutes}/${monthlySummary.goalMinutes}`}
                className="mt-0.5 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400"
              >
                {formatReadingDuration(monthlySummary.totalMinutes)} /{' '}
                {formatReadingDuration(monthlySummary.goalMinutes)}
              </span>
            </div>
          </div>

          {/* Monthly Goal Stats Footer */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#121620]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {monthlySummary.goalMet ? 'Extra Time' : 'Remaining'}
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-950 dark:text-white">
                {monthlySummary.goalMet
                  ? `+${formatReadingDuration(monthlySummary.totalMinutes - monthlySummary.goalMinutes)}`
                  : formatReadingDuration(monthlySummary.remainingMinutes)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#121620]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                {monthlySummary.goalMet ? 'Active Days' : 'Daily Pace'}
              </p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-950 dark:text-white">
                {monthlySummary.goalMet
                  ? `${monthlySummary.activeDaysThisMonth} days`
                  : `${monthlySummary.dailyPaceNeeded}m / day`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
