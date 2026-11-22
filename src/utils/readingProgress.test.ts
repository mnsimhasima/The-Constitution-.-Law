import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWeeklyReadingSeries,
  computeMonthlyGoalSummary,
  createInitialDailyReadingLog,
  formatReadingDuration,
  loadReadingProgressFromStorage,
  normalizeMonthlyGoalMinutes,
  recordReadingMinutesForDate,
  saveReadingProgressToStorage,
  toLocalDateKey,
} from './readingProgress';

test('buildWeeklyReadingSeries produces 7 ordered days ending on referenceDate with accurate totals', () => {
  const ref = new Date(2026, 10, 21); // Nov 21, 2026 (Saturday)
  const log = {
    '2026-11-15': 10,
    '2026-11-17': 25,
    '2026-11-21': 42,
  };

  const series = buildWeeklyReadingSeries(log, ref, 300);
  assert.equal(series.length, 7);
  assert.equal(series[0].dateKey, '2026-11-15');
  assert.equal(series[0].dayLabel, 'Sun');
  assert.equal(series[0].minutes, 10);
  assert.equal(series[0].isToday, false);

  assert.equal(series[2].dateKey, '2026-11-17');
  assert.equal(series[2].minutes, 25);

  assert.equal(series[6].dateKey, '2026-11-21');
  assert.equal(series[6].dayLabel, 'Sat');
  assert.equal(series[6].minutes, 42);
  assert.equal(series[6].isToday, true);
  assert.equal(series[6].dailyTarget, 10); // 300 / 30 days in Nov
});

test('computeMonthlyGoalSummary aggregates only the current month and calculates remaining pace', () => {
  const ref = new Date(2026, 10, 21); // Nov 21, 2026 (10 days left including today)
  const log = {
    '2026-10-31': 90, // previous month — must be excluded
    '2026-11-05': 40,
    '2026-11-14': 55,
    '2026-11-21': 25,
  };

  const summary = computeMonthlyGoalSummary(log, ref, 300);
  assert.equal(summary.monthLabel, 'November 2026');
  assert.equal(summary.totalMinutes, 120);
  assert.equal(summary.goalMinutes, 300);
  assert.equal(summary.remainingMinutes, 180);
  assert.equal(summary.percentComplete, 40);
  assert.equal(summary.clampedPercent, 40);
  assert.equal(summary.activeDaysThisMonth, 3);
  assert.equal(summary.daysRemainingInMonth, 10);
  assert.equal(summary.dailyPaceNeeded, 18);
  assert.equal(summary.goalMet, false);
});

test('recordReadingMinutesForDate accumulates minutes immutably and caps goalMet at 100% ring clamp', () => {
  const ref = new Date(2026, 10, 21);
  let log = createInitialDailyReadingLog(ref, 24);
  const beforeToday = log[toLocalDateKey(ref)];

  log = recordReadingMinutesForDate(log, ref, 15);
  assert.equal(log[toLocalDateKey(ref)], beforeToday + 15);

  const met = computeMonthlyGoalSummary({ '2026-11-21': 420 }, ref, 300);
  assert.equal(met.goalMet, true);
  assert.equal(met.percentComplete, 140);
  assert.equal(met.clampedPercent, 100);
  assert.equal(met.remainingMinutes, 0);
  assert.equal(met.dailyPaceNeeded, 0);
});

test('normalizeMonthlyGoalMinutes, formatReadingDuration, and storage persistence handle edge cases', () => {
  assert.equal(normalizeMonthlyGoalMinutes(20), 60);
  assert.equal(normalizeMonthlyGoalMinutes(5000), 3000);
  assert.equal(normalizeMonthlyGoalMinutes(308), 315);

  assert.equal(formatReadingDuration(45), '45m');
  assert.equal(formatReadingDuration(60), '1h');
  assert.equal(formatReadingDuration(135), '2h 15m');

  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  const ref = new Date(2026, 10, 21);

  saveReadingProgressToStorage(
    { dailyMinutes: { '2026-11-20': 30, '2026-11-21': 45 }, monthlyGoalMinutes: 450 },
    storage
  );
  const loaded = loadReadingProgressFromStorage(ref, 24, storage);
  assert.equal(loaded.monthlyGoalMinutes, 450);
  assert.equal(loaded.dailyMinutes['2026-11-21'], 45);
});
