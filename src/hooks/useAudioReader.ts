import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  AudioMode,
  AudioVoiceName,
  Chapter,
  LanguageCode,
  LawBook,
} from '../types/library';
import {
  audioQueueReducer,
  buildFullChapterPlaybackQueue,
  getLookaheadPrefetchSegments,
  getQueueProgressSummary,
  INITIAL_AUDIO_QUEUE_STATE,
  resolveBookDisplayTitle,
  type AudioQueueState,
} from '../utils/audioQueueController';
import { fetchTtsAudioClipUrl, prefetchTtsAudioClip } from '../utils/audioTtsClient';
import { resolveEffectivePlaybackSpeed } from '../utils/chapterAudioSpeed';

const VOICE_STORAGE_KEY = 'constitution_law_audio_voice_v1';

function loadSavedVoice(): AudioVoiceName {
  if (typeof window === 'undefined') return 'Kore';
  try {
    const raw = window.localStorage.getItem(VOICE_STORAGE_KEY);
    if (raw === 'Kore' || raw === 'Charon' || raw === 'Puck' || raw === 'Fenrir' || raw === 'Zephyr') {
      return raw;
    }
  } catch {
    // Ignore storage access issues
  }
  return 'Kore';
}

export type AudioPlayerState = AudioQueueState;

interface UseAudioReaderOptions {
  language: LanguageCode;
  speed: number;
  chapterSpeeds?: Record<string, number>;
  mode: AudioMode;
  autoAdvance?: boolean;
  persistToIndexedDb?: boolean;
  onActiveClauseChange?: (clauseId: string) => void;
  onListenMinute?: () => void;
  onAudioCacheUpdated?: () => void;
}

