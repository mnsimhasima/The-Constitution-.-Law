export const SCROLL_REVEAL_DELAY_MS = 1400;
export const SCROLL_TOP_THRESHOLD_PX = 10;
export const SCROLL_DELTA_THRESHOLD_PX = 6;

export interface ScrollVisibilityInput {
  prevScrollY: number;
  nextScrollY: number;
  isLocked: boolean;
  currentlyHidden: boolean;
  topThreshold?: number;
  deltaThreshold?: number;
}

export interface ScrollVisibilityResult {
  hidden: boolean;
  scheduleReveal: boolean;
}

/**
 * Pure scroll-chrome visibility state machine:
 * - While locked (open popover, modal, or focused header input), chrome always stays visible.
 * - At the very top of the page (<= topThreshold), chrome always stays visible.
 * - On any real scroll gesture (>= deltaThreshold in either direction), chrome hides
 *   and schedules an automatic reveal once scrolling stops for ~1.4 seconds.
 */
export function evaluateScrollVisibility({
  prevScrollY,
  nextScrollY,
  isLocked,
  currentlyHidden,
  topThreshold = SCROLL_TOP_THRESHOLD_PX,
  deltaThreshold = SCROLL_DELTA_THRESHOLD_PX,
}: ScrollVisibilityInput): ScrollVisibilityResult {
  if (isLocked) {
    return { hidden: false, scheduleReveal: false };
  }

  const clampedY = Math.max(0, nextScrollY);
  if (clampedY <= topThreshold) {
    return { hidden: false, scheduleReveal: false };
  }

  const delta = Math.abs(clampedY - Math.max(0, prevScrollY));
  if (delta >= deltaThreshold) {
    return { hidden: true, scheduleReveal: true };
  }

  return {
    hidden: currentlyHidden,
    scheduleReveal: currentlyHidden,
  };
}
