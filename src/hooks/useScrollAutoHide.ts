import { useEffect, useRef, useState } from 'react';
import {
  SCROLL_REVEAL_DELAY_MS,
  evaluateScrollVisibility,
} from '../utils/scrollVisibility';

interface UseScrollAutoHideOptions {
  isLocked: boolean;
  resetKey: string;
  revealDelayMs?: number;
}

/**
 * Hides top header & bottom navigation while the user actively scrolls on any tab/screen,
 * then smoothly reveals them automatically after 1-2 seconds (default 1.4s) of scroll idle.
 */
export function useScrollAutoHide({
  isLocked,
  resetKey,
  revealDelayMs = SCROLL_REVEAL_DELAY_MS,
}: UseScrollAutoHideOptions): boolean {
  const [isChromeHidden, setIsChromeHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const revealTimerRef = useRef<number | null>(null);
  const suppressUntilRef = useRef<number>(0);

  const clearRevealTimer = () => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  // Reveal chrome cleanly whenever switching tabs/screens and briefly ignore programmatic scroll resets
  useEffect(() => {
    clearRevealTimer();
    hiddenRef.current = false;
    setIsChromeHidden(false);
    lastScrollYRef.current = typeof window !== 'undefined' ? window.scrollY : 0;
    suppressUntilRef.current = Date.now() + 200;
  }, [resetKey]);

  // Keep chrome visible while any popover, modal, or header search input is active
  useEffect(() => {
    if (isLocked) {
      clearRevealTimer();
      hiddenRef.current = false;
      setIsChromeHidden(false);
    }
  }, [isLocked]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    lastScrollYRef.current = window.scrollY;

    const handleScroll = () => {
      const currentY = window.scrollY;

      if (Date.now() < suppressUntilRef.current) {
        lastScrollYRef.current = currentY;
        return;
      }

      const next = evaluateScrollVisibility({
        prevScrollY: lastScrollYRef.current,
        nextScrollY: currentY,
        isLocked,
        currentlyHidden: hiddenRef.current,
      });

      lastScrollYRef.current = currentY;

      if (next.hidden !== hiddenRef.current) {
        hiddenRef.current = next.hidden;
        setIsChromeHidden(next.hidden);
      }

      clearRevealTimer();
      if (next.scheduleReveal) {
        revealTimerRef.current = window.setTimeout(() => {
          hiddenRef.current = false;
          setIsChromeHidden(false);
          revealTimerRef.current = null;
        }, revealDelayMs);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearRevealTimer();
    };
  }, [isLocked, revealDelayMs]);

  return isChromeHidden;
}
