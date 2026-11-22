import type {
  AudioMode,
  AudioSegment,
  Chapter,
  LanguageCode,
  LawBook,
} from '../types/library';
import {
  buildAudioQueue,
  CHAPTER_HEADER_CLAUSE_ID,
  getLocalizedText,
} from './libraryLogic';

export type AudioQueuePlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error';

export interface AudioQueueState {
  isOpen: boolean;
  isPlaying: boolean;
  isLoadingClip: boolean;
  status: AudioQueuePlaybackStatus;
  audioError: string | null;
  bookId: string | null;
  bookTitle: string;
  chapterId: string | null;
  chapterLabel: string;
  queue: AudioSegment[];
  currentIndex: number;
  completedIds: string[];
  autoAdvance: boolean;
  elapsedSeconds: number;
  actualDurationSeconds: number | null;
  sleepMinutes: number | null;
  /** Incremented whenever the controller commands the audio engine to load & start currentIndex */
  playbackTrigger: number;
}

export const INITIAL_AUDIO_QUEUE_STATE: AudioQueueState = {
  isOpen: false,
  isPlaying: false,
  isLoadingClip: false,
  status: 'idle',
  audioError: null,
  bookId: null,
  bookTitle: '',
  chapterId: null,
  chapterLabel: '',
  queue: [],
  currentIndex: 0,
  completedIds: [],
  autoAdvance: true,
  elapsedSeconds: 0,
  actualDurationSeconds: null,
  sleepMinutes: null,
  playbackTrigger: 0,
};

export interface BuiltChapterQueue {
  queue: AudioSegment[];
  startIndex: number;
}

/**
 * Builds the FULL chapter playback queue (header -> clause headline -> clause content -> deep explanation
 * for every clause in the chapter) and resolves the exact starting index based on startClauseIndex /
 * includeChapterHeader so the user can step backward or forward across the entire chapter seamlessly.
 */
export function buildFullChapterPlaybackQueue(
  book: LawBook,
  chapter: Chapter,
  lang: LanguageCode,
  mode: AudioMode,
  startClauseIndex = 0,
  includeChapterHeader?: boolean
): BuiltChapterQueue {
  const fullQueue = buildAudioQueue(chapter, 0, lang, mode, {
    bookTitle: book.title,
    includeChapterHeader: true,
  });

  if (fullQueue.length === 0) {
    return { queue: [], startIndex: 0 };
  }

  const startFromHeader =
    includeChapterHeader !== undefined ? includeChapterHeader : startClauseIndex === 0;

  if (startFromHeader) {
    return { queue: fullQueue, startIndex: 0 };
  }

  const targetClause = chapter.clauses[startClauseIndex];
  if (!targetClause) {
    return { queue: fullQueue, startIndex: 0 };
  }

  const targetIdx = fullQueue.findIndex((seg) => seg.clauseId === targetClause.id);
  return {
    queue: fullQueue,
    startIndex: targetIdx >= 0 ? targetIdx : 0,
  };
}

export type AudioQueueAction =
  | {
      type: 'LOAD_CHAPTER_QUEUE';
      bookId: string;
      bookTitle: string;
      chapterId: string;
      chapterLabel: string;
      queue: AudioSegment[];
      startIndex: number;
    }
  | {
      type: 'REBUILD_QUEUE_IN_PLACE';
      bookTitle: string;
      queue: AudioSegment[];
      preserveSegment: AudioSegment | null;
    }
  | { type: 'CLIP_LOADING' }
  | { type: 'CLIP_PLAYING'; durationSeconds?: number | null }
  | { type: 'CLIP_PROGRESS'; elapsedSeconds: number; durationSeconds?: number | null }
  | { type: 'CLIP_ERROR'; message: string }
  | { type: 'CLIP_ENDED' }
  | { type: 'PAUSE' }
  | { type: 'RESUME_CURRENT' }
  | { type: 'RESTART_OR_RETRY' }
  | { type: 'STEP_DELTA'; delta: number }
  | { type: 'JUMP_TO_INDEX'; index: number; autoPlay?: boolean }
  | { type: 'SEEK'; seconds: number }
  | { type: 'SET_AUTO_ADVANCE'; enabled: boolean }
  | { type: 'SET_SLEEP_MINUTES'; minutes: number | null }
  | { type: 'CLOSE' };