export function useAudioReader({
  language,
  speed,
  chapterSpeeds,
  mode,
  autoAdvance = true,
  persistToIndexedDb = false,
  onActiveClauseChange,
  onListenMinute,
  onAudioCacheUpdated,
}: UseAudioReaderOptions) {
  const [audio, dispatch] = useReducer(audioQueueReducer, {
    ...INITIAL_AUDIO_QUEUE_STATE,
    autoAdvance,
  });
  const [voiceName, setVoiceNameState] = useState<AudioVoiceName>(() => loadSavedVoice());

  const activeBookRef = useRef<LawBook | null>(null);
  const activeChapterRef = useRef<Chapter | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const playbackTokenRef = useRef<number>(0);
  const secondsAccumulatorRef = useRef<number>(0);
  const lastTimeUpdateRef = useRef<number>(0);
  const sleepTimeoutRef = useRef<number | null>(null);

  const resolvedSpeed = useMemo(
    () => resolveEffectivePlaybackSpeed(chapterSpeeds, audio.bookId, audio.chapterId, speed),
    [chapterSpeeds, audio.bookId, audio.chapterId, speed]
  );
  const effectiveSpeed = resolvedSpeed.effectiveSpeed;

  const stateRef = useRef(audio);
  stateRef.current = audio;
  const globalSpeedRef = useRef(speed);
  globalSpeedRef.current = speed;
  const chapterSpeedsRef = useRef(chapterSpeeds);
  chapterSpeedsRef.current = chapterSpeeds;
  const speedRef = useRef(effectiveSpeed);
  speedRef.current = effectiveSpeed;
  const languageRef = useRef(language);
  languageRef.current = language;
  const voiceRef = useRef(voiceName);
  voiceRef.current = voiceName;
  const persistToIndexedDbRef = useRef(persistToIndexedDb);
  persistToIndexedDbRef.current = persistToIndexedDb;
  const onActiveClauseChangeRef = useRef(onActiveClauseChange);
  onActiveClauseChangeRef.current = onActiveClauseChange;
  const onListenMinuteRef = useRef(onListenMinute);
  onListenMinuteRef.current = onListenMinute;
  const onAudioCacheUpdatedRef = useRef(onAudioCacheUpdated);
  onAudioCacheUpdatedRef.current = onAudioCacheUpdated;

  // Keep reducer's autoAdvance aligned with user general settings
  useEffect(() => {
    dispatch({ type: 'SET_AUTO_ADVANCE', enabled: autoAdvance });
  }, [autoAdvance]);

  const setVoiceName = useCallback((nextVoice: AudioVoiceName) => {
    setVoiceNameState(nextVoice);
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, nextVoice);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const stopAudioElement = useCallback(() => {
    playbackTokenRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const el = audioElRef.current;
    if (el) {
      el.onended = null;
      el.ontimeupdate = null;
      el.onloadedmetadata = null;
      el.onerror = null;
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch {
        // Ignore teardown errors
      }
      audioElRef.current = null;
    }
  }, []);

  // Core sequential queue driver: triggers whenever playbackTrigger advances via the reducer
  useEffect(() => {
    if (audio.playbackTrigger === 0) return;

    const currentState = stateRef.current;
    const segment = currentState.queue[currentState.currentIndex];
    if (!segment) {
      stopAudioElement();
      return;
    }

    stopAudioElement();
    const myToken = playbackTokenRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const targetLang = languageRef.current;
    const targetVoice = voiceRef.current;

    onActiveClauseChangeRef.current?.(segment.clauseId);

    let cancelled = false;

    const loadAndPlay = async () => {
      try {
        const shouldPersist = persistToIndexedDbRef.current;
        const clipUrl = await fetchTtsAudioClipUrl(
          segment.spokenText,
          targetLang,
          targetVoice,
          controller.signal,
          {
            persistToIndexedDb: shouldPersist,
            bookId: currentState.bookId ?? undefined,
            chapterId: currentState.chapterId ?? undefined,
            segmentId: segment.id,
          }
        );

        if (shouldPersist) {
          onAudioCacheUpdatedRef.current?.();
        }

        if (cancelled || myToken !== playbackTokenRef.current) return;

        const audioEl = new Audio(clipUrl);
        audioEl.preload = 'auto';
        const clipSpeed = resolveEffectivePlaybackSpeed(
          chapterSpeedsRef.current,
          currentState.bookId,
          currentState.chapterId,
          globalSpeedRef.current
        ).effectiveSpeed;
        audioEl.playbackRate = clipSpeed;
        audioElRef.current = audioEl;
        lastTimeUpdateRef.current = 0;

        audioEl.onloadedmetadata = () => {
          if (myToken !== playbackTokenRef.current) return;
          const dur =
            Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : null;
          if (dur) {
            dispatch({ type: 'CLIP_PROGRESS', elapsedSeconds: audioEl.currentTime, durationSeconds: dur });
          }
        };

        audioEl.ontimeupdate = () => {
          if (myToken !== playbackTokenRef.current) return;
          const current = audioEl.currentTime;
          const delta = Math.max(0, current - lastTimeUpdateRef.current);
          lastTimeUpdateRef.current = current;
          if (delta > 0 && delta < 3) {
            secondsAccumulatorRef.current += delta;
            if (secondsAccumulatorRef.current >= 60) {
              secondsAccumulatorRef.current = 0;
              onListenMinuteRef.current?.();
            }
          }
          const dur =
            Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : null;
          dispatch({ type: 'CLIP_PROGRESS', elapsedSeconds: current, durationSeconds: dur });
        };

        audioEl.onended = () => {
          if (myToken !== playbackTokenRef.current) return;
          // Dispatch to pure queue reducer — automatically advances to the next element in order
          dispatch({ type: 'CLIP_ENDED' });
        };

        audioEl.onerror = () => {
          if (myToken !== playbackTokenRef.current) return;
          dispatch({
            type: 'CLIP_ERROR',
            message: 'Audio playback interrupted. Tap Play to retry or Next to continue.',
          });
        };

        await audioEl.play();
        if (cancelled || myToken !== playbackTokenRef.current) {
          audioEl.pause();
          return;
        }

        const dur =
          Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : null;
        dispatch({ type: 'CLIP_PLAYING', durationSeconds: dur });

        // Once the active clip is confirmed playing, gently warm the single next item in the queue
        // after a short settle delay so rapid manual stepping never triggers parallel TTS bursts.
        if (stateRef.current.autoAdvance) {
          window.setTimeout(() => {
            if (cancelled || myToken !== playbackTokenRef.current) return;
            const latest = stateRef.current;
            if (!latest.isPlaying || !latest.autoAdvance) return;
            const upcoming = getLookaheadPrefetchSegments(latest.queue, latest.currentIndex, 1);
            for (const nextItem of upcoming) {
              prefetchTtsAudioClip(nextItem.spokenText, targetLang, targetVoice, {
                persistToIndexedDb: persistToIndexedDbRef.current,
                bookId: latest.bookId ?? undefined,
                chapterId: latest.chapterId ?? undefined,
                segmentId: nextItem.id,
              });
            }
          }, 450);
        }
      } catch (err) {
        if (cancelled || myToken !== playbackTokenRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const message =
          err instanceof Error ? err.message : 'Unable to play this audio clip right now.';
        dispatch({ type: 'CLIP_ERROR', message });
      }
    };

    void loadAndPlay();

    return () => {
      cancelled = true;
    };
  }, [audio.playbackTrigger, stopAudioElement]);

  // Sync playbackRate live whenever effective chapter or global speed changes
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.playbackRate = effectiveSpeed;
    }
  }, [effectiveSpeed]);

  // Enforce sleep timer cleanly
  useEffect(() => {
    if (sleepTimeoutRef.current !== null) {
      window.clearTimeout(sleepTimeoutRef.current);
      sleepTimeoutRef.current = null;
    }
    if (!audio.isPlaying || !audio.sleepMinutes) return;

    sleepTimeoutRef.current = window.setTimeout(() => {
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
      dispatch({ type: 'PAUSE' });
      dispatch({ type: 'SET_SLEEP_MINUTES', minutes: null });
    }, audio.sleepMinutes * 60 * 1000);

    return () => {
      if (sleepTimeoutRef.current !== null) {
        window.clearTimeout(sleepTimeoutRef.current);
        sleepTimeoutRef.current = null;
      }
    };
  }, [audio.isPlaying, audio.sleepMinutes]);

  // Rebuild queue in-place if language, narration mode, or studio voice changes while open
  useEffect(() => {
    const current = stateRef.current;
    if (!current.isOpen || !activeChapterRef.current || !activeBookRef.current) return;

    const book = activeBookRef.current;
    const chapter = activeChapterRef.current;
    const activeSeg = current.queue[current.currentIndex] ?? null;

    const { queue: rebuiltQueue } = buildFullChapterPlaybackQueue(
      book,
      chapter,
      language,
      mode,
      0,
      true
    );
    if (rebuiltQueue.length === 0) return;

    if (!current.isPlaying) {
      stopAudioElement();
    }

    dispatch({
      type: 'REBUILD_QUEUE_IN_PLACE',
      bookTitle: resolveBookDisplayTitle(book, language),
      queue: rebuiltQueue,
      preserveSegment: activeSeg,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, mode, voiceName]);

  // Cleanup audio element on unmount
  useEffect(() => {
    return () => stopAudioElement();
  }, [stopAudioElement]);

  const startPlayback = useCallback(
    (
      book: LawBook,
      chapter: Chapter,
      startClauseIndex = 0,
      overrideMode?: AudioMode,
      includeChapterHeader?: boolean
    ) => {
      const effectiveMode = overrideMode ?? mode;
      const { queue, startIndex } = buildFullChapterPlaybackQueue(
        book,
        chapter,
        language,
        effectiveMode,
        startClauseIndex,
        includeChapterHeader
      );
      if (queue.length === 0) return;

      activeBookRef.current = book;
      activeChapterRef.current = chapter;

      dispatch({
        type: 'LOAD_CHAPTER_QUEUE',
        bookId: book.id,
        bookTitle: resolveBookDisplayTitle(book, language),
        chapterId: chapter.id,
        chapterLabel: chapter.number,
        queue,
        startIndex,
      });
    },
    [language, mode]
  );

  const togglePlayPause = useCallback(() => {
    const current = stateRef.current;
    if (current.queue.length === 0) return;

    if (current.isPlaying) {
      if (audioElRef.current) {
        audioElRef.current.pause();
      } else {
        stopAudioElement();
      }
      dispatch({ type: 'PAUSE' });
      return;
    }

    const el = audioElRef.current;
    if (el && el.src && !current.audioError && !el.ended && current.status === 'paused') {
      el.playbackRate = speedRef.current;
      dispatch({ type: 'RESUME_CURRENT' });
      void el.play().catch(() => {
        dispatch({ type: 'RESTART_OR_RETRY' });
      });
      return;
    }

    dispatch({ type: 'RESTART_OR_RETRY' });
  }, [stopAudioElement]);

  const skipSegment = useCallback(
    (delta: number) => {
      const current = stateRef.current;
      if (current.queue.length === 0) return;
      const nextIndex = Math.max(0, Math.min(current.queue.length - 1, current.currentIndex + delta));
      const nextSeg = current.queue[nextIndex];
      if (nextSeg) {
        onActiveClauseChangeRef.current?.(nextSeg.clauseId);
      }
      if (!current.isPlaying) {
        stopAudioElement();
      }
      dispatch({ type: 'STEP_DELTA', delta });
    },
    [stopAudioElement]
  );

  const jumpToQueueIndex = useCallback((index: number, autoPlay = true) => {
    const current = stateRef.current;
    const targetSeg = current.queue[index];
    if (!targetSeg) return;
    onActiveClauseChangeRef.current?.(targetSeg.clauseId);
    dispatch({ type: 'JUMP_TO_INDEX', index, autoPlay });
  }, []);

  const setAutoAdvance = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_ADVANCE', enabled });
  }, []);

  const seekWithinSegment = useCallback((seconds: number) => {
    const safeSec = Math.max(0, seconds);
    if (audioElRef.current && Number.isFinite(audioElRef.current.duration)) {
      audioElRef.current.currentTime = Math.min(audioElRef.current.duration, safeSec);
      lastTimeUpdateRef.current = audioElRef.current.currentTime;
    }
    dispatch({ type: 'SEEK', seconds: safeSec });
  }, []);

  const setSleepMinutes = useCallback((minutes: number | null) => {
    dispatch({ type: 'SET_SLEEP_MINUTES', minutes });
  }, []);

  const closePlayer = useCallback(() => {
    stopAudioElement();
    dispatch({ type: 'CLOSE' });
  }, [stopAudioElement]);

  const currentSegment = audio.queue[audio.currentIndex] ?? null;
  const currentDuration =
    audio.actualDurationSeconds ??
    (currentSegment ? Math.max(2, currentSegment.estimatedSeconds / effectiveSpeed) : 0);
  const queueProgress = useMemo(() => getQueueProgressSummary(audio), [audio]);

  return {
    audio,
    currentSegment,
    currentDuration,
    effectiveSpeed,
    isChapterSpeedOverride: resolvedSpeed.isChapterOverride,
    queueProgress,
    voiceName,
    setVoiceName,
    startPlayback,
    togglePlayPause,
    skipSegment,
    jumpToQueueIndex,
    setAutoAdvance,
    seekWithinSegment,
    setSleepMinutes,
    closePlayer,
  };
}
