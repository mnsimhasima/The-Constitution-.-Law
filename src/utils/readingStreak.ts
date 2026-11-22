import { toLocalDateKey } from './readingProgress';

export const STREAK_CELEBRATION_STORAGE_KEY = 'constitution_law_streak_celebration_v1';
export const DEFAULT_MIN_DAILY_STREAK_MINUTES = 1;
export const DEFAULT_DAILY_GOAL_MINUTES = 10;

export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 21, 30, 50, 100, 365];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export interface StreakDaySlot {
  dateKey: string;
  dayLabel: string;
  dayInitial: string;
  dayNumber: number;
  minutes: number;
  completed: boolean;
  isToday: boolean;
}

export interface ReadingStreakSummary {
  currentStreakDays: number;
  longestStreakDays: number;
  isMaintainedToday: boolean;
  isAtRiskToday: boolean;
  todayDateKey: string;
  todayMinutes: number;
  dailyGoalMinutes: number;
  dailyGoalPercent: number;
  last7Days: StreakDaySlot[];
  nextMilestoneDays: number;
  previousMilestoneDays: number;
  daysToNextMilestone: number;
  milestoneProgressPercent: number;
  isMilestoneHit: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function shiftDateDays(base: Date, deltaDays: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays);
}

function parseLocalDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function computeLongestConsecutiveRun(activeDateKeys: Set<string>): number {
  if (activeDateKeys.size === 0) return 0;

  const sortedDays = Array.from(activeDateKeys)
    .map((key) => parseLocalDateKey(key))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (sortedDays.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = sortedDays[i - 1];
    const expectedNext = toLocalDateKey(shiftDateDays(prev, 1));
    const actualKey = toLocalDateKey(sortedDays[i]);
    if (actualKey === expectedNext) {
      current += 1;
      if (current > longest) longest = current;
    } else if (actualKey !== toLocalDateKey(prev)) {
      current = 1;
    }
  }

  return longest;
}

export function resolveStreakMilestone(currentStreakDays: number): {
  previousMilestoneDays: number;
  nextMilestoneDays: number;
  daysToNextMilestone: number;
  milestoneProgressPercent: number;
  isExactMilestone: boolean;
} {
  const safeDays = Math.max(0, Math.floor(currentStreakDays));
  const isExactMilestone = safeDays > 0 && STREAK_MILESTONES.includes(safeDays);

  let previousMilestoneDays = 0;
  let nextMilestoneDays = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];

  for (const milestone of STREAK_MILESTONES) {
    if (safeDays < milestone) {
      nextMilestoneDays = milestone;
      break;
    }
    previousMilestoneDays = milestone;
  }

  if (safeDays >= STREAK_MILESTONES[STREAK_MILESTONES.length - 1]) {
    previousMilestoneDays = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
    nextMilestoneDays = Math.ceil((safeDays + 1) / 100) * 100;
  }

  const span = Math.max(1, nextMilestoneDays - previousMilestoneDays);
  const daysIntoSpan = Math.max(0, safeDays - previousMilestoneDays);
  const milestoneProgressPercent = isExactMilestone
    ? 100
    : Math.min(100, Math.max(0, Math.round((daysIntoSpan / span) * 100)));

  return {
    previousMilestoneDays,
    nextMilestoneDays,
    daysToNextMilestone: Math.max(0, nextMilestoneDays - safeDays),
    milestoneProgressPercent,
    isExactMilestone,
  };
}

/**
 * Computes the user's consecutive-day reading streak, 7-day calendar slots,
 * daily check-in status, and milestone progression from daily reading minutes.
 */