function appendUniqueId(ids: string[], id: string): string[] {
  if (!id || ids.includes(id)) return ids;
  return [...ids, id];
}

export function audioQueueReducer(
  state: AudioQueueState,
  action: AudioQueueAction
): AudioQueueState {
  switch (action.type) {
    case 'LOAD_CHAPTER_QUEUE': {
      if (action.queue.length === 0) return state;
      const safeIndex = Math.max(0, Math.min(action.startIndex, action.queue.length - 1));
      return {
        ...state,
        isOpen: true,
        isPlaying: true,
        isLoadingClip: true,
        status: 'loading',
        audioError: null,
        bookId: action.bookId,
        bookTitle: action.bookTitle,
        chapterId: action.chapterId,
        chapterLabel: action.chapterLabel,
        queue: action.queue,
        currentIndex: safeIndex,
        completedIds: [],
        elapsedSeconds: 0,
        actualDurationSeconds: null,
        playbackTrigger: state.playbackTrigger + 1,
      };
    }

    case 'REBUILD_QUEUE_IN_PLACE': {
      if (!state.isOpen || action.queue.length === 0) return state;
      const prevSeg = action.preserveSegment;
      let nextIndex = 0;

      if (prevSeg) {
        if (prevSeg.clauseId === CHAPTER_HEADER_CLAUSE_ID) {
          nextIndex = 0;
        } else {
          const exactIdx = action.queue.findIndex(
            (seg) => seg.clauseId === prevSeg.clauseId && seg.kind === prevSeg.kind
          );
          const clauseFallbackIdx = action.queue.findIndex(
            (seg) => seg.clauseId === prevSeg.clauseId
          );
          nextIndex = exactIdx >= 0 ? exactIdx : clauseFallbackIdx >= 0 ? clauseFallbackIdx : 0;
        }
      }

      return {
        ...state,
        bookTitle: action.bookTitle,
        queue: action.queue,
        currentIndex: nextIndex,
        elapsedSeconds: 0,
        actualDurationSeconds: null,
        audioError: null,
        isLoadingClip: state.isPlaying,
        status: state.isPlaying ? 'loading' : state.status,
        playbackTrigger: state.isPlaying ? state.playbackTrigger + 1 : state.playbackTrigger,
      };
    }

    case 'CLIP_LOADING':
      return {
        ...state,
        isPlaying: true,
        isLoadingClip: true,
        status: 'loading',
        audioError: null,
      };

    case 'CLIP_PLAYING':
      return {
        ...state,
        isPlaying: true,
        isLoadingClip: false,
        status: 'playing',
        audioError: null,
        actualDurationSeconds:
          action.durationSeconds && action.durationSeconds > 0
            ? action.durationSeconds
            : state.actualDurationSeconds,
      };

    case 'CLIP_PROGRESS':
      return {
        ...state,
        elapsedSeconds: Math.max(0, action.elapsedSeconds),
        actualDurationSeconds:
          action.durationSeconds && action.durationSeconds > 0
            ? action.durationSeconds
            : state.actualDurationSeconds,
      };

    case 'CLIP_ERROR':
      return {
        ...state,
        isPlaying: false,
        isLoadingClip: false,
        status: 'error',
        audioError: action.message,
      };

    case 'CLIP_ENDED': {
      const finishedSeg = state.queue[state.currentIndex];
      const nextCompleted = finishedSeg
        ? appendUniqueId(state.completedIds, finishedSeg.id)
        : state.completedIds;
      const nextIndex = state.currentIndex + 1;

      if (state.autoAdvance && nextIndex < state.queue.length) {
        return {
          ...state,
          currentIndex: nextIndex,
          completedIds: nextCompleted,
          isPlaying: true,
          isLoadingClip: true,
          status: 'loading',
          audioError: null,
          elapsedSeconds: 0,
          actualDurationSeconds: null,
          playbackTrigger: state.playbackTrigger + 1,
        };
      }

      const reachedEnd = nextIndex >= state.queue.length;
      return {
        ...state,
        completedIds: nextCompleted,
        isPlaying: false,
        isLoadingClip: false,
        status: reachedEnd ? 'completed' : 'paused',
        elapsedSeconds: state.actualDurationSeconds ?? state.elapsedSeconds,
      };
    }

    case 'PAUSE':
      return {
        ...state,
        isPlaying: false,
        isLoadingClip: false,
        status: 'paused',
      };

    case 'RESUME_CURRENT':
      return {
        ...state,
        isPlaying: true,
        isLoadingClip: false,
        status: 'playing',
        audioError: null,
      };

    case 'RESTART_OR_RETRY': {
      if (state.queue.length === 0) return state;
      const restartIndex =
        state.status === 'completed' && state.currentIndex >= state.queue.length - 1
          ? 0
          : state.currentIndex;
      return {
        ...state,
        currentIndex: restartIndex,
        completedIds: restartIndex === 0 && state.status === 'completed' ? [] : state.completedIds,
        isPlaying: true,
        isLoadingClip: true,
        status: 'loading',
        audioError: null,
        elapsedSeconds: 0,
        actualDurationSeconds: null,
        playbackTrigger: state.playbackTrigger + 1,
      };
    }

    case 'STEP_DELTA': {
      if (state.queue.length === 0) return state;
      const nextIndex = Math.max(
        0,
        Math.min(state.queue.length - 1, state.currentIndex + action.delta)
      );
      const shouldPlay = state.isPlaying;
      return {
        ...state,
        currentIndex: nextIndex,
        elapsedSeconds: 0,
        actualDurationSeconds: null,
        audioError: null,
        isLoadingClip: shouldPlay,
        status: shouldPlay ? 'loading' : 'paused',
        playbackTrigger: shouldPlay ? state.playbackTrigger + 1 : state.playbackTrigger,
      };
    }

    case 'JUMP_TO_INDEX': {
      if (state.queue.length === 0) return state;
      const safeIndex = Math.max(0, Math.min(action.index, state.queue.length - 1));
      const shouldPlay = action.autoPlay !== undefined ? action.autoPlay : true;
      return {
        ...state,
        currentIndex: safeIndex,
        elapsedSeconds: 0,
        actualDurationSeconds: null,
        audioError: null,
        isPlaying: shouldPlay,
        isLoadingClip: shouldPlay,
        status: shouldPlay ? 'loading' : 'paused',
        playbackTrigger: shouldPlay ? state.playbackTrigger + 1 : state.playbackTrigger,
      };
    }

    case 'SEEK':
      return {
        ...state,
        elapsedSeconds: Math.max(0, action.seconds),
      };

    case 'SET_AUTO_ADVANCE':
      return {
        ...state,
        autoAdvance: action.enabled,
      };

    case 'SET_SLEEP_MINUTES':
      return {
        ...state,
        sleepMinutes: action.minutes,
      };

    case 'CLOSE':
      return {
        ...INITIAL_AUDIO_QUEUE_STATE,
        autoAdvance: state.autoAdvance,
      };

    default:
      return state;
  }
}

