import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ListMusic,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../data/booksData';
import type { AudioPlayerState } from '../hooks/useAudioReader';
import type { AudioMode, AudioSegment, LanguageCode } from '../types/library';
import { formatDurationSeconds, getNarrationStageLabel } from '../utils/libraryLogic';

interface AudioPlayerBarProps {
  audio: AudioPlayerState;
  currentSegment: AudioSegment | null;
  currentDuration: number;
  language: LanguageCode;
  speed: number;
  mode: AudioMode;
  onTogglePlayPause: () => void;
  onSkipSegment: (delta: number) => void;
  onJumpToQueueIndex?: (index: number) => void;
  onToggleAutoAdvance?: (enabled: boolean) => void;
  onSeek: (seconds: number) => void;
  onChangeSpeed: (speed: number) => void;
  onChangeMode: (mode: AudioMode) => void;
  onChangeSleep: (minutes: number | null) => void;
  onClose: () => void;
  onOpenCurrentClause: () => void;
  isChromeHidden?: boolean;
}

const SPEED_OPTIONS = [0.8, 1, 1.25, 1.5];
const SLEEP_OPTIONS: (number | null)[] = [null, 10, 20, 30];

export function AudioPlayerBar({
  audio,
  currentSegment,
  currentDuration,
  language,
  speed,
  mode,
  onTogglePlayPause,
  onSkipSegment,
  onJumpToQueueIndex,
  onToggleAutoAdvance,
  onSeek,
  onChangeSpeed,
  onChangeMode,
  onChangeSleep,
  onClose,
  onOpenCurrentClause,
  isChromeHidden = false,
}: AudioPlayerBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!audio.isOpen || !currentSegment) {
    return null;
  }

  const progressPct =
    currentDuration > 0 ? Math.min(100, Math.round((audio.elapsedSeconds / currentDuration) * 100)) : 0;
  const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];
  const stageLabel = getNarrationStageLabel(currentSegment.kind, language);

  return (
    <div
      data-chrome-hidden={isChromeHidden && !expanded ? 'true' : 'false'}
      className={`fixed inset-x-3 bottom-[74px] z-40 mx-auto max-w-3xl transition-all duration-300 ease-out will-change-transform lg:bottom-4 ${
        isChromeHidden && !expanded
          ? 'pointer-events-none translate-y-[220%] opacity-0'
          : 'translate-y-0 opacity-100'
      }`}
    >
      <div className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white/95 shadow-[0_18px_48px_rgba(12,16,24,0.22)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#121620]/96 dark:shadow-[0_18px_48px_rgba(0,0,0,0.6)]">
        {/* Hairline Progress Track */}
        <div className="h-1 w-full bg-slate-200/80 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-[#2563EB] to-[#F59E0B] transition-all duration-200"
            style={{ width: `${audio.isLoadingClip ? 25 : progressPct}%` }}
          />
        </div>

        {/* Compact Floating Dock Row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onOpenCurrentClause}
            className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#2563EB]/12 text-[#2563EB] dark:bg-[#2563EB]/20 dark:text-blue-400">
              {audio.isLoadingClip ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : audio.isPlaying ? (
                <span className="flex h-4 items-end gap-[2.5px]" aria-hidden="true">
                  <span className="audio-bar h-4 w-[2.5px] rounded-full bg-[#2563EB] dark:bg-blue-400" />
                  <span className="audio-bar h-4 w-[2.5px] rounded-full bg-amber-500" />
                  <span className="audio-bar h-4 w-[2.5px] rounded-full bg-[#2563EB] dark:bg-blue-400" />
                </span>
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-slate-950 dark:text-white">
                {currentSegment.clauseNumber} · {currentSegment.headline}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  {audio.currentIndex + 1}/{audio.queue.length}
                </span>
                {' · '}
                {audio.isLoadingClip
                  ? `Preparing ${langMeta.nativeName} audio clip…`
                  : `${stageLabel} · ${langMeta.nativeName}`}
                {!audio.isLoadingClip && (
                  <>
                    {' · '}
                    <span className="font-mono tabular-nums">
                      {formatDurationSeconds(audio.elapsedSeconds)} / {formatDurationSeconds(currentDuration)}
                    </span>
                  </>
                )}
              </p>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onSkipSegment(-1)}
              aria-label="Previous segment"
              className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex cursor-pointer"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onTogglePlayPause}
              aria-label={audio.isPlaying ? 'Pause audio' : 'Play audio'}
              className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#2563EB] text-white shadow-md shadow-blue-600/30 transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              {audio.isLoadingClip ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : audio.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSkipSegment(1)}
              aria-label="Next segment"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-label={expanded ? 'Collapse audio studio controls' : 'Expand audio studio controls'}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer"
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close audio player"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {audio.audioError && (
          <div className="border-t border-rose-200/80 bg-rose-50/90 px-4 py-2 text-xs font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            {audio.audioError}
          </div>
        )}

        {/* Expanded Studio Audio Controls */}
        {expanded && (
          <div className="space-y-4 border-t border-slate-200/80 bg-slate-50/80 px-4 py-4 dark:border-slate-800 dark:bg-[#0D111A]">
            <p className="line-clamp-2 font-reading text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              “{currentSegment.spokenText}”
            </p>

            {/* Scrubber */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] tabular-nums text-slate-500">
                {formatDurationSeconds(audio.elapsedSeconds)}
              </span>
              <input
                type="range"
                aria-label="Audio playback progress"
                min={0}
                max={Math.max(1, Math.round(currentDuration))}
                value={Math.min(Math.round(currentDuration), Math.round(audio.elapsedSeconds))}
                onChange={(e) => onSeek(Number(e.target.value))}
                className="h-1.5 flex-1 accent-[#2563EB] cursor-pointer"
              />
              <span className="font-mono text-[11px] tabular-nums text-slate-500">
                {formatDurationSeconds(currentDuration)}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {/* Mode */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Narration</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  {(['text', 'explanation', 'both'] as AudioMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onChangeMode(m)}
                      className={`h-8 rounded-lg text-[11px] font-bold capitalize transition cursor-pointer ${
                        mode === m
                          ? 'bg-[#2563EB] text-white'
                          : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-300'
                      }`}
                    >
                      {m === 'both' ? 'Both' : m === 'explanation' ? 'Explain' : 'Text'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Speed */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Speed</p>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {SPEED_OPTIONS.map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => onChangeSpeed(sp)}
                      className={`h-8 rounded-lg font-mono text-[11px] font-bold transition cursor-pointer ${
                        speed === sp
                          ? 'bg-[#0C1018] text-white dark:bg-blue-600'
                          : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-300'
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleep timer */}
              <div>
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  <Clock className="h-3 w-3" />
                  Sleep Timer
                </p>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                  {SLEEP_OPTIONS.map((mins) => (
                    <button
                      key={String(mins)}
                      type="button"
                      onClick={() => onChangeSleep(mins)}
                      className={`h-8 rounded-lg font-mono text-[11px] font-bold transition cursor-pointer ${
                        audio.sleepMinutes === mins
                          ? 'bg-amber-500 text-slate-950'
                          : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-300'
                      }`}
                    >
                      {mins ? `${mins}m` : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Sequential Chapter Queue List */}
            {audio.queue.length > 0 && (
              <div className="border-t border-slate-200/80 pt-3 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    <ListMusic className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    <span>
                      Chapter Queue ({audio.currentIndex + 1} of {audio.queue.length})
                    </span>
                  </p>
                  {onToggleAutoAdvance && (
                    <button
                      type="button"
                      onClick={() => onToggleAutoAdvance(!audio.autoAdvance)}
                      className={`h-7 rounded-lg px-2.5 text-[10px] font-bold transition cursor-pointer ${
                        audio.autoAdvance
                          ? 'bg-blue-600/15 text-blue-700 ring-1 ring-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300'
                          : 'border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-400'
                      }`}
                    >
                      Auto-Advance: {audio.autoAdvance ? 'ON' : 'OFF'}
                    </button>
                  )}
                </div>
                <ol className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {audio.queue.map((seg, idx) => {
                    const isCurrent = idx === audio.currentIndex;
                    const isDone = audio.completedIds.includes(seg.id);
                    return (
                      <li key={seg.id}>
                        <button
                          type="button"
                          onClick={() => onJumpToQueueIndex?.(idx)}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition cursor-pointer ${
                            isCurrent
                              ? 'bg-[#2563EB] text-white shadow-xs'
                              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-[#121620] dark:text-slate-200 dark:hover:bg-slate-800/80'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold ${
                              isCurrent
                                ? 'bg-white/20 text-white'
                                : isDone
                                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {isDone && !isCurrent ? <Check className="h-3 w-3" /> : idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-semibold">
                            {seg.clauseNumber} · {getNarrationStageLabel(seg.kind, language)}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[10px] ${
                              isCurrent ? 'text-blue-100' : 'text-slate-400'
                            }`}
                          >
                            {formatDurationSeconds(seg.estimatedSeconds)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
