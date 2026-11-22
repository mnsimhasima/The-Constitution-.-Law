import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeReadingStreakSummary,
  getStreakStatusCopy,
  hasCelebratedStreakOnDate,
  markStreakCelebratedOnDate,
  resolveStreakMilestone,
  type StorageLike,
} from './readingStreak';
import { createInitialDailyReadingLog } from './readingProgress';

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

test('computeReadingStreakSummary calculates consecutive days maintained today and 7-day slots', () => {
  const ref = new Date(2026, 10, 22); // 2026-11-22
  const log = createInitialDailyReadingLog(ref, 24);
  const summary = computeReadingStreakSummary(log, ref);

  // Initial log seeds days 6, 5, 4, 3, 2, 1, 0 -> 7 consecutive days ending today
  assert.equal(summary.currentStreakDays, 7);
  assert.equal(summary.longestStreakDays, 7);
  assert.equal(summary.isMaintainedToday, true);
  assert.equal(summary.isAtRiskToday, false);
  assert.equal(summary.todayDateKey, '2026-11-22');
  assert.equal(summary.todayMinutes, 24);
  assert.equal(summary.isMilestoneHit, true);
  assert.equal(summary.nextMilestoneDays, 14);
  assert.equal(summary.last7Days.length, 7);
  assert.equal(summary.last7Days[6].isToday, true);
  assert.equal(summary.last7Days[6].completed, true);
  assert.equal(summary.last7Days.every((d) => d.completed), true);
});

test('computeReadingStreakSummary preserves active streak from yesterday as at-risk until today is logged', () => {
  const ref = new Date(2026, 10, 22); // 2026-11-22
  const dailyMinutes: Record<string, number> = {
    '2026-11-18': 12,
    '2026-11-19': 20,
    '2026-11-20': 15,
    '2026-11-21': 18,
    // 2026-11-22 not yet read
  };

  const beforeToday = computeReadingStreakSummary(dailyMinutes, ref);
  assert.equal(beforeToday.currentStreakDays, 4);
  assert.equal(beforeToday.isMaintainedToday, false);
  assert.equal(beforeToday.isAtRiskToday, true);
  assert.equal(beforeToday.todayMinutes, 0);
  assert.equal(beforeToday.last7Days[6].completed, false);

  const copyBefore = getStreakStatusCopy(beforeToday);
  assert.match(copyBefore.headline, /Keep Your 4-Day Streak Alive/);

  // Once today is logged, streak increments from 4 -> 5 and flips to maintained
  const afterToday = computeReadingStreakSummary(
    { ...dailyMinutes, '2026-11-22': 5 },
    ref
  );
  assert.equal(afterToday.currentStreakDays, 5);
  assert.equal(afterToday.longestStreakDays, 5);
  assert.equal(afterToday.isMaintainedToday, true);
  assert.equal(afterToday.isAtRiskToday, false);
  assert.equal(afterToday.last7Days[6].completed, true);

  const copyAfter = getStreakStatusCopy(afterToday);
  assert.equal(copyAfter.headline, 'Streak Maintained Today');
});

test('computeReadingStreakSummary resets current streak to 0 after a missed day while keeping longestStreakDays', () => {
  const ref = new Date(2026, 10, 22);
  const dailyMinutes: Record<string, number> = {
    '2026-11-10': 15,
    '2026-11-11': 18,
    '2026-11-12': 22,
    '2026-11-13': 14,
    '2026-11-14': 19,
    // Gap from Nov 15 -> Nov 22
  };

  const summary = computeReadingStreakSummary(dailyMinutes, ref);
  assert.equal(summary.currentStreakDays, 0);
  assert.equal(summary.longestStreakDays, 5);
  assert.equal(summary.isMaintainedToday, false);
  assert.equal(summary.isAtRiskToday, false);
  assert.equal(getStreakStatusCopy(summary).headline, 'Start Your Reading Streak');
});

test('resolveStreakMilestone computes exact milestones and progression cleanly', () => {
  const m0 = resolveStreakMilestone(0);
  assert.equal(m0.nextMilestoneDays, 3);
  assert.equal(m0.daysToNextMilestone, 3);
  assert.equal(m0.isExactMilestone, false);

  const m7 = resolveStreakMilestone(7);
  assert.equal(m7.isExactMilestone, true);
  assert.equal(m7.previousMilestoneDays, 7);
  assert.equal(m7.nextMilestoneDays, 14);
  assert.equal(m7.milestoneProgressPercent, 100);

  const m10 = resolveStreakMilestone(10);
  assert.equal(m10.isExactMilestone, false);
  assert.equal(m10.previousMilestoneDays, 7);
  assert.equal(m10.nextMilestoneDays, 14);
  assert.equal(m10.daysToNextMilestone, 4);
  assert.equal(m10.milestoneProgressPercent, 43);
});

test('hasCelebratedStreakOnDate and markStreakCelebratedOnDate persist celebration date cleanly', () => {
  const storage = createMemoryStorage();
  assert.equal(hasCelebratedStreakOnDate('2026-11-22', storage), false);

  markStreakCelebratedOnDate('2026-11-22', storage);
  assert.equal(hasCelebratedStreakOnDate('2026-11-22', storage), true);
  assert.equal(hasCelebratedStreakOnDate('2026-11-23', storage), false);
});