export function getLookaheadPrefetchSegments(
  queue: AudioSegment[],
  currentIndex: number,
  lookahead = 2
): AudioSegment[] {
  if (queue.length === 0 || lookahead <= 0) return [];
  const start = Math.max(0, currentIndex + 1);
  return queue.slice(start, start + lookahead);
}

export interface QueueProgressSummary {
  position: number;
  total: number;
  completedCount: number;
  percentComplete: number;
  hasPrev: boolean;
  hasNext: boolean;
  nextSegment: AudioSegment | null;
}

export function getQueueProgressSummary(state: AudioQueueState): QueueProgressSummary {
  const total = state.queue.length;
  const position = total > 0 ? state.currentIndex + 1 : 0;
  const completedCount = state.completedIds.length;
  const percentComplete =
    total === 0 ? 0 : Math.min(100, Math.round((completedCount / total) * 100));
  return {
    position,
    total,
    completedCount,
    percentComplete,
    hasPrev: state.currentIndex > 0,
    hasNext: state.currentIndex + 1 < total,
    nextSegment: state.queue[state.currentIndex + 1] ?? null,
  };
}

export function resolveBookDisplayTitle(book: LawBook, lang: LanguageCode): string {
  return getLocalizedText(book.title, lang) || book.shortTitle;
}
