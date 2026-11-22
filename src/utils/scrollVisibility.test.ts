import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCROLL_REVEAL_DELAY_MS,
  evaluateScrollVisibility,
} from './scrollVisibility';

test('hides header and navigation bar on meaningful downward or upward scroll', () => {
  const down = evaluateScrollVisibility({
    prevScrollY: 0,
    nextScrollY: 120,
    isLocked: false,
    currentlyHidden: false,
  });
  assert.deepEqual(down, { hidden: true, scheduleReveal: true });

  const up = evaluateScrollVisibility({
    prevScrollY: 320,
    nextScrollY: 180,
    isLocked: false,
    currentlyHidden: false,
  });
  assert.deepEqual(up, { hidden: true, scheduleReveal: true });
});

test('keeps header and navigation visible at the very top of any screen', () => {
  const atTop = evaluateScrollVisibility({
    prevScrollY: 120,
    nextScrollY: 0,
    isLocked: false,
    currentlyHidden: true,
  });
  assert.deepEqual(atTop, { hidden: false, scheduleReveal: false });
});

test('ignores sub-threshold micro jitter when chrome is currently visible', () => {
  const jitter = evaluateScrollVisibility({
    prevScrollY: 80,
    nextScrollY: 83,
    isLocked: false,
    currentlyHidden: false,
  });
  assert.deepEqual(jitter, { hidden: false, scheduleReveal: false });
});

test('never hides chrome while locked (open menu, modal, or focused search input)', () => {
  const locked = evaluateScrollVisibility({
    prevScrollY: 20,
    nextScrollY: 260,
    isLocked: true,
    currentlyHidden: false,
  });
  assert.deepEqual(locked, { hidden: false, scheduleReveal: false });
});

test('auto-reveal delay falls within the requested 1 to 2 second window', () => {
  assert.ok(SCROLL_REVEAL_DELAY_MS >= 1000 && SCROLL_REVEAL_DELAY_MS <= 2000);
});
