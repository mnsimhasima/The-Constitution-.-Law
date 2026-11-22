import type { LanguageCode, LawBook, LocalizedText } from '../types/library';
import { getLocalizedText } from './libraryLogic';

export const RECENT_SEARCHES_STORAGE_KEY = 'constitution_law_library_recent_searches_v1';
export const MAX_RECENT_SEARCHES = 6;

export interface TrendingLegalTopic {
  id: string;
  query: string;
  label: LocalizedText;
  domain: LocalizedText;
  citation: string;
}

export interface LibraryQuickMatch {
  id: string;
  type: 'book' | 'clause';
  bookId: string;
  chapterId: string;
  clauseId?: string;
  title: string;
  subtitle: string;
  meta: string;
}

export const TRENDING_LEGAL_TOPICS: readonly TrendingLegalTopic[] = [
  {
    id: 'topic-article-21',
    query: 'Article 21',
    label: {
      en: 'Right to Life & Personal Liberty',
      te: 'జీవించే హక్కు & వ్యక్తిగత స్వేచ్ఛ',
    },
    domain: {
      en: 'Indian Constitution',
      te: 'భారత రాజ్యాంగం · ప్రాథమిక హక్కులు',
    },
    citation: 'Article 21',
  },
  {
    id: 'topic-magna-carta',
    query: 'Magna Carta',
    label: {
      en: 'Due Process & Law of the Land',
      te: 'న్యాయమైన చట్ట ప్రక్రియ (మాగ్నా కార్టా)',
    },
    domain: {
      en: 'Magna Carta Charter',
      te: 'మాగ్నా కార్టా · చారిత్రక నిబంధనలు',
    },
    citation: 'Clauses 39–40',
  },
  {
    id: 'topic-ambedkar',
    query: 'Ambedkar',
    label: {
      en: 'Dr. B. R. Ambedkar & Drafting',
      te: 'డా. బి.ఆర్. అంబేద్కర్ & రాజ్యాంగ నిర్మాణం',
    },
    domain: {
      en: 'Constitutional History',
      te: 'రాజ్యాంగ చరిత్ర · భారత్',
    },
    citation: '1948–1949',
  },
  {
    id: 'topic-writs-art-32',
    query: 'Article 32',
    label: {
      en: 'Constitutional Remedies & Writs',
      te: 'రాజ్యాంగ పరిహార హక్కు & రిట్లు',
    },
    domain: {
      en: 'Habeas Corpus & Mandamus',
      te: 'హెబియస్ కార్పస్ · మాండమస్',
    },
    citation: 'Article 32',
  },
  {
    id: 'topic-rti-digital',
    query: 'RTI',
    label: {
      en: 'Right to Information & Privacy',
      te: 'సమాచార హక్కు (RTI) & గోప్యత',
    },
    domain: {
      en: 'Digital & Transparency Law',
      te: 'డిజిటల్ & పారదర్శకత చట్టం',
    },
    citation: 'RTI Act 2005',
  },
  {
    id: 'topic-equality-art-14',
    query: 'Article 14',
    label: {
      en: 'Equality Before the Law',
      te: 'చట్టం ముందు సమానత్వం',
    },
    domain: {
      en: 'Equal Protection',
      te: 'సమాన రక్షణ · వివక్ష నిషేధం',
    },
    citation: 'Article 14',
  },
  {
    id: 'topic-consumer',
    query: 'Consumer',
    label: {
      en: 'Consumer Protection & Redressal',
      te: 'వినియోగదారుల రక్షణ & పరిహారం',
    },
    domain: {
      en: 'Civil & Statutory Law',
      te: 'సివిల్ & చట్టబద్ధ హక్కులు',
    },
    citation: 'CPA 2019',
  },
  {
    id: 'topic-human-rights',
    query: 'Human Rights',
    label: {
      en: 'Universal Human Rights (UDHR)',
      te: 'విశ్వ మానవ హక్కుల ప్రకటన (UDHR)',
    },
    domain: {
      en: 'United Nations Charter',
      te: 'ఐక్యరాజ్యసమితి · 1948 ప్రకటన',
    },
    citation: 'UN 1948',
  },
];

export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

function isMeaningfulQuery(normalized: string): boolean {
  if (!normalized) return false;
  // Allow single non-ASCII script characters (e.g. Telugu/Hindi), require >=2 chars for plain ASCII
  const hasNonAscii = /[^\x20-\x7E]/.test(normalized);
  return hasNonAscii ? normalized.length >= 1 : normalized.length >= 2;
}

