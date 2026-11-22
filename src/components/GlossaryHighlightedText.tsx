import { useMemo } from 'react';
import type { OttGlossaryTerm } from '../types/ott';
import { compileGlossaryMatcher, tokenizeTextWithGlossary } from '../utils/legalGlossary';

interface GlossaryHighlightedTextProps {
  text: string;
  terms: OttGlossaryTerm[];
  enabled: boolean;
  activeTermId?: string | null;
  onSelectTerm: (term: OttGlossaryTerm, anchorRect: DOMRect | null) => void;
}

/**
 * Renders legal prose with subtle, accessible inline highlights for complex legal terms.
 * Clicking a highlighted term opens the simple definition popup without triggering parent clause toggles.
 */
export function GlossaryHighlightedText({
  text,
  terms,
  enabled,
  activeTermId = null,
  onSelectTerm,
}: GlossaryHighlightedTextProps) {
  const matcher = useMemo(() => (enabled ? compileGlossaryMatcher(terms) : null), [enabled, terms]);

  const segments = useMemo(() => {
    if (!enabled || !matcher) {
      return [{ type: 'text' as const, value: text }];
    }
    return tokenizeTextWithGlossary(text, terms, matcher);
  }, [enabled, matcher, text, terms]);

  if (!enabled || segments.length === 1 && segments[0].type === 'text') {
    return <>{text}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        const isActive = activeTermId === segment.entry.id;
        return (
          <button
            key={`g-${segment.entry.id}-${index}`}
            type="button"
            data-glossary-term={segment.entry.term}
            aria-label={`Define legal term: ${segment.entry.term}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              onSelectTerm(segment.entry, rect);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
              }
            }}
            className={`inline cursor-pointer rounded-sm border-b border-dotted px-0.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
              isActive
                ? 'border-[#2563EB] bg-blue-500/18 text-blue-900 dark:border-blue-400 dark:bg-blue-400/25 dark:text-blue-100'
                : 'border-blue-600/75 bg-blue-500/[0.06] text-inherit hover:bg-blue-500/[0.14] dark:border-blue-400/80 dark:bg-blue-400/[0.10] dark:hover:bg-blue-400/[0.20]'
            }`}
          >
            {segment.value}
          </button>
        );
      })}
    </>
  );
}