export function computeReadingStreakSummary(
  dailyMinutes: Record<string, number>,
  referenceDate: Date = new Date(),
  options?: {
    minDailyMinutes?: number;
    dailyGoalMinutes?: number;
  }
): ReadingStreakSummary {
  const minDailyMinutes = Math.max(1, options?.minDailyMinutes ?? DEFAULT_MIN_DAILY_STREAK_MINUTES);
  const dailyGoalMinutes = Math.max(minDailyMinutes, options?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES);

  const activeDateKeys = new Set<string>();
  for (const [key, mins] of Object.entries(dailyMinutes)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof mins === 'number' && Number.isFinite(mins) && mins >= minDailyMinutes) {
      activeDateKeys.add(key);
    }
  }

  const todayDateKey = toLocalDateKey(referenceDate);
  const todayMinutes = Math.max(0, Math.round(dailyMinutes[todayDateKey] ?? 0));
  const isMaintainedToday = activeDateKeys.has(todayDateKey);

  // Count consecutive active days ending today if read today, otherwise ending yesterday (alive & pending today)
  let currentStreakDays = 0;
  const startOffset = isMaintainedToday ? 0 : -1;
  let cursorOffset = startOffset;

  while (true) {
    const key = toLocalDateKey(shiftDateDays(referenceDate, cursorOffset));
    if (!activeDateKeys.has(key)) break;
    currentStreakDays += 1;
    cursorOffset -= 1;
    if (currentStreakDays > 3650) break;
  }

  const isAtRiskToday = !isMaintainedToday && currentStreakDays > 0;
  const longestStreakDays = Math.max(currentStreakDays, computeLongestConsecutiveRun(activeDateKeys));

  const last7Days: StreakDaySlot[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = shiftDateDays(referenceDate, offset);
    const dateKey = toLocalDateKey(date);
    const minutes = Math.max(0, Math.round(dailyMinutes[dateKey] ?? 0));
    last7Days.push({
      dateKey,
      dayLabel: WEEKDAY_SHORT[date.getDay()],
      dayInitial: WEEKDAY_INITIAL[date.getDay()],
      dayNumber: date.getDate(),
      minutes,
      completed: activeDateKeys.has(dateKey),
      isToday: offset === 0,
    });
  }

  const dailyGoalPercent = Math.min(
    100,
    Math.max(0, Math.round((todayMinutes / dailyGoalMinutes) * 100))
  );

  const milestone = resolveStreakMilestone(currentStreakDays);

  return {
    currentStreakDays,
    longestStreakDays,
    isMaintainedToday,
    isAtRiskToday,
    todayDateKey,
    todayMinutes,
    dailyGoalMinutes,
    dailyGoalPercent,
    last7Days,
    nextMilestoneDays: milestone.nextMilestoneDays,
    previousMilestoneDays: milestone.previousMilestoneDays,
    daysToNextMilestone: milestone.daysToNextMilestone,
    milestoneProgressPercent: milestone.milestoneProgressPercent,
    isMilestoneHit: isMaintainedToday && milestone.isExactMilestone,
  };
}

export function getStreakStatusCopy(summary: ReadingStreakSummary): {
  headline: string;
  detail: string;
} {
  if (summary.isMaintainedToday) {
    if (summary.isMilestoneHit) {
      return {
        headline: `${summary.currentStreakDays}-Day Milestone Reached`,
        detail: `You maintained your streak today with ${summary.todayMinutes}m of study. Next milestone: ${summary.nextMilestoneDays} days.`,
      };
    }
    return {
      headline: 'Streak Maintained Today',
      detail: `${summary.todayMinutes}m read today · ${summary.daysToNextMilestone} more ${summary.daysToNextMilestone === 1 ? 'day' : 'days'} to reach ${summary.nextMilestoneDays} days.`,
    };
  }

  if (summary.isAtRiskToday) {
    return {
      headline: `Keep Your ${summary.currentStreakDays}-Day Streak Alive`,
      detail: 'Read a clause or check in today to maintain your consecutive reading run.',
    };
  }

  return {
    headline: 'Start Your Reading Streak',
    detail: 'Read any constitutional clause or check in today to begin day 1.',
  };
}

export function hasCelebratedStreakOnDate(
  dateKey: string,
  storage?: StorageLike | null
): boolean {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return false;
  try {
    return target.getItem(STREAK_CELEBRATION_STORAGE_KEY) === dateKey;
  } catch {
    return false;
  }
}

export function markStreakCelebratedOnDate(
  dateKey: string,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(STREAK_CELEBRATION_STORAGE_KEY, dateKey);
  } catch {
    // Ignore storage quota errors
  }
}
