import type { OttGlossaryCategory, OttGlossaryTerm } from '../types/ott';

export type GlossaryTextSegment =
  | { type: 'text'; value: string }
  | { type: 'term'; value: string; entry: OttGlossaryTerm };

export interface MatchedGlossaryTerm {
  entry: OttGlossaryTerm;
  occurrences: number;
  matchedForms: string[];
}

interface CompiledGlossaryMatcher {
  regex: RegExp;
  lookup: Map<string, OttGlossaryTerm>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles a single longest-match-first whole-word regex across all terms and aliases.
 * Multi-word phrases (e.g. "Habeas Corpus", "Constitutional Morality", "Duty of Care")
 * always win over shorter substrings, and word boundaries prevent false matches inside
 * longer unrelated words (e.g. "writ" will not match "written").
 */
export function compileGlossaryMatcher(terms: OttGlossaryTerm[]): CompiledGlossaryMatcher | null {
  if (!Array.isArray(terms) || terms.length === 0) return null;

  const lookup = new Map<string, OttGlossaryTerm>();
  const forms: string[] = [];

  for (const entry of terms) {
    const candidates = [entry.term, ...(entry.aliases ?? [])];
    for (const raw of candidates) {
      const cleaned = raw.trim();
      if (cleaned.length < 2) continue;
      const lower = cleaned.toLowerCase();
      if (!lookup.has(lower)) {
        lookup.set(lower, entry);
        forms.push(cleaned);
      }
    }
  }

  if (forms.length === 0) return null;

  // Longest phrases first so "Law of Torts" matches before "Tort" or "Law"
  forms.sort((a, b) => b.length - a.length);

  const alternation = forms.map(escapeRegExp).join('|');
  // Use ASCII/Unicode letter-number boundary lookarounds so hyphenated terms like "Barrister-at-Law"
  // or "Drip-Pricing" match cleanly as whole legal phrases without bleeding into adjacent words.
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, 'giu');

  return { regex, lookup };
}

/**
 * Splits a block of legal text into plain text segments and interactive glossary term segments.
 */
export function tokenizeTextWithGlossary(
  text: string,
  terms: OttGlossaryTerm[],
  precompiled?: CompiledGlossaryMatcher | null
): GlossaryTextSegment[] {
  if (!text) return [];
  const matcher = precompiled !== undefined ? precompiled : compileGlossaryMatcher(terms);
  if (!matcher) {
    return [{ type: 'text', value: text }];
  }

  const segments: GlossaryTextSegment[] = [];
  const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(text)) !== null) {
    const matchedValue = match[0];
    const start = match.index;
    const entry = matcher.lookup.get(matchedValue.toLowerCase());
    if (!entry) continue;

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'term', value: matchedValue, entry });
    lastIndex = start + matchedValue.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

/**
 * Scans all text blocks in the current chapter and extracts deduplicated matched glossary terms
 * along with occurrence counts and exact surface forms encountered in the chapter.
 */
export function extractMatchedGlossaryTerms(
  texts: string[],
  terms: OttGlossaryTerm[]
): MatchedGlossaryTerm[] {
  const matcher = compileGlossaryMatcher(terms);
  if (!matcher || texts.length === 0) return [];

  const matchedMap = new Map<
    string,
    { entry: OttGlossaryTerm; occurrences: number; forms: Set<string> }
  >();

  for (const block of texts) {
    if (!block) continue;
    const segments = tokenizeTextWithGlossary(block, terms, matcher);
    for (const seg of segments) {
      if (seg.type !== 'term') continue;
      const existing = matchedMap.get(seg.entry.id);
      if (existing) {
        existing.occurrences += 1;
        existing.forms.add(seg.value);
      } else {
        matchedMap.set(seg.entry.id, {
          entry: seg.entry,
          occurrences: 1,
          forms: new Set([seg.value]),
        });
      }
    }
  }

  return Array.from(matchedMap.values()).map((item) => ({
    entry: item.entry,
    occurrences: item.occurrences,
    matchedForms: Array.from(item.forms),
  }));
}

/**
 * Filters glossary terms by search query (term, aliases, definition, citation, master book)
 * and optional legal category.
 */
export function filterGlossaryTerms(
  terms: OttGlossaryTerm[],
  query: string,
  category: OttGlossaryCategory | 'All' = 'All'
): OttGlossaryTerm[] {
  const trimmed = query.trim().toLowerCase();
  return terms.filter((entry) => {
    if (category !== 'All' && entry.category !== category) {
      return false;
    }
    if (!trimmed) return true;
    const haystack = [
      entry.term,
      ...(entry.aliases ?? []),
      entry.simpleDefinition,
      entry.legalContext ?? '',
      entry.citation ?? '',
      entry.category,
      entry.masterBookTitle,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}

export function getGlossaryCategories(terms: OttGlossaryTerm[]): OttGlossaryCategory[] {
  const seen = new Set<OttGlossaryCategory>();
  for (const item of terms) {
    seen.add(item.category);
  }
  return Array.from(seen);
}