export function addRecentSearch(
  existing: readonly string[],
  rawQuery: string,
  maxItems: number = MAX_RECENT_SEARCHES
): string[] {
  const normalized = normalizeSearchQuery(rawQuery);
  if (!isMeaningfulQuery(normalized)) {
    return [...existing];
  }
  const lower = normalized.toLowerCase();
  const deduped = existing.filter((item) => item.trim().toLowerCase() !== lower);
  return [normalized, ...deduped].slice(0, Math.max(1, maxItems));
}

export function removeRecentSearch(existing: readonly string[], targetQuery: string): string[] {
  const lower = targetQuery.trim().toLowerCase();
  return existing.filter((item) => item.trim().toLowerCase() !== lower);
}

export function filterTrendingTopics(
  topics: readonly TrendingLegalTopic[],
  rawQuery: string,
  language: LanguageCode
): TrendingLegalTopic[] {
  const normalized = normalizeSearchQuery(rawQuery).toLowerCase();
  if (!normalized) return [...topics];

  return topics.filter((topic) => {
    const haystack = [
      topic.query,
      topic.citation,
      getLocalizedText(topic.label, language),
      topic.label.en,
      topic.label.te ?? '',
      getLocalizedText(topic.domain, language),
      topic.domain.en,
      topic.domain.te ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function getLibraryQuickMatches(
  books: readonly LawBook[],
  rawQuery: string,
  language: LanguageCode,
  limit: number = 4
): LibraryQuickMatch[] {
  const normalized = normalizeSearchQuery(rawQuery).toLowerCase();
  if (!normalized || limit <= 0) return [];

  const catalogBooks = books.filter((b) => !b.isUserAdded && b.category !== 'custom');
  const matches: LibraryQuickMatch[] = [];
  const seenKeys = new Set<string>();

  // 1. Direct clause-level hits (highest specificity for articles/clauses like "Article 21" or "Clause 39")
  for (const book of catalogBooks) {
    const localizedBookTitle = getLocalizedText(book.title, language);
    for (const chapter of book.chapters) {
      for (const clause of chapter.clauses) {
        const principle = getLocalizedText(clause.principle, language);
        const clauseHaystack = [
          clause.number,
          principle,
          clause.principle.en,
          clause.principle.te ?? '',
          getLocalizedText(clause.text, language),
          clause.text.en,
          clause.text.te ?? '',
        ]
          .join(' ')
          .toLowerCase();

        if (clauseHaystack.includes(normalized)) {
          const key = `clause:${book.id}:${chapter.id}:${clause.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            matches.push({
              id: key,
              type: 'clause',
              bookId: book.id,
              chapterId: chapter.id,
              clauseId: clause.id,
              title: `${clause.number} · ${principle}`,
              subtitle: localizedBookTitle,
              meta: `${book.jurisdiction} · ${book.year}`,
            });
          }
          if (matches.length >= limit) return matches;
        }
      }
    }
  }

  // 2. Book-level hits if slots remain
  for (const book of catalogBooks) {
    const firstChapter = book.chapters[0];
    if (!firstChapter) continue;

    const localizedTitle = getLocalizedText(book.title, language);
    const localizedSubtitle = getLocalizedText(book.subtitle, language);
    const bookHaystack = [
      book.shortTitle,
      book.jurisdiction,
      book.year,
      localizedTitle,
      book.title.en,
      book.title.te ?? '',
      localizedSubtitle,
    ]
      .join(' ')
      .toLowerCase();

    if (bookHaystack.includes(normalized)) {
      const key = `book:${book.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        matches.push({
          id: key,
          type: 'book',
          bookId: book.id,
          chapterId: firstChapter.id,
          title: localizedTitle,
          subtitle: localizedSubtitle,
          meta: `${book.jurisdiction} · ${book.chapters.length} ch`,
        });
      }
      if (matches.length >= limit) return matches;
    }
  }

  return matches;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadRecentSearchesFromStorage(storage?: StorageLike | null): string[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return [];
  try {
    const raw = target.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const normalized = normalizeSearchQuery(entry);
      if (!isMeaningfulQuery(normalized)) continue;
      const lower = normalized.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      cleaned.push(normalized);
      if (cleaned.length >= MAX_RECENT_SEARCHES) break;
    }
    return cleaned;
  } catch {
    return [];
  }
}

export function saveRecentSearchesToStorage(
  searches: readonly string[],
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES))
    );
  } catch {
    // Ignore storage write errors (e.g. private browsing quota)
  }
}
