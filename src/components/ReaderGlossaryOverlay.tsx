import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { OttGlossaryCategory, OttGlossaryTerm } from '../types/ott';
import {
  filterGlossaryTerms,
  getGlossaryCategories,
  type MatchedGlossaryTerm,
} from '../utils/legalGlossary';

interface GlossaryTermPopupProps {
  term: OttGlossaryTerm | null;
  onClose: () => void;
  onOpenFullGlossary: (termId: string) => void;
}

/**
 * Compact, plain-language legal definition popup displayed when a user taps a highlighted legal term.
 */
export function GlossaryTermPopup({
  term,
  onClose,
  onOpenFullGlossary,
}: GlossaryTermPopupProps) {
  useEffect(() => {
    if (!term) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [term, onClose]);

  if (!term) return null;

  return (
    <div
      role="dialog"
      aria-label={`Legal definition for ${term.term}`}
      data-testid="glossary-term-popup"
      className="fixed inset-x-3 bottom-[140px] z-50 mx-auto max-w-md rounded-[22px] border border-slate-200/95 bg-white p-4 shadow-[0_18px_50px_rgba(12,16,24,0.22)] dark:border-slate-700/90 dark:bg-[#141926] dark:shadow-[0_18px_50px_rgba(0,0,0,0.65)] lg:bottom-24 lg:left-auto lg:right-8 lg:mx-0 lg:w-[400px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            <span>{term.category}</span>
            {term.citation && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-500 dark:text-slate-400">{term.citation}</span>
              </>
            )}
          </div>
          <h3 className="mt-1 font-display text-base font-bold text-slate-950 dark:text-white">
            {term.term}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close definition popup"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
        {term.simpleDefinition}
      </p>

      {term.legalContext && (
        <p className="mt-2.5 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-[#0D111A] dark:text-slate-300">
          {term.legalContext}
        </p>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <p className="min-w-0 truncate text-[11px] text-slate-500 dark:text-slate-400">
          Master Book: <span className="font-semibold text-slate-700 dark:text-slate-200">{term.masterBookTitle}</span>
        </p>
        <button
          type="button"
          onClick={() => onOpenFullGlossary(term.id)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#0C1018] px-3 text-xs font-bold text-white transition hover:bg-[#2563EB] dark:bg-[#2563EB] dark:hover:bg-blue-500 cursor-pointer whitespace-nowrap"
        >
          <BookMarked className="h-3.5 w-3.5" />
          <span>Full Glossary</span>
        </button>
      </div>
    </div>
  );
}

interface ExpandableGlossaryOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  chapterTitle: string;
  matchedMasterBookTitle: string | null;
  matchedMasterBookJurisdiction: string | null;
  allTerms: OttGlossaryTerm[];
  chapterMatches: MatchedGlossaryTerm[];
  highlightsEnabled: boolean;
  onToggleHighlights: (enabled: boolean) => void;
  focusedTermId?: string | null;
  loading?: boolean;
}

/**
 * Expandable legal glossary overlay powered by backend Master Book metadata.
 * Allows toggling inline term highlights, switching between Chapter Terms and Full Master Glossary,
 * filtering by legal domain or keyword, and expanding plain-language definitions.
 */
export function ExpandableGlossaryOverlay({
  isOpen,
  onClose,
  chapterTitle,
  matchedMasterBookTitle,
  matchedMasterBookJurisdiction,
  allTerms,
  chapterMatches,
  highlightsEnabled,
  onToggleHighlights,
  focusedTermId = null,
  loading = false,
}: ExpandableGlossaryOverlayProps) {
  const [scope, setScope] = useState<'chapter' | 'all'>('chapter');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<OttGlossaryCategory | 'All'>('All');
  const [expandedTermId, setExpandedTermId] = useState<string | null>(focusedTermId);
  const [isExpandedTall, setIsExpandedTall] = useState(false);

  const chapterMatchMap = useMemo(() => {
    const map = new Map<string, MatchedGlossaryTerm>();
    for (const item of chapterMatches) {
      map.set(item.entry.id, item);
    }
    return map;
  }, [chapterMatches]);

  // If a specific term is opened from a popup, expand it and switch scope if needed
  useEffect(() => {
    if (!isOpen) return;
    if (focusedTermId) {
      setExpandedTermId(focusedTermId);
      if (!chapterMatchMap.has(focusedTermId)) {
        setScope('all');
      }
    } else if (chapterMatches.length === 0 && allTerms.length > 0) {
      setScope('all');
    } else if (chapterMatches.length > 0) {
      setScope('chapter');
      setExpandedTermId((prev) => prev ?? chapterMatches[0].entry.id);
    }
  }, [isOpen, focusedTermId, chapterMatches, allTerms.length, chapterMatchMap]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const baseTerms = useMemo(
    () => (scope === 'chapter' ? chapterMatches.map((m) => m.entry) : allTerms),
    [scope, chapterMatches, allTerms]
  );

  const categories = useMemo(() => getGlossaryCategories(baseTerms), [baseTerms]);

  const filteredTerms = useMemo(
    () => filterGlossaryTerms(baseTerms, searchQuery, selectedCategory),
    [baseTerms, searchQuery, selectedCategory]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Expandable Legal Glossary"
        data-testid="expandable-glossary-overlay"
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full flex-col overflow-hidden rounded-t-[26px] border border-slate-200/90 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-[#121620] sm:max-w-2xl sm:rounded-[26px] ${
          isExpandedTall ? 'h-[92vh] sm:h-[88vh]' : 'max-h-[82vh] sm:max-h-[78vh]'
        }`}
      >
        {/* Mobile Sheet Handle */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Overlay Header */}
        <div className="border-b border-slate-100 px-5 pb-4 pt-3 dark:border-slate-800 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-blue-600 dark:text-blue-400">
                  Master Book Glossary
                </span>
                {matchedMasterBookTitle && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{matchedMasterBookTitle}</span>
                  </>
                )}
                {matchedMasterBookJurisdiction && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline">
                      ·
                    </span>
                    <span className="hidden sm:inline">{matchedMasterBookJurisdiction}</span>
                  </>
                )}
              </div>
              <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                Legal Terms &amp; Plain Definitions
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                Reading: {chapterTitle}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsExpandedTall((prev) => !prev)}
                aria-label={isExpandedTall ? 'Collapse glossary panel' : 'Expand glossary panel'}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                {isExpandedTall ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close legal glossary"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Inline Term Highlighting Toggle & Scope Tabs */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Glossary scope"
              className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-[#0D111A]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={scope === 'chapter'}
                onClick={() => {
                  setScope('chapter');
                  setSelectedCategory('All');
                }}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  scope === 'chapter'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                In This Chapter ({chapterMatches.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === 'all'}
                onClick={() => {
                  setScope('all');
                  setSelectedCategory('All');
                }}
                className={`min-h-[36px] rounded-lg px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  scope === 'all'
                    ? 'bg-white text-slate-950 shadow-sm dark:bg-[#2563EB] dark:text-white'
                    : 'text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                Full Master Glossary ({allTerms.length})
              </button>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={highlightsEnabled}
              onClick={() => onToggleHighlights(!highlightsEnabled)}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                highlightsEnabled
                  ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/15 dark:text-blue-200'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-[#0D111A] dark:text-slate-300'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>Inline Highlights: {highlightsEnabled ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="mt-3 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search legal terms, doctrines, or articles…"
                aria-label="Search glossary terms"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:border-[#2563EB] focus:bg-white dark:border-slate-700 dark:bg-[#0D111A] dark:text-white"
              />
            </div>

            {categories.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className={`min-h-[32px] shrink-0 rounded-lg px-2.5 text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                    selectedCategory === 'All'
                      ? 'bg-[#0C1018] text-white dark:bg-slate-100 dark:text-slate-950'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-[#0D111A] dark:text-slate-300'
                  }`}
                >
                  All Domains
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[32px] shrink-0 rounded-lg px-2.5 text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 dark:bg-[#0D111A] dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Glossary Term List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              Loading glossary metadata from backend Master Books…
            </div>
          ) : filteredTerms.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center dark:border-slate-800">
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {scope === 'chapter' && !searchQuery
                  ? 'No glossary terms detected in this chapter’s current language.'
                  : 'No legal terms match your filter.'}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {scope === 'chapter'
                  ? 'Switch to Full Master Glossary to explore all curated legal definitions.'
                  : 'Try a different keyword or select All Domains.'}
              </p>
              {scope === 'chapter' && allTerms.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setScope('all');
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="mt-3 inline-flex h-9 items-center rounded-xl bg-[#2563EB] px-3.5 text-xs font-bold text-white hover:bg-[#1D4ED8] cursor-pointer"
                >
                  Browse Full Master Glossary ({allTerms.length})
                </button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/90">
              {filteredTerms.map((entry) => {
                const isExpanded = expandedTermId === entry.id;
                const matchInfo = chapterMatchMap.get(entry.id);
                return (
                  <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedTermId(isExpanded ? null : entry.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="font-display text-sm font-bold text-slate-950 dark:text-white">
                            {entry.term}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {entry.category}
                            {matchInfo ? ` · ${matchInfo.occurrences}× in chapter` : ''}
                          </span>
                        </div>
                        {!isExpanded && (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            {entry.simpleDefinition}
                          </p>
                        )}
                      </div>
                      <span className="mt-0.5 shrink-0 text-slate-400">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-2 space-y-2.5 rounded-2xl bg-slate-50/90 px-4 py-3.5 dark:bg-[#0D111A]">
                        <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-100">
                          {entry.simpleDefinition}
                        </p>
                        {entry.legalContext && (
                          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Context:{' '}
                            </span>
                            {entry.legalContext}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.citation && (
                            <>
                              <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                                {entry.citation}
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>Source: {entry.masterBookTitle}</span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
