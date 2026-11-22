import {
  ArrowUpRight,
  BookOpen,
  Clock,
  FileText,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { useMemo } from 'react';
import type { LanguageCode, LawBook } from '../types/library';
import { getLocalizedText } from '../utils/libraryLogic';
import {
  TRENDING_LEGAL_TOPICS,
  filterTrendingTopics,
  getLibraryQuickMatches,
  type LibraryQuickMatch,
} from '../utils/librarySearchOverlay';

interface LibrarySearchOverlayProps {
  isOpen: boolean;
  query: string;
  language: LanguageCode;
  books: LawBook[];
  recentSearches: string[];
  onSelectQuery: (query: string) => void;
  onRemoveRecent: (query: string) => void;
  onClearRecent: () => void;
  onOpenMatch?: (match: LibraryQuickMatch) => void;
  onClose: () => void;
}

export function LibrarySearchOverlay({
  isOpen,
  query,
  language,
  books,
  recentSearches,
  onSelectQuery,
  onRemoveRecent,
  onClearRecent,
  onOpenMatch,
  onClose,
}: LibrarySearchOverlayProps) {
  const trimmedQuery = query.trim();

  const isExactTopicOrRecent = useMemo(() => {
    if (!trimmedQuery) return false;
    const lower = trimmedQuery.toLowerCase();
    return (
      recentSearches.some((term) => term.toLowerCase() === lower) ||
      TRENDING_LEGAL_TOPICS.some((t) => t.query.toLowerCase() === lower)
    );
  }, [trimmedQuery, recentSearches]);

  const displayedRecent = useMemo(() => {
    if (!trimmedQuery || isExactTopicOrRecent) return recentSearches;
    const lower = trimmedQuery.toLowerCase();
    const matched = recentSearches.filter((term) => term.toLowerCase().includes(lower));
    return matched.length > 0 ? matched : recentSearches;
  }, [recentSearches, trimmedQuery, isExactTopicOrRecent]);

  const displayedTrending = useMemo(() => {
    if (!trimmedQuery || isExactTopicOrRecent) return [...TRENDING_LEGAL_TOPICS];
    return filterTrendingTopics(TRENDING_LEGAL_TOPICS, trimmedQuery, language);
  }, [trimmedQuery, language, isExactTopicOrRecent]);

  const quickMatches = useMemo(
    () => getLibraryQuickMatches(books, trimmedQuery, language, 4),
    [books, trimmedQuery, language]
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Search Overlay Sheet */}
      <div
        role="dialog"
        aria-label="Library search overlay"
        className="fixed inset-x-3 top-16 z-50 mx-auto max-h-[calc(100vh-5.5rem)] max-w-2xl overflow-y-auto rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(12,16,24,0.18)] dark:border-slate-800 dark:bg-[#121620] dark:shadow-[0_24px_60px_rgba(0,0,0,0.65)] lg:top-20"
      >
        {/* Overlay Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#121620]/95 sm:px-5">
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-slate-950 dark:text-white">
              {trimmedQuery ? 'Instant Library Navigation' : 'Explore the Legal Library'}
            </p>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {trimmedQuery
                ? `Showing quick matches for "${trimmedQuery}"`
                : 'Jump to constitutional articles, doctrines, or recent queries'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search overlay"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {/* Live Quick Matches Section (shown when typing) */}
          {trimmedQuery.length > 0 && (
            <section aria-label="Quick search matches" className="p-4 sm:p-5">
              <button
                type="button"
                onClick={() => onSelectQuery(trimmedQuery)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl bg-[#0C1018] px-4 py-2.5 text-left text-xs font-bold text-white transition hover:bg-[#2563EB] dark:bg-[#2563EB] dark:hover:bg-blue-500 cursor-pointer"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="truncate">Search Library for &ldquo;{trimmedQuery}&rdquo;</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] opacity-80">Enter</span>
              </button>

              {quickMatches.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="px-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Direct Matches · {quickMatches.length}
                  </p>
                  {quickMatches.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      onClick={() => {
                        if (onOpenMatch) {
                          onOpenMatch(match);
                        } else {
                          onSelectQuery(trimmedQuery);
                        }
                      }}
                      className="group flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-blue-50 group-hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-500/20 dark:group-hover:text-blue-300">
                          {match.type === 'clause' ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-950 dark:text-white">
                            {match.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {match.subtitle} · {match.meta}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 1: Recent Searches */}
          <section aria-labelledby="library-recent-searches-heading" className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h2
                  id="library-recent-searches-heading"
                  className="font-display text-sm font-bold text-slate-950 dark:text-white"
                >
                  Recent Searches
                </h2>
                {recentSearches.length > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    · {recentSearches.length}
                  </span>
                )}
              </div>

              {recentSearches.length > 0 && (
                <button
                  type="button"
                  onClick={onClearRecent}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            {displayedRecent.length === 0 ? (
              <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Your recent legal queries will appear here for one-tap access.
              </p>
            ) : (
              <ul className="mt-2.5 divide-y divide-slate-100 dark:divide-slate-800/70">
                {displayedRecent.map((term) => {
                  const isActive = trimmedQuery.toLowerCase() === term.toLowerCase();
                  return (
                    <li key={term} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectQuery(term)}
                        className={`group flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                          isActive
                            ? 'text-[#2563EB] dark:text-blue-400'
                            : 'text-slate-800 hover:bg-slate-50 hover:text-blue-700 dark:text-slate-200 dark:hover:bg-slate-800/60 dark:hover:text-blue-300'
                        }`}
                      >
                        <Clock
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive
                              ? 'text-[#2563EB] dark:text-blue-400'
                              : 'text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                          }`}
                        />
                        <span className="truncate">{term}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRecent(term)}
                        aria-label={`Remove "${term}" from recent searches`}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Section 2: Trending Legal Topics */}
          <section aria-labelledby="library-trending-topics-heading" className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#2563EB] dark:text-blue-400" />
                <h2
                  id="library-trending-topics-heading"
                  className="font-display text-sm font-bold text-slate-950 dark:text-white"
                >
                  Trending Legal Topics
                </h2>
              </div>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Popular in Library
              </span>
            </div>

            {displayedTrending.length === 0 ? (
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                No trending topics match &ldquo;{trimmedQuery}&rdquo;. Press Enter to search all
                books and flashcards.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {displayedTrending.map((topic, index) => {
                  const rank = String(index + 1).padStart(2, '0');
                  const isActive = trimmedQuery.toLowerCase() === topic.query.toLowerCase();
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => onSelectQuery(topic.query)}
                      className={`group flex min-h-[58px] items-start justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition cursor-pointer ${
                        isActive
                          ? 'border-blue-500 bg-blue-50/70 dark:border-blue-500/60 dark:bg-blue-500/15'
                          : 'border-slate-200/80 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-800 dark:bg-[#0D111A]/80 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10'
                      }`}
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span
                          className={`mt-0.5 shrink-0 font-mono text-[11px] font-bold tabular-nums ${
                            isActive
                              ? 'text-[#2563EB] dark:text-blue-400'
                              : 'text-slate-400 group-hover:text-[#2563EB] dark:text-slate-500 dark:group-hover:text-blue-400'
                          }`}
                        >
                          {rank}
                        </span>
                        <div className="min-w-0">
                          <p
                            className={`truncate text-xs font-bold ${
                              isActive
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-slate-950 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300'
                            }`}
                          >
                            {getLocalizedText(topic.label, language)}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {getLocalizedText(topic.domain, language)} · {topic.citation}
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                          isActive
                            ? 'text-[#2563EB] dark:text-blue-400'
                            : 'text-slate-400 group-hover:text-[#2563EB] dark:group-hover:text-blue-400'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
