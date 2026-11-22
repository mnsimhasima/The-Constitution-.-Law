export const READING_PROGRESS_STORAGE_KEY = 'constitution_law_reading_progress_v1';
export const DEFAULT_MONTHLY_GOAL_MINUTES = 300; // 5 hours / month
export const MIN_MONTHLY_GOAL_MINUTES = 60;
export const MAX_MONTHLY_GOAL_MINUTES = 3000;
export const MONTHLY_GOAL_PRESETS: readonly number[] = [150, 300, 450, 600, 900];

export interface ReadingProgressState {
  dailyMinutes: Record<string, number>;
  monthlyGoalMinutes: number;
}

export interface WeeklyChartPoint {
  dateKey: string;
  dayLabel: string;
  shortDate: string;
  minutes: number;
  dailyTarget: number;
  isToday: boolean;
}

export interface MonthlyGoalSummary {
  monthKey: string;
  monthLabel: string;
  totalMinutes: number;
  goalMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
  clampedPercent: number;
  daysInMonth: number;
  daysRemainingInMonth: number;
  dailyPaceNeeded: number;
  activeDaysThisMonth: number;
  goalMet: boolean;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeMonthlyGoalMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_MONTHLY_GOAL_MINUTES;
  const clamped = Math.min(MAX_MONTHLY_GOAL_MINUTES, Math.max(MIN_MONTHLY_GOAL_MINUTES, minutes));
  return Math.round(clamped / 15) * 15;
}

export function formatReadingDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe}m`;
  const hrs = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

/**
 * Seeds a grounded multi-day reading log anchored to today so users immediately
 * see realistic weekly & monthly progress while every new reading/audio minute
 * accumulates live on top of today's entry.
 */
export function createInitialDailyReadingLog(
  referenceDate: Date = new Date(),
  todaySeedMinutes = 24
): Record<string, number> {
  // Offsets in days back from referenceDate (0 = today)
  const template: Array<[number, number]> = [
    [13, 18],
    [11, 26],
    [9, 22],
    [8, 15],
    [6, 14],
    [5, 28],
    [4, 20],
    [3, 32],
    [2, 18],
    [1, 36],
    [0, Math.max(5, Math.round(todaySeedMinutes))],
  ];

  const log: Record<string, number> = {};
  for (const [daysAgo, mins] of template) {
    const d = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - daysAgo
    );
    log[toLocalDateKey(d)] = mins;
  }
  return log;
}

export function recordReadingMinutesForDate(
  dailyMinutes: Record<string, number>,
  date: Date,
  deltaMinutes: number
): Record<string, number> {
  if (!Number.isFinite(deltaMinutes) || deltaMinutes <= 0) return dailyMinutes;
  const key = toLocalDateKey(date);
  const current = dailyMinutes[key] ?? 0;
  return {
    ...dailyMinutes,
    [key]: Math.round((current + deltaMinutes) * 10) / 10,
  };
}

export function buildWeeklyReadingSeries(
  dailyMinutes: Record<string, number>,
  referenceDate: Date = new Date(),
  monthlyGoalMinutes: number = DEFAULT_MONTHLY_GOAL_MINUTES
): WeeklyChartPoint[] {
  const daysInMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0
  ).getDate();
  const dailyTarget = Math.max(
    5,
    Math.round(normalizeMonthlyGoalMinutes(monthlyGoalMinutes) / daysInMonth)
  );

  const series: WeeklyChartPoint[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate() - offset
    );
    const key = toLocalDateKey(d);
    series.push({
      dateKey: key,
      dayLabel: WEEKDAY_SHORT[d.getDay()],
      shortDate: `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`,
      minutes: Math.max(0, Math.round(dailyMinutes[key] ?? 0)),
      dailyTarget,
      isToday: offset === 0,
    });
  }
  return series;
}

export function computeMonthlyGoalSummary(
  dailyMinutes: Record<string, number>,
  referenceDate: Date = new Date(),
  monthlyGoalMinutes: number = DEFAULT_MONTHLY_GOAL_MINUTES
): MonthlyGoalSummary {
  const year = referenceDate.getFullYear();
  const monthIdx = referenceDate.getMonth();
  const monthPrefix = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const daysRemainingInMonth = Math.max(1, daysInMonth - referenceDate.getDate() + 1);

  let totalMinutes = 0;
  let activeDaysThisMonth = 0;

  for (const [dateKey, mins] of Object.entries(dailyMinutes)) {
    if (dateKey.startsWith(`${monthPrefix}-`) && typeof mins === 'number' && mins > 0) {
      totalMinutes += mins;
      activeDaysThisMonth += 1;
    }
  }

  totalMinutes = Math.round(totalMinutes);
  const goalMinutes = normalizeMonthlyGoalMinutes(monthlyGoalMinutes);
  const remainingMinutes = Math.max(0, goalMinutes - totalMinutes);
  const percentComplete = Math.round((totalMinutes / goalMinutes) * 100);
  const clampedPercent = Math.min(100, Math.max(0, percentComplete));
  const dailyPaceNeeded =
    remainingMinutes > 0 ? Math.ceil(remainingMinutes / daysRemainingInMonth) : 0;

  return {
    monthKey: monthPrefix,
    monthLabel: `${MONTH_LONG[monthIdx]} ${year}`,
    totalMinutes,
    goalMinutes,
    remainingMinutes,
    percentComplete,
    clampedPercent,
    daysInMonth,
    daysRemainingInMonth,
    dailyPaceNeeded,
    activeDaysThisMonth,
    goalMet: totalMinutes >= goalMinutes,
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadReadingProgressFromStorage(
  referenceDate: Date = new Date(),
  todaySeedMinutes = 24,
  storage?: StorageLike | null
): ReadingProgressState {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  const fallback: ReadingProgressState = {
    dailyMinutes: createInitialDailyReadingLog(referenceDate, todaySeedMinutes),
    monthlyGoalMinutes: DEFAULT_MONTHLY_GOAL_MINUTES,
  };
  if (!target) return fallback;

  try {
    const raw = target.getItem(READING_PROGRESS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ReadingProgressState>;
    if (!parsed || typeof parsed !== 'object') return fallback;

    const sanitizedDaily: Record<string, number> = {};
    if (parsed.dailyMinutes && typeof parsed.dailyMinutes === 'object') {
      for (const [k, v] of Object.entries(parsed.dailyMinutes)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
          sanitizedDaily[k] = Math.round(v * 10) / 10;
        }
      }
    }

    return {
      dailyMinutes:
        Object.keys(sanitizedDaily).length > 0 ? sanitizedDaily : fallback.dailyMinutes,
      monthlyGoalMinutes: normalizeMonthlyGoalMinutes(
        typeof parsed.monthlyGoalMinutes === 'number'
          ? parsed.monthlyGoalMinutes
          : DEFAULT_MONTHLY_GOAL_MINUTES
      ),
    };
  } catch {
    return fallback;
  }
}

export function saveReadingProgressToStorage(
  state: ReadingProgressState,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(READING_PROGRESS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}
