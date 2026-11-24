import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookMarked,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Download,
  Gauge,
  GraduationCap,
  HardDrive,
  Headphones,
  Layers,
  Lightbulb,
  ListOrdered,
  Loader2,
  MessageSquarePlus,
  Minus,
  Pause,
  Play,
  Plus,
  Printer,
  Repeat,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Trash2,
  Type,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../data/booksData';
import type {
  AudioMode,
  AudioSegment,
  AudioVoiceName,
  CachedChapterSummary,
  ChapterCacheProgress,
  Clause,
  ClauseBookmark,
  ClauseHighlight,
  ClauseNote,
  HighlightColor,
  LanguageCode,
  LawBook,
  ReaderFontFace,
  ReaderFontSize,
  ReaderPreferences,
  ReaderTheme,
} from '../types/library';
import type { OttGlossaryTerm, OttMasterBookGlossaryResponse } from '../types/ott';
import {
  CHAPTER_AUDIO_SPEED_STEP,
  CHAPTER_SPEED_PRESETS,
  formatAudioSpeedLabel,
  MAX_CHAPTER_AUDIO_SPEED,
  MIN_CHAPTER_AUDIO_SPEED,
  normalizeAudioSpeed,
  resolveEffectivePlaybackSpeed,
  stepChapterAudioSpeed,
} from '../utils/chapterAudioSpeed';
import type { ChapterExportDocument } from '../utils/chapterPdfExporter';
import { extractMatchedGlossaryTerms } from '../utils/legalGlossary';
import {
  buildAudioQueue,
  CHAPTER_HEADER_CLAUSE_ID,
  getClauseKey,
  getLocalizedText,
  getNarrationStageLabel,
  isRtlLanguage,
  localizeStructuralLabel,
} from '../utils/libraryLogic';
import { buildChapterCacheKey, formatBytes } from '../utils/offlineAudioCache';
import { ChapterExportModal } from './ChapterExportModal';
import { ClauseShareModal } from './ClauseShareModal';
import { GlossaryHighlightedText } from './GlossaryHighlightedText';
import type { ReadMenuAction } from './NavigationShell';
import { ExpandableGlossaryOverlay, GlossaryTermPopup } from './ReaderGlossaryOverlay';

interface ReaderViewProps {
  books: LawBook[];
  bookId: string;
  chapterId: string;
  selectedClauseId?: string;
  activeAudioBookId: string | null;
  activeAudioChapterId: string | null;
  activeAudioClauseId?: string;
  activeAudioSegment?: AudioSegment | null;
  audioQueue?: AudioSegment[];
  audioQueueIndex?: number;
  audioCompletedIds?: string[];
  audioAutoAdvance?: boolean;
  onToggleAutoAdvance?: (enabled: boolean) => void;
  onJumpToQueueIndex?: (index: number) => void;
  isAudioPlaying: boolean;
  isAudioLoading?: boolean;
  audioError?: string | null;
  audioVoice?: AudioVoiceName;
  onChangeAudioVoice?: (voice: AudioVoiceName) => void;
  chapterAudioSpeeds?: Record<string, number>;
  onSetChapterAudioSpeed?: (bookId: string, chapterId: string, speed: number) => void;
  onResetChapterAudioSpeed?: (bookId: string, chapterId: string) => void;
  audioElapsedSeconds: number;
  audioDurationSeconds: number;
  searchOpen: boolean;
  onCloseSearch: () => void;
  activeDrawer: ReadMenuAction | null;
  onCloseDrawer: () => void;
  preferences: ReaderPreferences;
  highlights: Record<string, ClauseHighlight>;
  bookmarks: Record<string, ClauseBookmark>;
  notes: ClauseNote[];
  onSelectBookChapter: (bookId: string, chapterId: string, clauseId?: string) => void;
  onUpdatePreferences: (patch: Partial<ReaderPreferences>) => void;
  onToggleHighlight: (
    bookId: string,
    chapterId: string,
    clauseId: string,
    color: HighlightColor | null
  ) => void;
  onToggleBookmark: (bookId: string, chapterId: string, clauseId: string) => void;
  onSaveNote: (
    bookId: string,
    chapterId: string,
    clauseId: string,
    content: string,
    existingNoteId?: string
  ) => void;
  onDeleteNote: (noteId: string) => void;
  onPlayChapterAudio: (
    bookId: string,
    chapterId: string,
    startClauseIndex?: number,
    includeChapterHeader?: boolean
  ) => void;
  onTogglePlayPause: () => void;
  onSkipAudioSegment?: (delta: number) => void;
  cachedChapters?: CachedChapterSummary[];
  chapterCacheProgress?: Record<string, ChapterCacheProgress>;
  isOffline?: boolean;
  onCacheChapterOffline?: (bookId: string, chapterId: string) => Promise<void>;
  onCancelCacheChapter?: (chapterCacheKey: string) => void;
  onRemoveCachedChapter?: (chapterCacheKey: string) => Promise<void>;
  completedChapterKeys?: string[];
  onCompleteChapterAndStartQuiz?: (bookId: string, chapterId: string) => void;
  isChromeHidden?: boolean;
}

const HIGHLIGHT_SWATCHES: { color: HighlightColor; label: string; dot: string; cardBg: string }[] = [
  {
    color: 'sky',
    label: 'Cobalt',
    dot: 'bg-blue-500',
    cardBg: 'bg-blue-50/90 dark:bg-blue-500/15',
  },
  {
    color: 'amber',
    label: 'Amber',
    dot: 'bg-amber-400',
    cardBg: 'bg-amber-50/95 dark:bg-amber-500/15',
  },
  {
    color: 'sage',
    label: 'Mint',
    dot: 'bg-emerald-400',
    cardBg: 'bg-emerald-50/90 dark:bg-emerald-500/15',
  },
  {
    color: 'rose',
    label: 'Coral',
    dot: 'bg-rose-400',
    cardBg: 'bg-rose-50/90 dark:bg-rose-500/15',
  },
  {
    color: 'lilac',
    label: 'Iris',
    dot: 'bg-violet-400',
    cardBg: 'bg-violet-50/90 dark:bg-violet-500/15',
  },
];

const READER_SURFACE: Record<ReaderTheme, string> = {
  light: 'bg-white text-[#0C1018] border-slate-200/90',
  warm: 'bg-[#FAF6EF] text-[#1A1611] border-[#E7DEC8]',
  dark: 'bg-[#0F131C] text-[#F1F5FB] border-slate-800',
};

const FONT_SIZE_CLASS: Record<ReaderFontSize, string> = {
  sm: 'text-[15px] leading-[1.75]',
  md: 'text-[17px] leading-[1.8]',
  lg: 'text-[19px] leading-[1.82]',
  xl: 'text-[21px] leading-[1.85]',
};

const FONT_FACE_CLASS: Record<ReaderFontFace, string> = {
  sans: 'font-reading',
  display: 'font-display',
};

export function ReaderView({
  books,
  bookId,
  chapterId,
  selectedClauseId,
  activeAudioBookId,
  activeAudioChapterId,
  activeAudioClauseId,
  activeAudioSegment = null,
  audioQueue = [],
  audioQueueIndex = 0,
  audioCompletedIds = [],
  audioAutoAdvance = true,
  onToggleAutoAdvance,
  onJumpToQueueIndex,
  isAudioPlaying,
  isAudioLoading = false,
  audioError = null,
  audioVoice = 'Kore',
  onChangeAudioVoice,
  chapterAudioSpeeds = {},
  onSetChapterAudioSpeed,
  onResetChapterAudioSpeed,
  audioElapsedSeconds,
  audioDurationSeconds,
  searchOpen,
  onCloseSearch,
  activeDrawer,
  onCloseDrawer,
  preferences,
  highlights,
  bookmarks,
  notes,
  onSelectBookChapter,
  onUpdatePreferences,
  onToggleHighlight,
  onToggleBookmark,
  onSaveNote,
  onDeleteNote,
  onPlayChapterAudio,
  onTogglePlayPause,
  onSkipAudioSegment,
  cachedChapters = [],
  chapterCacheProgress = {},
  isOffline = false,
  onCacheChapterOffline,
  onCancelCacheChapter,
  onRemoveCachedChapter,
  completedChapterKeys = [],
  onCompleteChapterAndStartQuiz,
  isChromeHidden = false,
}: ReaderViewProps) {
  const [focusedClauseId, setFocusedClauseId] = useState<string | null>(selectedClauseId ?? null);
  const [noteDraft, setNoteDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>(undefined);
  const [copiedClauseId, setCopiedClauseId] = useState<string | null>(null);
  const [chapterQuery, setChapterQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ clause: Clause; excerpt: string } | null>(null);

  // Expandable Glossary state (powered by backend Master Book metadata)
  const [glossaryTerms, setGlossaryTerms] = useState<OttGlossaryTerm[]>([]);
  const [matchedMasterBook, setMatchedMasterBook] = useState<
    OttMasterBookGlossaryResponse['matchedMasterBook']
  >(null);
  const [glossaryLoading, setGlossaryLoading] = useState(false);
  const [glossaryHighlightsEnabled, setGlossaryHighlightsEnabled] = useState(true);
  const [activeGlossaryTerm, setActiveGlossaryTerm] = useState<OttGlossaryTerm | null>(null);
  const [isGlossaryOverlayOpen, setIsGlossaryOverlayOpen] = useState(false);
  const [glossaryFocusedTermId, setGlossaryFocusedTermId] = useState<string | null>(null);

  // Print / PDF Export state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [printSheetDoc, setPrintSheetDoc] = useState<ChapterExportDocument | null>(null);

  const activeBook = useMemo(() => books.find((b) => b.id === bookId) ?? books[0], [books, bookId]);
  const activeChapterIndex = useMemo(() => {
    if (!activeBook) return 0;
    const idx = activeBook.chapters.findIndex((c) => c.id === chapterId);
    return idx >= 0 ? idx : 0;
  }, [activeBook, chapterId]);

  const activeChapter = activeBook?.chapters[activeChapterIndex];

  // Fetch legal glossary definitions from backend Master Book metadata for the active book
  useEffect(() => {
    if (!activeBook) return;
    const controller = new AbortController();
    setGlossaryLoading(true);
    setActiveGlossaryTerm(null);

    const params = new URLSearchParams({
      bookId: activeBook.id,
      bookTitle: activeBook.title.en || activeBook.shortTitle,
    });

    fetch(`/api/books-structures/glossary?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: OttMasterBookGlossaryResponse | null) => {
        if (!data || controller.signal.aborted) return;
        setGlossaryTerms(Array.isArray(data.terms) ? data.terms : []);
        setMatchedMasterBook(data.matchedMasterBook ?? null);
      })
      .catch(() => {
        // Offline or cancelled: preserve any previously loaded glossary terms
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setGlossaryLoading(false);
        }
      });

    return () => controller.abort();
  }, [activeBook?.id, activeBook?.shortTitle, activeBook?.title.en]);

  // Open glossary overlay or print/PDF modal when triggered from the Read header 3-dot menu
  useEffect(() => {
    if (activeDrawer === 'glossary') {
      setGlossaryFocusedTermId(null);
      setIsGlossaryOverlayOpen(true);
      onCloseDrawer();
    } else if (activeDrawer === 'export') {
      setIsExportModalOpen(true);
      onCloseDrawer();
    }
  }, [activeDrawer, onCloseDrawer]);

  // Clean up print mode class after browser print completes
  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('is-printing-chapter');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('is-printing-chapter');
    };
  }, []);

  const chapterGlossaryMatches = useMemo(() => {
    if (!activeChapter || glossaryTerms.length === 0) return [];
    const texts: string[] = [getLocalizedText(activeChapter.summary, preferences.language)];
    for (const clause of activeChapter.clauses) {
      texts.push(getLocalizedText(clause.text, preferences.language));
      texts.push(getLocalizedText(clause.explanation, preferences.language));
    }
    return extractMatchedGlossaryTerms(texts, glossaryTerms);
  }, [activeChapter, glossaryTerms, preferences.language]);

  const handleRequestPrintChapter = (doc: ChapterExportDocument) => {
    setPrintSheetDoc(doc);
    document.body.classList.add('is-printing-chapter');
    window.setTimeout(() => {
      try {
        window.print();
      } finally {
        window.setTimeout(() => {
          document.body.classList.remove('is-printing-chapter');
        }, 300);
      }
    }, 60);
  };

  const relatedBooks = useMemo(() => {
    if (!activeBook) return [];
    return books.filter((b) => b.id !== activeBook.id).slice(0, 4);
  }, [books, activeBook]);

  const isCurrentChapterLoaded = Boolean(
    activeBook &&
      activeChapter &&
      activeAudioBookId === activeBook.id &&
      activeAudioChapterId === activeChapter.id
  );
  const isCurrentChapterPlaying = isCurrentChapterLoaded && isAudioPlaying;
  const isCurrentChapterLoading = isCurrentChapterLoaded && isAudioLoading;
  const isCurrentChapterActive = isCurrentChapterPlaying || isCurrentChapterLoading;

  // Build preview queue for this chapter so the user can inspect and start at any element even before hitting Play
  const chapterQueueItems = useMemo(() => {
    if (isCurrentChapterLoaded && audioQueue.length > 0) {
      return audioQueue;
    }
    if (!activeBook || !activeChapter) return [];
    return buildAudioQueue(activeChapter, 0, preferences.language, preferences.audioMode, {
      bookTitle: activeBook.title,
      includeChapterHeader: true,
    });
  }, [
    isCurrentChapterLoaded,
    audioQueue,
    activeBook,
    activeChapter,
    preferences.language,
    preferences.audioMode,
  ]);

  const completedIdSet = useMemo(() => new Set(audioCompletedIds), [audioCompletedIds]);

  const resolvedChapterSpeed = useMemo(
    () =>
      resolveEffectivePlaybackSpeed(
        chapterAudioSpeeds,
        activeBook?.id,
        activeChapter?.id,
        preferences.audioSpeed
      ),
    [chapterAudioSpeeds, activeBook?.id, activeChapter?.id, preferences.audioSpeed]
  );

  const handleChangeCurrentChapterSpeed = (nextSpeed: number) => {
    if (!activeBook || !activeChapter) return;
    const normalized = normalizeAudioSpeed(nextSpeed);
    if (onSetChapterAudioSpeed) {
      onSetChapterAudioSpeed(activeBook.id, activeChapter.id, normalized);
    } else {
      onUpdatePreferences({ audioSpeed: normalized });
    }
  };

  // Smoothly scroll the currently speaking header, headline, clause text, or explanation into view
  useEffect(() => {
    if (!isCurrentChapterActive) return;
    const targetId = activeAudioSegment?.domTargetId;
    if (!targetId) return;
    const el = document.getElementById(targetId);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isCurrentChapterActive, activeAudioSegment?.id, activeAudioSegment?.domTargetId]);

  if (!activeBook || !activeChapter) {
    return null;
  }

  const effectiveTheme: ReaderTheme = preferences.appDarkMode ? 'dark' : preferences.readerTheme;
  const lang = preferences.language;
  const compareLang =
    preferences.compareLanguage === lang ? (lang === 'en' ? 'te' : 'en') : preferences.compareLanguage;
  const rtl = isRtlLanguage(lang);
  const compareRtl = isRtlLanguage(compareLang);

  const prevChapter = activeChapterIndex > 0 ? activeBook.chapters[activeChapterIndex - 1] : null;
  const nextChapter =
    activeChapterIndex < activeBook.chapters.length - 1
      ? activeBook.chapters[activeChapterIndex + 1]
      : null;

  const isHeaderSpeaking = Boolean(
    isCurrentChapterActive &&
      (activeAudioSegment?.kind === 'header' || activeAudioClauseId === CHAPTER_HEADER_CLAUSE_ID)
  );
  const audioProgressPct =
    isCurrentChapterLoaded && audioDurationSeconds > 0
      ? Math.min(100, Math.round((audioElapsedSeconds / audioDurationSeconds) * 100))
      : 0;
  const canStepPrevSegment = Boolean(
    isCurrentChapterLoaded && onSkipAudioSegment && audioQueueIndex > 0
  );
  const canStepNextSegment = Boolean(
    isCurrentChapterLoaded &&
      onSkipAudioSegment &&
      chapterQueueItems.length > 0 &&
      audioQueueIndex < chapterQueueItems.length - 1
  );

  const currentChapterCacheKey = buildChapterCacheKey(
    activeBook.id,
    activeChapter.id,
    lang,
    audioVoice,
    preferences.audioMode
  );
  const currentCachedEntry = cachedChapters.find(
    (c) => c.chapterCacheKey === currentChapterCacheKey
  );
  const currentCacheProgress = chapterCacheProgress[currentChapterCacheKey];
  const isCachingCurrentChapter = currentCacheProgress?.status === 'caching';

  const trimmedQuery = chapterQuery.trim().toLowerCase();
  const visibleClauses = trimmedQuery
    ? activeChapter.clauses.filter((clause) => {
        const haystack = [
          clause.number,
          getLocalizedText(clause.principle, lang),
          getLocalizedText(clause.text, lang),
          getLocalizedText(clause.explanation, lang),
          clause.text.en,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(trimmedQuery);
      })
    : activeChapter.clauses;

  const handleCopyClause = async (clause: Clause) => {
    const text = `${activeBook.shortTitle} · ${clause.number}\n${getLocalizedText(
      clause.text,
      lang
    )}\n\nExplanation: ${getLocalizedText(clause.explanation, lang)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedClauseId(clause.id);
      window.setTimeout(() => setCopiedClauseId(null), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleOpenClauseStudio = (clause: Clause) => {
    const nextFocused = focusedClauseId === clause.id ? null : clause.id;
    setFocusedClauseId(nextFocused);
    setNoteDraft('');
    setEditingNoteId(undefined);
  };

  const handleOpenShareClause = (clause: Clause) => {
    let selectedExcerpt = '';
    if (typeof window !== 'undefined') {
      const sel = window.getSelection()?.toString().trim() ?? '';
      if (sel.length >= 12 && sel.length <= 600) {
        selectedExcerpt = sel;
      }
    }
    setShareTarget({ clause, excerpt: selectedExcerpt });
  };

  const handleFloatingPlayClick = () => {
    if (isCurrentChapterLoaded) {
      onTogglePlayPause();
    } else {
      onPlayChapterAudio(activeBook.id, activeChapter.id, 0, true);
    }
  };

  const activeLangName = SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.nativeName ?? 'English';
  const compareLangName =
    SUPPORTED_LANGUAGES.find((l) => l.code === compareLang)?.nativeName ?? 'తెలుగు';

  return (
    <div className="min-w-0 space-y-4">
      {/* Header-Triggered Search Bar */}
      {searchOpen && (
        <div className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm dark:border-blue-500/30 dark:bg-[#121620]">
          <div className="relative flex items-center gap-2">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
            <input
              type="search"
              value={chapterQuery}
              onChange={(e) => setChapterQuery(e.target.value)}
              placeholder={`Search clauses in ${activeChapter.number}…`}
              aria-label="Search within chapter"
              autoFocus
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                setChapterQuery('');
                onCloseSearch();
              }}
              aria-label="Close chapter search"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {trimmedQuery && (
            <p className="mt-2 px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Showing {visibleClauses.length} of {activeChapter.clauses.length} clauses in{' '}
              {activeChapter.number}
            </p>
          )}
        </div>
      )}

      {/* Header 3-Dot Menu Drawer: 1. Related Content */}
      {activeDrawer === 'related' && (
        <section
          aria-label="Related Content"
          className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Related Content
              </h2>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close related content"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Units in {activeBook.shortTitle}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {activeBook.chapters.map((ch) => {
                  const isCurrent = ch.id === activeChapter.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        onSelectBookChapter(activeBook.id, ch.id);
                        onCloseDrawer();
                      }}
                      className={`min-w-0 rounded-xl border p-3 text-left transition cursor-pointer ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-500/15'
                          : 'border-slate-200 bg-slate-50/70 hover:border-blue-400 dark:border-slate-800 dark:bg-[#0D111A]'
                      }`}
                    >
                      <p className="font-mono text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                        {ch.number} · {ch.estimatedMinutes} min
                      </p>
                      <p className="mt-0.5 truncate text-xs font-bold text-slate-950 dark:text-white">
                        {getLocalizedText(ch.title, lang)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Cross-Referenced Books
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {relatedBooks.map((book) => (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => {
                      if (book.chapters[0]) {
                        onSelectBookChapter(book.id, book.chapters[0].id);
                        onCloseDrawer();
                      }
                    }}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-blue-400 dark:border-slate-800 dark:bg-[#0D111A] cursor-pointer"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-950 dark:text-white">
                        {getLocalizedText(book.title, lang)}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {book.jurisdiction} · {book.chapters.length} units
                      </p>
                    </div>
                    <BookOpen className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Header 3-Dot Menu Drawer: 2. Font Settings */}
      {activeDrawer === 'font' && (
        <section
          aria-label="Font Settings"
          className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Font Settings
              </h2>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close font settings"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Text Size
              </p>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(['sm', 'md', 'lg', 'xl'] as ReaderFontSize[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onUpdatePreferences({ fontSize: sz })}
                    className={`h-9 rounded-xl text-xs font-bold uppercase transition cursor-pointer ${
                      preferences.fontSize === sz
                        ? 'bg-[#2563EB] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Typeface
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(['sans', 'display'] as ReaderFontFace[]).map((face) => (
                  <button
                    key={face}
                    type="button"
                    onClick={() => onUpdatePreferences({ fontFace: face })}
                    className={`h-9 rounded-xl text-xs font-bold transition cursor-pointer ${
                      preferences.fontFace === face
                        ? 'bg-[#2563EB] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                    }`}
                  >
                    {face === 'sans' ? 'Modern Sans' : 'Editorial'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Reading Surface
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(['light', 'warm', 'dark'] as ReaderTheme[]).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() =>
                      onUpdatePreferences({
                        readerTheme: theme,
                        appDarkMode: theme === 'dark',
                      })
                    }
                    className={`h-9 rounded-xl text-xs font-bold capitalize transition cursor-pointer ${
                      effectiveTheme === theme
                        ? 'bg-[#2563EB] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() =>
                onUpdatePreferences({ showInlineExplanations: !preferences.showInlineExplanations })
              }
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                preferences.showInlineExplanations
                  ? 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              <span>Inline Explanations</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdatePreferences({ showParallelLanguage: !preferences.showParallelLanguage })
              }
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                preferences.showParallelLanguage
                  ? 'bg-blue-500/15 text-blue-800 ring-1 ring-blue-500/30 dark:bg-blue-500/20 dark:text-blue-200'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>Parallel Bilingual</span>
            </button>

            {preferences.showParallelLanguage && (
              <select
                aria-label="Compare parallel language"
                value={compareLang}
                onChange={(e) =>
                  onUpdatePreferences({ compareLanguage: e.target.value as LanguageCode })
                }
                className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-100 cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.filter((l) => l.code !== lang).map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.shortCode} · {opt.nativeName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>
      )}

      {/* Header 3-Dot Menu Drawer: 3. Select Audio */}
      {activeDrawer === 'audio' && (
        <section
          aria-label="Select Audio"
          className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
                Select Audio
              </h2>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close audio selector"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 space-y-4">
            {/* Auto-Advance & Sequential Chapter Playback Queue — prominent at top for mobile */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-[#0D111A]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ListOrdered className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
                    Chapter Playback Queue ({chapterQueueItems.length})
                  </p>
                </div>
                {onToggleAutoAdvance && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={audioAutoAdvance}
                    onClick={() => onToggleAutoAdvance(!audioAutoAdvance)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition cursor-pointer ${
                      audioAutoAdvance
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-300'
                    }`}
                  >
                    <Repeat className="h-3 w-3" />
                    <span>Auto-Advance: {audioAutoAdvance ? 'ON' : 'OFF'}</span>
                  </button>
                )}
              </div>

              <ol
                aria-label="Chapter sequential playback queue"
                className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-0.5"
              >
                {chapterQueueItems.map((seg, idx) => {
                  const isActiveItem = isCurrentChapterLoaded && idx === audioQueueIndex;
                  const isCompletedItem = isCurrentChapterLoaded && completedIdSet.has(seg.id);
                  return (
                    <li key={seg.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isCurrentChapterLoaded && onJumpToQueueIndex) {
                            onJumpToQueueIndex(idx);
                          } else if (seg.kind === 'header') {
                            onPlayChapterAudio(activeBook.id, activeChapter.id, 0, true);
                          } else {
                            const clauseIdx = activeChapter.clauses.findIndex(
                              (c) => c.id === seg.clauseId
                            );
                            onPlayChapterAudio(
                              activeBook.id,
                              activeChapter.id,
                              Math.max(0, clauseIdx),
                              false
                            );
                          }
                        }}
                        aria-current={isActiveItem ? 'true' : undefined}
                        className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition cursor-pointer ${
                          isActiveItem
                            ? 'border-[#2563EB] bg-blue-50/90 dark:border-blue-500 dark:bg-blue-500/20'
                            : 'border-slate-200/70 bg-white hover:border-blue-300 dark:border-slate-800 dark:bg-[#121620] dark:hover:border-blue-500/50'
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-bold ${
                            isActiveItem
                              ? 'bg-[#2563EB] text-white'
                              : isCompletedItem
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {isCompletedItem && !isActiveItem ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-950 dark:text-white">
                            {seg.clauseNumber} · {getNarrationStageLabel(seg.kind, lang)}
                          </p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {seg.headline}
                          </p>
                        </div>
                        {isActiveItem && (
                          <span className="shrink-0 font-mono text-[10px] font-bold uppercase text-[#2563EB] dark:text-blue-300">
                            {isCurrentChapterLoading ? 'Loading' : isCurrentChapterPlaying ? 'Playing' : 'Paused'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>

              <button
                type="button"
                onClick={() => {
                  onPlayChapterAudio(activeBook.id, activeChapter.id, 0, true);
                  onCloseDrawer();
                }}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#1D4ED8] cursor-pointer"
              >
                <Headphones className="h-4 w-4" />
                Play Full Chapter from Top · {getLocalizedText(activeBook.title, lang)}
              </button>

              {/* IndexedDB Offline Audio Cache Controls */}
              {onCacheChapterOffline && (
                <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-[#121620]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <HardDrive
                        className={`h-4 w-4 shrink-0 ${
                          currentCachedEntry
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {currentCachedEntry
                            ? `Saved Offline (${formatBytes(currentCachedEntry.totalBytes)})`
                            : isCachingCurrentChapter
                              ? `Caching offline (${currentCacheProgress.completedSegments}/${currentCacheProgress.totalSegments})…`
                              : 'Offline Audio Cache (IndexedDB)'}
                        </p>
                        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                          {currentCachedEntry
                            ? `${currentCachedEntry.segmentCount} clips ready without internet`
                            : 'Store all chapter clips locally for offline playback'}
                        </p>
                      </div>
                    </div>

                    {isCachingCurrentChapter ? (
                      <button
                        type="button"
                        onClick={() => onCancelCacheChapter?.(currentChapterCacheKey)}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                        <span>Cancel</span>
                      </button>
                    ) : currentCachedEntry ? (
                      <button
                        type="button"
                        onClick={() => void onRemoveCachedChapter?.(currentChapterCacheKey)}
                        aria-label="Remove offline chapter audio"
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Remove</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isOffline}
                        onClick={() => void onCacheChapterOffline(activeBook.id, activeChapter.id)}
                        aria-label="Save chapter audio for offline listening"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Save Offline</span>
                      </button>
                    )}
                  </div>

                  {currentCacheProgress?.status === 'error' && currentCacheProgress.errorMessage && (
                    <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-300">
                      {currentCacheProgress.errorMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Narration Mode ({activeLangName} Studio Audio)
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'both',
                      label: 'Full Chapter + Deep Explanation',
                      hint: 'Plays top headline, summary, every clause & deep explanation',
                    },
                    {
                      id: 'text',
                      label: 'Headline + Original Text',
                      hint: 'Reads chapter headline, summary & constitutional clauses',
                    },
                    {
                      id: 'explanation',
                      label: 'Headline + Deep Explanation',
                      hint: 'Focused commentary & real-world context from the top',
                    },
                  ] as { id: AudioMode; label: string; hint: string }[]
                ).map((modeOpt) => {
                  const active = preferences.audioMode === modeOpt.id;
                  return (
                    <button
                      key={modeOpt.id}
                      type="button"
                      onClick={() => onUpdatePreferences({ audioMode: modeOpt.id })}
                      className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                        active
                          ? 'border-[#2563EB] bg-blue-50/80 dark:border-blue-500 dark:bg-blue-500/15'
                          : 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-[#0D111A]'
                      }`}
                    >
                      <p className="text-xs font-bold text-slate-950 dark:text-white">
                        {modeOpt.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {modeOpt.hint}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-3.5 py-2.5 text-xs text-slate-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-slate-200">
              <p className="font-bold text-slate-900 dark:text-white">
                Native 1-to-1 Uploaded Audio ({activeLangName})
              </p>
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                Plays manually uploaded audio files attached directly to each chapter, article, section, or topic in Books &amp; Structures CMS.
              </p>
            </div>

            {/* Granular Chapter-Specific Playback Speed (0.5x – 2.0x) */}
            <div
              aria-label="Chapter playback speed controls"
              className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0D111A]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Gauge className="h-4 w-4 shrink-0 text-[#2563EB] dark:text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">
                      Chapter Playback Speed
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {localizeStructuralLabel(activeChapter.number, lang)} ·{' '}
                      {getLocalizedText(activeChapter.title, lang)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    data-chapter-speed-scope={resolvedChapterSpeed.isChapterOverride ? 'chapter' : 'global'}
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${
                      resolvedChapterSpeed.isChapterOverride
                        ? 'bg-blue-500/15 text-[#2563EB] dark:bg-blue-500/20 dark:text-blue-300'
                        : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {resolvedChapterSpeed.isChapterOverride ? 'Chapter Only' : 'Global Default'}
                  </span>
                  <span
                    data-chapter-speed-value={resolvedChapterSpeed.effectiveSpeed.toFixed(2)}
                    className="rounded-lg bg-[#0C1018] px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums text-white dark:bg-[#2563EB]"
                  >
                    {formatAudioSpeedLabel(resolvedChapterSpeed.effectiveSpeed)}
                  </span>
                </div>
              </div>

              {/* Fine-Grained 0.05x Stepper + Range Slider (0.5x to 2.0x) */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={resolvedChapterSpeed.effectiveSpeed <= MIN_CHAPTER_AUDIO_SPEED}
                  onClick={() =>
                    handleChangeCurrentChapterSpeed(
                      stepChapterAudioSpeed(resolvedChapterSpeed.effectiveSpeed, -1)
                    )
                  }
                  aria-label="Decrease chapter playback speed"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={MIN_CHAPTER_AUDIO_SPEED}
                    max={MAX_CHAPTER_AUDIO_SPEED}
                    step={CHAPTER_AUDIO_SPEED_STEP}
                    value={resolvedChapterSpeed.effectiveSpeed}
                    onChange={(e) => handleChangeCurrentChapterSpeed(Number(e.target.value))}
                    aria-label="Chapter playback speed"
                    aria-valuemin={MIN_CHAPTER_AUDIO_SPEED}
                    aria-valuemax={MAX_CHAPTER_AUDIO_SPEED}
                    aria-valuenow={resolvedChapterSpeed.effectiveSpeed}
                    aria-valuetext={formatAudioSpeedLabel(resolvedChapterSpeed.effectiveSpeed)}
                    className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#2563EB] dark:bg-slate-700"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] font-semibold text-slate-400">
                    <span>0.5x</span>
                    <span>1.0x</span>
                    <span>1.5x</span>
                    <span>2.0x</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={resolvedChapterSpeed.effectiveSpeed >= MAX_CHAPTER_AUDIO_SPEED}
                  onClick={() =>
                    handleChangeCurrentChapterSpeed(
                      stepChapterAudioSpeed(resolvedChapterSpeed.effectiveSpeed, 1)
                    )
                  }
                  aria-label="Increase chapter playback speed"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Granular Quick Presets (0.5x to 2.0x) */}
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                {CHAPTER_SPEED_PRESETS.map((spd) => {
                  const isActive = Math.abs(resolvedChapterSpeed.effectiveSpeed - spd) < 0.001;
                  return (
                    <button
                      key={spd}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleChangeCurrentChapterSpeed(spd)}
                      className={`h-8 rounded-xl font-mono text-xs font-bold tabular-nums transition cursor-pointer ${
                        isActive
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200'
                      }`}
                    >
                      {formatAudioSpeedLabel(spd)}
                    </button>
                  );
                })}
              </div>

              {/* Scope Footer: Reset Chapter Override vs Global Setting */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2.5 text-[11px] dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400">
                  Global default:{' '}
                  <strong className="font-mono text-slate-700 dark:text-slate-200">
                    {formatAudioSpeedLabel(resolvedChapterSpeed.globalSpeed)}
                  </strong>
                  {!resolvedChapterSpeed.isChapterOverride && ' · Changes apply only to this chapter'}
                </span>

                {resolvedChapterSpeed.isChapterOverride && (
                  <div className="flex flex-wrap items-center gap-2">
                    {onResetChapterAudioSpeed && (
                      <button
                        type="button"
                        onClick={() => onResetChapterAudioSpeed(activeBook.id, activeChapter.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#121620] dark:text-slate-200 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset to Global ({formatAudioSpeedLabel(resolvedChapterSpeed.globalSpeed)})</span>
                      </button>
                    )}
                    {Math.abs(resolvedChapterSpeed.effectiveSpeed - resolvedChapterSpeed.globalSpeed) >=
                      0.001 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ audioSpeed: resolvedChapterSpeed.effectiveSpeed })
                        }
                        className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400 cursor-pointer"
                      >
                        Save as Global
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Book & Unit Picker Drawer (opened from floating bottom headline bar) */}
      {pickerOpen && (
        <section
          aria-label="Choose Book and Unit"
          className="rounded-[24px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#121620]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <h2 className="font-display text-sm font-bold text-slate-950 dark:text-white">
              Switch Book or Unit
            </h2>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Close book and unit selector"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Book
              <select
                aria-label="Select book"
                value={activeBook.id}
                onChange={(e) => {
                  const nextBook = books.find((b) => b.id === e.target.value);
                  if (nextBook?.chapters[0]) {
                    setFocusedClauseId(null);
                    onSelectBookChapter(nextBook.id, nextBook.chapters[0].id);
                  }
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-white cursor-pointer"
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortTitle}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              Chapter / Unit
              <select
                aria-label="Select chapter"
                value={activeChapter.id}
                onChange={(e) => {
                  setFocusedClauseId(null);
                  onSelectBookChapter(activeBook.id, e.target.value);
                  setPickerOpen(false);
                }}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
              >
                {activeBook.chapters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.number} · {getLocalizedText(ch.title, lang)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}

      {/* Main Reading Canvas */}
      <article
        className={`no-print-in-chapter mx-auto min-w-0 max-w-4xl rounded-[26px] border p-4 shadow-sm transition-colors sm:p-8 lg:p-10 ${READER_SURFACE[effectiveTheme]}`}
      >
        {/* Chapter Header — Narrated first in the sequential chapter queue */}
        <header
          id={`reader-chapter-header-${activeChapter.id}`}
          data-speaking-header={isHeaderSpeaking ? 'true' : 'false'}
          className={`rounded-2xl border-b pb-5 transition-all ${
            isHeaderSpeaking
              ? 'border-blue-500/40 bg-blue-500/[0.06] p-4 ring-2 ring-[#2563EB] shadow-sm dark:bg-blue-500/10'
              : 'border-slate-200/70 dark:border-slate-800/80'
          }`}
          dir={rtl ? 'rtl' : 'ltr'}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="break-words font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
              {getLocalizedText(activeBook.title, lang)} · {localizeStructuralLabel(activeChapter.number, lang)} ·{' '}
              {activeChapter.estimatedMinutes} min audio
            </p>
            <button
              type="button"
              onClick={() => {
                if (isHeaderSpeaking) {
                  onTogglePlayPause();
                } else {
                  onPlayChapterAudio(activeBook.id, activeChapter.id, 0, true);
                }
              }}
              aria-label={`Play ${getLocalizedText(activeChapter.title, lang)} from top`}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-bold transition cursor-pointer ${
                isHeaderSpeaking
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'border border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300'
              }`}
            >
              {isHeaderSpeaking && isCurrentChapterLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isHeaderSpeaking ? (
                <Pause className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              <span>{isHeaderSpeaking ? (lang === 'te' ? 'వినిపిస్తోంది' : 'Speaking') : lang === 'te' ? 'పైనుండి వినండి' : 'Listen from Top'}</span>
            </button>
          </div>
          <h1 className="mt-1.5 break-words font-display text-xl font-bold tracking-tight sm:text-3xl">
            {getLocalizedText(activeChapter.title, lang)}
          </h1>
          <p className="mt-2 break-words text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {getLocalizedText(activeChapter.summary, lang)}
          </p>

          {/* Chapter Study Actions: Expandable Glossary & Print/PDF Export */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveGlossaryTerm(null);
                  setGlossaryFocusedTermId(null);
                  setIsGlossaryOverlayOpen(true);
                }}
                aria-label="Open expandable legal glossary"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 text-xs font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700/90 dark:bg-[#141926] dark:text-slate-100 dark:hover:border-blue-400 cursor-pointer whitespace-nowrap"
              >
                <BookMarked className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>
                  Glossary
                  {chapterGlossaryMatches.length > 0
                    ? ` · ${chapterGlossaryMatches.length} terms`
                    : glossaryTerms.length > 0
                      ? ` · ${glossaryTerms.length}`
                      : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsExportModalOpen(true)}
                aria-label="Print or export chapter as PDF"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 text-xs font-bold text-slate-800 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700/90 dark:bg-[#141926] dark:text-slate-100 dark:hover:border-blue-400 cursor-pointer whitespace-nowrap"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                <span>Print / PDF</span>
              </button>
            </div>

            {chapterGlossaryMatches.length > 0 && glossaryHighlightsEnabled && (
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Tap underlined legal terms for simple definitions
              </p>
            )}
          </div>

          {(currentCachedEntry || isOffline) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {currentCachedEntry && (
                <span
                  data-offline-cached="true"
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/12 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <HardDrive className="h-3 w-3" />
                  Offline Ready · {formatBytes(currentCachedEntry.totalBytes)}
                </span>
              )}
              {isOffline && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 dark:text-amber-200">
                  <WifiOff className="h-3 w-3" />
                  Offline Mode
                </span>
              )}
            </div>
          )}
        </header>

        {/* Clause Stream */}
        <div className="mt-5 space-y-4">
          {visibleClauses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
              No clauses match &ldquo;{chapterQuery}&rdquo; in this chapter.
            </div>
          ) : (
            visibleClauses.map((clause) => {
              const originalIndex = activeChapter.clauses.findIndex((c) => c.id === clause.id);
              const clauseKey = getClauseKey(activeBook.id, activeChapter.id, clause.id);
              const highlight = highlights[clauseKey];
              const isBookmarked = Boolean(bookmarks[clauseKey]);
              const clauseNotes = notes.filter((n) => n.clauseKey === clauseKey);
              const isFocused = focusedClauseId === clause.id;
              const isSpeaking = Boolean(isCurrentChapterActive && activeAudioClauseId === clause.id);
              const isHeadlineSpeaking = Boolean(
                isSpeaking && activeAudioSegment?.kind === 'headline'
              );
              const isTextSpeaking = Boolean(isSpeaking && activeAudioSegment?.kind === 'text');
              const isExplanationSpeaking = Boolean(
                isSpeaking && activeAudioSegment?.kind === 'explanation'
              );
              const highlightSwatch = highlight
                ? HIGHLIGHT_SWATCHES.find((s) => s.color === highlight.color)
                : undefined;

              return (
                <div
                  key={clause.id}
                  className={`min-w-0 rounded-[22px] p-4 transition-all sm:p-5 ${
                    highlightSwatch ? highlightSwatch.cardBg : 'hover:bg-slate-500/[0.04]'
                  } ${
                    isSpeaking
                      ? 'ring-2 ring-[#2563EB] shadow-md shadow-blue-600/10'
                      : isFocused
                        ? 'ring-1 ring-blue-500/40'
                        : 'ring-1 ring-slate-200/60 dark:ring-slate-800/70'
                  }`}
                >
                  {/* Clause Meta / Headline Top Row */}
                  <div
                    id={`reader-clause-headline-${clause.id}`}
                    data-speaking-headline={isHeadlineSpeaking ? 'true' : 'false'}
                    className={`flex items-start justify-between gap-2 rounded-xl transition-all ${
                      isHeadlineSpeaking
                        ? 'bg-blue-500/10 px-2.5 py-2 ring-1 ring-blue-500/40 dark:bg-blue-500/15'
                        : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenClauseStudio(clause)}
                      className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left cursor-pointer"
                    >
                      <span className="shrink-0 font-mono text-xs font-bold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">
                        {localizeStructuralLabel(clause.number, lang)}
                      </span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="min-w-0 break-words font-display text-sm font-bold">
                        {getLocalizedText(clause.principle, lang)}
                      </span>
                      {isHeadlineSpeaking && (
                        <span className="font-mono text-[10px] font-bold uppercase text-[#2563EB] dark:text-blue-300">
                          · {getNarrationStageLabel('headline', lang)}
                        </span>
                      )}
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      {isSpeaking && (
                        <span className="mr-1 flex h-3.5 items-end gap-[2px]" aria-label="Now speaking">
                          <span className="audio-bar h-3.5 w-[2.5px] rounded-full bg-[#2563EB]" />
                          <span className="audio-bar h-3.5 w-[2.5px] rounded-full bg-amber-500" />
                          <span className="audio-bar h-3.5 w-[2.5px] rounded-full bg-[#2563EB]" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onPlayChapterAudio(
                            activeBook.id,
                            activeChapter.id,
                            Math.max(0, originalIndex),
                            false
                          )
                        }
                        aria-label={`Listen to ${clause.number}`}
                        className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-500/10 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenShareClause(clause)}
                        aria-label={`Share ${clause.number} quote card`}
                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition cursor-pointer ${
                          highlight
                            ? 'bg-blue-500/12 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400'
                            : 'text-slate-500 hover:bg-blue-500/10 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400'
                        }`}
                      >
                        <Share2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleBookmark(activeBook.id, activeChapter.id, clause.id)}
                        aria-label={
                          isBookmarked
                            ? `Remove bookmark on ${clause.number}`
                            : `Bookmark ${clause.number}`
                        }
                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition cursor-pointer ${
                          isBookmarked
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 hover:bg-slate-500/10 dark:text-slate-400'
                        }`}
                      >
                        <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Legal / Historical Clause Content */}
                  <div
                    id={`reader-clause-text-${clause.id}`}
                    data-speaking-text={isTextSpeaking ? 'true' : 'false'}
                    onClick={() => handleOpenClauseStudio(clause)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenClauseStudio(clause);
                      }
                    }}
                    className={`mt-3 cursor-pointer rounded-xl transition-all ${
                      isTextSpeaking
                        ? 'border-l-[3px] border-[#2563EB] bg-blue-500/[0.06] py-2 pl-3 pr-2 dark:bg-blue-500/10'
                        : ''
                    } ${preferences.showParallelLanguage ? 'grid gap-4 md:grid-cols-2' : ''}`}
                  >
                    <p
                      dir={rtl ? 'rtl' : 'ltr'}
                      className={`break-words ${FONT_FACE_CLASS[preferences.fontFace]} ${FONT_SIZE_CLASS[preferences.fontSize]} tracking-[-0.005em]`}
                    >
                      <GlossaryHighlightedText
                        text={getLocalizedText(clause.text, lang)}
                        terms={glossaryTerms}
                        enabled={glossaryHighlightsEnabled}
                        activeTermId={activeGlossaryTerm?.id ?? null}
                        onSelectTerm={(term) => setActiveGlossaryTerm(term)}
                      />
                    </p>

                    {preferences.showParallelLanguage && (
                      <div
                        dir={compareRtl ? 'rtl' : 'ltr'}
                        className="min-w-0 rounded-2xl border border-slate-200/70 bg-slate-500/[0.04] p-3.5 dark:border-slate-800"
                      >
                        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-blue-600 dark:text-blue-400">
                          {compareLangName}
                        </p>
                        <p className="break-words font-reading text-sm leading-relaxed opacity-90">
                          {getLocalizedText(clause.text, compareLang)}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Inline Plain-Language / Deep Explanation */}
                  {(preferences.showInlineExplanations || isFocused || isExplanationSpeaking) && (
                    <div
                      id={`reader-clause-explanation-${clause.id}`}
                      dir={rtl ? 'rtl' : 'ltr'}
                      data-speaking-explanation={isExplanationSpeaking ? 'true' : 'false'}
                      className={`mt-4 rounded-2xl p-3.5 transition-all ${
                        isExplanationSpeaking
                          ? 'bg-amber-500/12 ring-2 ring-amber-500/70 dark:bg-amber-500/15'
                          : 'bg-slate-900/[0.04] dark:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                        <span className="flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                          <span>Deep Explanation ({activeLangName})</span>
                        </span>
                        {isExplanationSpeaking && (
                          <span className="font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300">
                            {lang === 'te' ? 'వివరణ వినిపిస్తోంది' : 'Reading Explanation'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 break-words font-reading text-sm leading-relaxed opacity-95">
                        <GlossaryHighlightedText
                          text={getLocalizedText(clause.explanation, lang)}
                          terms={glossaryTerms}
                          enabled={glossaryHighlightsEnabled}
                          activeTermId={activeGlossaryTerm?.id ?? null}
                          onSelectTerm={(term) => setActiveGlossaryTerm(term)}
                        />
                      </p>
                      <p className="mt-2 break-words text-xs leading-relaxed opacity-75">
                        <span className="font-bold">
                          {lang === 'te' ? 'నిజ జీవిత ఉదాహరణ: ' : 'Real-World Context: '}
                        </span>
                        {getLocalizedText(clause.realWorldExample, lang)}
                      </p>
                    </div>
                  )}

                  {/* Existing Study Notes Preview */}
                  {clauseNotes.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {clauseNotes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-blue-200/70 bg-blue-50/60 px-3.5 py-2.5 text-xs dark:border-blue-500/25 dark:bg-blue-500/10"
                        >
                          <p className="min-w-0 flex-1 break-words leading-relaxed text-slate-800 dark:text-blue-100">
                            {note.content}
                          </p>
                          <button
                            type="button"
                            onClick={() => onDeleteNote(note.id)}
                            aria-label="Delete study note"
                            className="shrink-0 text-slate-400 hover:text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Interactive Clause Action Drawer */}
                  {isFocused && (
                    <div className="mt-4 space-y-3 border-t border-slate-200/70 pt-3.5 dark:border-slate-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-60">
                            Highlight
                          </span>
                          {HIGHLIGHT_SWATCHES.map((swatch) => {
                            const active = highlight?.color === swatch.color;
                            return (
                              <button
                                key={swatch.color}
                                type="button"
                                onClick={() =>
                                  onToggleHighlight(
                                    activeBook.id,
                                    activeChapter.id,
                                    clause.id,
                                    swatch.color
                                  )
                                }
                                aria-label={`Highlight ${swatch.label}`}
                                className={`h-7 w-7 rounded-full transition cursor-pointer ${swatch.dot} ${
                                  active
                                    ? 'scale-110 ring-2 ring-slate-900 ring-offset-2 dark:ring-white'
                                    : 'opacity-80 hover:opacity-100'
                                }`}
                              />
                            );
                          })}
                          {highlight && (
                            <button
                              type="button"
                              onClick={() =>
                                onToggleHighlight(activeBook.id, activeChapter.id, clause.id, null)
                              }
                              className="text-xs font-semibold opacity-70 hover:opacity-100 cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenShareClause(clause)}
                            aria-label={`Share quote card for ${clause.number}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#2563EB] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#1D4ED8] cursor-pointer"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            <span>Share Card</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCopyClause(clause)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold transition hover:border-blue-500 dark:border-slate-700 cursor-pointer"
                          >
                            {copiedClauseId === clause.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFocusedClauseId(null)}
                            aria-label="Close clause tools"
                            className="flex h-8 w-8 items-center justify-center rounded-xl opacity-60 hover:opacity-100 cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Add Private Study Note */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!noteDraft.trim()) return;
                          onSaveNote(
                            activeBook.id,
                            activeChapter.id,
                            clause.id,
                            noteDraft,
                            editingNoteId
                          );
                          setNoteDraft('');
                          setEditingNoteId(undefined);
                        }}
                        className="flex gap-2"
                      >
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add a personal study note…"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-transparent px-3 text-xs outline-none focus:border-blue-600 dark:border-slate-700"
                        />
                        <button
                          type="submit"
                          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#2563EB] px-3.5 text-xs font-bold text-white transition hover:bg-[#1D4ED8] cursor-pointer"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                          Save
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Post-Chapter Completion & Quiz Mode CTA */}
        {onCompleteChapterAndStartQuiz && (
          <div
            data-testid="chapter-completion-quiz-card"
            className="mt-8 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-[#121620] sm:p-5"
          >
            {(() => {
              const isChapterDone = completedChapterKeys.includes(
                `${activeBook.id}::${activeChapter.id}`
              );
              return (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isChapterDone
                          ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                          : 'bg-blue-50 text-[#2563EB] dark:bg-blue-500/15 dark:text-blue-400'
                      }`}
                    >
                      {isChapterDone ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <GraduationCap className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {isChapterDone
                          ? 'Chapter Completed · Knowledge Check Ready'
                          : 'Finished Reading This Chapter?'}
                      </p>
                      <h3 className="mt-0.5 font-display text-sm font-bold text-slate-950 dark:text-white sm:text-base">
                        Test your recall with a multiple-choice quiz
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        Questions are generated from Library flashcards related to{' '}
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {getLocalizedText(activeChapter.title, lang)}
                        </span>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onCompleteChapterAndStartQuiz(activeBook.id, activeChapter.id)
                      }
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#0C1018] px-4 text-xs font-bold text-white transition hover:bg-[#2563EB] dark:bg-[#2563EB] dark:hover:bg-blue-500 cursor-pointer"
                    >
                      <GraduationCap className="h-4 w-4" />
                      <span>
                        {isChapterDone ? 'Retake Chapter Quiz' : 'Finish Chapter & Take Quiz'}
                      </span>
                    </button>

                    {nextChapter && (
                      <button
                        type="button"
                        onClick={() => onSelectBookChapter(activeBook.id, nextChapter.id)}
                        className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
                      >
                        <span>Next Chapter</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </article>

      {/* Floating Read Playback & Title Bar: stays visible on scroll and glides down to dock cleanly at the bottom when the mobile nav hides */}
      <div
        role="region"
        aria-label="Chapter playback and navigation bar"
        data-docked-bottom={isChromeHidden ? 'true' : 'false'}
        className={`fixed inset-x-3 bottom-[72px] z-30 mx-auto max-w-md transition-transform duration-300 ease-out will-change-transform lg:bottom-4 lg:max-w-xl ${
          isChromeHidden ? 'translate-y-[62px] lg:translate-y-0' : 'translate-y-0'
        }`}
      >
        <div className="overflow-hidden rounded-[20px] border border-slate-200/90 bg-white/96 shadow-[0_10px_30px_rgba(12,16,24,0.16)] backdrop-blur-xl dark:border-slate-700/90 dark:bg-[#121620]/96 dark:shadow-[0_12px_34px_rgba(0,0,0,0.55)]">
          {/* Hairline Audio Progress Indicator when active */}
          {isCurrentChapterLoaded && (
            <div className="h-0.5 w-full bg-slate-200/70 dark:bg-slate-800">
              <div
                className="h-full bg-[#2563EB] transition-all duration-300"
                style={{ width: `${isCurrentChapterLoading ? 28 : Math.max(4, audioProgressPct)}%` }}
              />
            </div>
          )}

          {isCurrentChapterLoaded && audioError && (
            <div className="border-b border-rose-200/80 bg-rose-50/90 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200">
              {audioError}
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2 py-2">
            {/* 1. Play / Pause Button */}
            <button
              type="button"
              onClick={handleFloatingPlayClick}
              aria-label={isCurrentChapterPlaying ? 'Pause chapter audio' : 'Play chapter audio'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB] text-white shadow-sm shadow-blue-600/30 transition hover:bg-[#1D4ED8] cursor-pointer"
            >
              {isCurrentChapterLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCurrentChapterPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px] fill-current" />
              )}
            </button>

            {/* 2. Backward Unit / Segment Button */}
            <button
              type="button"
              disabled={!canStepPrevSegment && !prevChapter}
              onClick={() => {
                if (canStepPrevSegment && onSkipAudioSegment) {
                  onSkipAudioSegment(-1);
                } else if (prevChapter) {
                  onSelectBookChapter(activeBook.id, prevChapter.id);
                }
              }}
              aria-label={canStepPrevSegment ? 'Previous audio section' : 'Previous chapter'}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-35 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* 3. Middle Content Headline (Book / Unit Name — opens picker on tap) */}
            <button
              type="button"
              onClick={() => setPickerOpen((prev) => !prev)}
              aria-label="Choose book or unit"
              aria-expanded={pickerOpen}
              className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-2 py-1 text-center transition hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer"
            >
              <span className="flex max-w-full items-center gap-1 font-display text-xs font-bold text-slate-950 dark:text-white">
                <span className="truncate">{getLocalizedText(activeBook.title, lang) || activeBook.shortTitle}</span>
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
              </span>
              <span
                data-queue-position={
                  isCurrentChapterLoaded && chapterQueueItems.length > 0
                    ? `${audioQueueIndex + 1}/${chapterQueueItems.length}`
                    : undefined
                }
                className="w-full truncate font-mono text-[10px] font-semibold text-blue-600 dark:text-blue-400"
              >
                {isCurrentChapterLoading && activeAudioSegment
                  ? `${audioQueueIndex + 1}/${chapterQueueItems.length} · ${
                      lang === 'te'
                        ? `${activeLangName} ఆడియో సిద్ధమవుతోంది…`
                        : `Preparing ${getNarrationStageLabel(activeAudioSegment.kind, lang)}…`
                    }`
                  : isCurrentChapterLoaded && activeAudioSegment
                    ? `${audioQueueIndex + 1}/${chapterQueueItems.length} · ${activeAudioSegment.clauseNumber} · ${getNarrationStageLabel(activeAudioSegment.kind, lang)}${
                        resolvedChapterSpeed.isChapterOverride
                          ? ` · ${formatAudioSpeedLabel(resolvedChapterSpeed.effectiveSpeed)}`
                          : ''
                      }`
                    : `${localizeStructuralLabel(activeChapter.number, lang)} · ${getLocalizedText(activeChapter.title, lang)}${
                        resolvedChapterSpeed.isChapterOverride
                          ? ` · ${formatAudioSpeedLabel(resolvedChapterSpeed.effectiveSpeed)}`
                          : ''
                      }`}
              </span>
            </button>

            {/* 4. Forward Unit / Segment Button */}
            <button
              type="button"
              disabled={!canStepNextSegment && !nextChapter}
              onClick={() => {
                if (canStepNextSegment && onSkipAudioSegment) {
                  onSkipAudioSegment(1);
                } else if (nextChapter) {
                  onSelectBookChapter(activeBook.id, nextChapter.id);
                }
              }}
              aria-label={canStepNextSegment ? 'Next audio section' : 'Next chapter'}
              className="flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-blue-400 hover:text-blue-700 disabled:opacity-35 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-200 cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {/* Social Media Quote Image Card Share Modal */}
      <ClauseShareModal
        isOpen={Boolean(shareTarget)}
        book={activeBook}
        chapter={activeChapter}
        clause={shareTarget?.clause ?? null}
        language={lang}
        highlightColor={
          shareTarget
            ? highlights[getClauseKey(activeBook.id, activeChapter.id, shareTarget.clause.id)]?.color
            : undefined
        }
        initialQuoteExcerpt={shareTarget?.excerpt ?? ''}
        onClose={() => setShareTarget(null)}
      />

      {/* Simple Legal Definition Popup (triggered by clicking any highlighted legal term) */}
      <GlossaryTermPopup
        term={activeGlossaryTerm}
        onClose={() => setActiveGlossaryTerm(null)}
        onOpenFullGlossary={(termId) => {
          setActiveGlossaryTerm(null);
          setGlossaryFocusedTermId(termId);
          setIsGlossaryOverlayOpen(true);
        }}
      />

      {/* Expandable Legal Glossary Overlay (powered by backend Master Book metadata) */}
      <ExpandableGlossaryOverlay
        isOpen={isGlossaryOverlayOpen}
        onClose={() => setIsGlossaryOverlayOpen(false)}
        chapterTitle={`${localizeStructuralLabel(activeChapter.number, lang)} · ${getLocalizedText(activeChapter.title, lang)}`}
        matchedMasterBookTitle={matchedMasterBook?.canonicalTitle ?? null}
        matchedMasterBookJurisdiction={matchedMasterBook?.jurisdiction ?? null}
        allTerms={glossaryTerms}
        chapterMatches={chapterGlossaryMatches}
        highlightsEnabled={glossaryHighlightsEnabled}
        onToggleHighlights={setGlossaryHighlightsEnabled}
        focusedTermId={glossaryFocusedTermId}
        loading={glossaryLoading}
      />

      {/* Print / Styled PDF Export Modal */}
      <ChapterExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        book={activeBook}
        chapter={activeChapter}
        language={lang}
        languageName={activeLangName}
        compareLanguage={compareLang}
        compareLanguageName={compareLangName}
        notes={notes}
        defaultIncludeExplanations={preferences.showInlineExplanations}
        defaultIncludeParallelLanguage={preferences.showParallelLanguage}
        onRequestPrint={handleRequestPrintChapter}
      />

      {/* Print-Only Formatted Legal Document Sheet (shown exclusively during @media print) */}
      {printSheetDoc && (
        <div className="chapter-print-sheet" aria-hidden="true">
          <div className="border-t-[3px] border-[#2563EB] pt-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#2563EB]">
              {printSheetDoc.jurisdiction} · {printSheetDoc.year} · {printSheetDoc.languageName}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{printSheetDoc.bookTitle}</p>
            <h1 className="mt-1.5 font-display text-[22px] font-bold text-[#0C1018]">
              {printSheetDoc.chapterNumberLabel}: {printSheetDoc.chapterTitle}
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {printSheetDoc.chapterSummary}
            </p>
          </div>

          <hr className="my-4 border-slate-300" />

          {printSheetDoc.clauses.map((clause) => (
            <div
              key={clause.id}
              className="chapter-print-clause mb-5 border-b border-slate-200 pb-3.5"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#2563EB]">
                {clause.numberLabel}
              </p>
              <h2 className="mt-1 font-display text-[15px] font-bold text-slate-900">
                {clause.principle}
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-[1.65] text-slate-800">
                {clause.legalText}
              </p>

              {clause.parallelText && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="font-mono text-[9px] font-bold uppercase text-[#2563EB]">
                    Parallel ({clause.parallelLanguageName})
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-700">
                    {clause.parallelText}
                  </p>
                </div>
              )}

              {clause.explanation && (
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="font-mono text-[9px] font-bold uppercase text-amber-700">
                    Deep Explanation
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-700">
                    {clause.explanation}
                  </p>
                </div>
              )}

              {clause.realWorldExample && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                  <strong className="font-semibold text-slate-800">Real-World Context: </strong>
                  {clause.realWorldExample}
                </p>
              )}

              {clause.studyNotes.length > 0 && (
                <div className="mt-1.5 text-[11px] text-blue-900">
                  <strong className="font-semibold">Study Notes:</strong>
                  <ul className="mt-1 list-disc pl-4">
                    {clause.studyNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          <p className="mt-3 text-[10px] text-slate-500">
            The Constitution &amp; Law · {printSheetDoc.bookShortTitle} · Exported{' '}
            {printSheetDoc.generatedAtDisplay}
          </p>
        </div>
      )}
    </div>
  );
}
