import type { BulkImportParseResult, CmsBook } from '../types/backend';
import type { BookCategory, Chapter, Clause, LawBook } from '../types/library';

const VALID_CATEGORIES: Exclude<BookCategory, 'custom'>[] = [
  'constitutions',
  'history',
  'statutory',
  'international',
];

const VALID_TONES: LawBook['coverTone'][] = [
  'cobalt',
  'sapphire',
  'slate',
  'emerald',
  'amber',
  'obsidian',
];

export interface BulkActorContext {
  uid: string;
  email: string;
  defaultStatus?: 'draft' | 'pending_review' | 'published';
}

export function sanitizeSlugId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `${fallbackPrefix}-${Date.now().toString(36)}`;
}

function normalizeCategory(raw: unknown): Exclude<BookCategory, 'custom'> {
  const value = String(raw ?? '').trim().toLowerCase();
  if (VALID_CATEGORIES.includes(value as Exclude<BookCategory, 'custom'>)) {
    return value as Exclude<BookCategory, 'custom'>;
  }
  return 'statutory';
}

function normalizeCoverTone(raw: unknown): LawBook['coverTone'] {
  const value = String(raw ?? '').trim().toLowerCase();
  if (VALID_TONES.includes(value as LawBook['coverTone'])) {
    return value as LawBook['coverTone'];
  }
  return 'cobalt';
}

/**
 * RFC-4180 compliant CSV parser supporting quoted commas, escaped quotes, and multiline fields.
 */
export function parseCsvMatrix(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\r' && nextChar === '\n') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      i += 1;
    } else if (char === '\n' || char === '\r') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

/**
 * Convert tabular rows (from CSV or Excel .xlsx sheets) into validated CmsBook records.
 * First row must contain headers.
 */
export function parseBulkBooksRows(
  matrix: unknown[][],
  actor: BulkActorContext
): BulkImportParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(matrix) || matrix.length < 2) {
    return {
      books: [],
      errors: ['Upload must contain a header row and at least one book/clause data row.'],
      warnings,
      rowCount: 0,
    };
  }

  const headers = matrix[0].map((cell) => String(cell ?? '').trim().toLowerCase());
  const dataRows = matrix.slice(1).filter((r) => r.some((c) => String(c ?? '').trim().length > 0));

  const getCol = (row: unknown[], aliases: string[]): string => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias.toLowerCase());
      if (idx >= 0 && row[idx] !== undefined && row[idx] !== null) {
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  const booksMap = new Map<string, CmsBook>();
  const nowIso = new Date().toISOString();
  const initialStatus = actor.defaultStatus ?? 'pending_review';

  dataRows.forEach((row, index) => {
    const rowNum = index + 2;
    const titleEn = getCol(row, ['title_en', 'title', 'book_title']);
    const shortTitle = getCol(row, ['short_title', 'shorttitle']) || titleEn.slice(0, 32);
    const chapterTitleEn = getCol(row, ['chapter_title_en', 'chapter_title', 'chapter']);
    const clauseNumber = getCol(row, ['clause_number', 'article_number', 'verse_number', 'clause']);
    const clauseTextEn = getCol(row, ['clause_text_en', 'text_en', 'clause_text', 'text']);
    const explanationEn = getCol(row, ['explanation_en', 'meaning_en', 'explanation', 'meaning']);

    if (!titleEn) {
      errors.push(`Row ${rowNum}: Missing required column "title_en" (or "title").`);
      return;
    }
    if (!chapterTitleEn) {
      errors.push(`Row ${rowNum}: Missing required column "chapter_title_en".`);
      return;
    }
    if (!clauseTextEn || clauseTextEn.length < 10) {
      errors.push(`Row ${rowNum}: "clause_text_en" must be at least 10 characters.`);
      return;
    }
    if (!explanationEn || explanationEn.length < 10) {
      errors.push(`Row ${rowNum}: "explanation_en" (meaning) must be at least 10 characters.`);
      return;
    }

    const rawBookId = getCol(row, ['book_id', 'bookid', 'id']) || titleEn;
    const bookId = sanitizeSlugId(rawBookId, `book-${rowNum}`);

    const titleTe = getCol(row, ['title_te']);
    const subtitleEn = getCol(row, ['subtitle_en', 'subtitle']) || `${shortTitle} official reference text & explanation.`;
    const subtitleTe = getCol(row, ['subtitle_te']);
    const jurisdiction = getCol(row, ['jurisdiction']) || 'Republic of India';
    const year = getCol(row, ['year']) || '2025';
    const category = normalizeCategory(getCol(row, ['category']));
    const coverTone = normalizeCoverTone(getCol(row, ['cover_tone', 'tone']));
    const sourceAttribution = getCol(row, ['source', 'source_attribution']) || 'Official Statutory Gazette';
    const rightsLicense = getCol(row, ['license', 'rights_license']) || 'Public Domain / Open Civic Education';

    let book = booksMap.get(bookId);
    if (!book) {
      book = {
        id: bookId,
        shortTitle: shortTitle.slice(0, 80),
        title: { en: titleEn, ...(titleTe ? { te: titleTe } : {}) },
        subtitle: { en: subtitleEn, ...(subtitleTe ? { te: subtitleTe } : {}) },
        jurisdiction,
        year,
        category,
        coverTone,
        status: initialStatus,
        sourceAttribution,
        rightsLicense,
        chapters: [],
        createdByUid: actor.uid,
        createdByEmail: actor.email,
        reviewedByEmail: '',
        reviewNotes: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      booksMap.set(bookId, book);
    }

    const chapterId = sanitizeSlugId(
      getCol(row, ['chapter_id', 'chapterid']) || `${bookId}-${chapterTitleEn}`,
      `ch-${rowNum}`
    );
    const chapterNumber = getCol(row, ['chapter_number']) || `Chapter ${book.chapters.length + 1}`;
    const chapterTitleTe = getCol(row, ['chapter_title_te']);
    const chapterSummaryEn = getCol(row, ['chapter_summary_en', 'chapter_summary']) || chapterTitleEn;

    let chapter = book.chapters.find((c) => c.id === chapterId);
    if (!chapter) {
      chapter = {
        id: chapterId,
        number: chapterNumber,
        title: { en: chapterTitleEn, ...(chapterTitleTe ? { te: chapterTitleTe } : {}) },
        summary: { en: chapterSummaryEn },
        estimatedMinutes: 5,
        clauses: [],
      };
      book.chapters.push(chapter);
    }

    const clauseId = sanitizeSlugId(
      getCol(row, ['clause_id', 'clauseid']) || `${chapterId}-${clauseNumber || chapter.clauses.length + 1}`,
      `cl-${rowNum}`
    );
    const principleEn = getCol(row, ['principle_en', 'principle', 'heading']) || clauseNumber || 'Legal Principle';
    const principleTe = getCol(row, ['principle_te']);
    const clauseTextTe = getCol(row, ['clause_text_te', 'text_te']);
    const explanationTe = getCol(row, ['explanation_te', 'meaning_te']);
    const realWorldExampleEn =
      getCol(row, ['example_en', 'real_world_example_en', 'example']) ||
      `Practical legal application of ${clauseNumber || principleEn}.`;
    const realWorldExampleTe = getCol(row, ['example_te', 'real_world_example_te']);

    if (!clauseTextTe) {
      warnings.push(`Row ${rowNum} (${shortTitle}): No Telugu translation provided; English fallback will display.`);
    }

    const clause: Clause = {
      id: clauseId,
      number: clauseNumber || `Section ${chapter.clauses.length + 1}`,
      principle: { en: principleEn, ...(principleTe ? { te: principleTe } : {}) },
      text: { en: clauseTextEn, ...(clauseTextTe ? { te: clauseTextTe } : {}) },
      explanation: { en: explanationEn, ...(explanationTe ? { te: explanationTe } : {}) },
      realWorldExample: {
        en: realWorldExampleEn,
        ...(realWorldExampleTe ? { te: realWorldExampleTe } : {}),
      },
    };

    chapter.clauses.push(clause);
    chapter.estimatedMinutes = Math.max(3, chapter.clauses.length * 3);
  });

  return {
    books: Array.from(booksMap.values()),
    errors,
    warnings,
    rowCount: dataRows.length,
  };
}

export function parseBulkBooksCsv(csvText: string, actor: BulkActorContext): BulkImportParseResult {
  const matrix = parseCsvMatrix(csvText);
  return parseBulkBooksRows(matrix, actor);
}

export function parseBulkBooksJson(jsonText: string, actor: BulkActorContext): BulkImportParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      books: [],
      errors: ['Invalid JSON syntax. Please check brackets, quotes, and trailing commas.'],
      warnings,
      rowCount: 0,
    };
  }

  const rawItems: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { books?: unknown[] }).books)
      ? (parsed as { books: unknown[] }).books
      : [parsed];

  if (rawItems.length === 0) {
    return {
      books: [],
      errors: ['JSON payload contains no books. Provide an array of books or { "books": [...] }.'],
      warnings,
      rowCount: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const initialStatus = actor.defaultStatus ?? 'pending_review';
  const books: CmsBook[] = [];

  rawItems.forEach((raw, idx) => {
    if (typeof raw !== 'object' || raw === null) {
      errors.push(`Book #${idx + 1}: Expected a JSON object.`);
      return;
    }

    const item = raw as Record<string, unknown>;
    const rawTitle = item.title;
    const titleEn =
      typeof rawTitle === 'string'
        ? rawTitle.trim()
        : typeof rawTitle === 'object' && rawTitle !== null
          ? String((rawTitle as Record<string, unknown>).en ?? '').trim()
          : '';
    const titleTe =
      typeof rawTitle === 'object' && rawTitle !== null
        ? String((rawTitle as Record<string, unknown>).te ?? '').trim()
        : String(item.title_te ?? '').trim();

    if (titleEn.length < 2) {
      errors.push(`Book #${idx + 1}: Missing valid "title" (or "title.en").`);
      return;
    }

    const rawSubtitle = item.subtitle;
    const subtitleEn =
      typeof rawSubtitle === 'string'
        ? rawSubtitle.trim()
        : typeof rawSubtitle === 'object' && rawSubtitle !== null
          ? String((rawSubtitle as Record<string, unknown>).en ?? '').trim()
          : `${titleEn} — annotated digital edition.`;
    const subtitleTe =
      typeof rawSubtitle === 'object' && rawSubtitle !== null
        ? String((rawSubtitle as Record<string, unknown>).te ?? '').trim()
        : '';

    const rawChapters = Array.isArray(item.chapters) ? item.chapters : [];
    if (rawChapters.length === 0) {
      errors.push(`Book #${idx + 1} ("${titleEn}"): Must include at least one chapter with clauses.`);
      return;
    }

    const bookId = sanitizeSlugId(String(item.id ?? titleEn), `json-book-${idx + 1}`);
    const chapters: Chapter[] = [];

    rawChapters.forEach((rawCh, chIdx) => {
      if (typeof rawCh !== 'object' || rawCh === null) return;
      const chObj = rawCh as Record<string, unknown>;
      const chTitleEn =
        typeof chObj.title === 'string'
          ? chObj.title.trim()
          : typeof chObj.title === 'object' && chObj.title !== null
            ? String((chObj.title as Record<string, unknown>).en ?? '').trim()
            : `Chapter ${chIdx + 1}`;
      const chTitleTe =
        typeof chObj.title === 'object' && chObj.title !== null
          ? String((chObj.title as Record<string, unknown>).te ?? '').trim()
          : '';
      const chSummaryEn =
        typeof chObj.summary === 'string'
          ? chObj.summary.trim()
          : typeof chObj.summary === 'object' && chObj.summary !== null
            ? String((chObj.summary as Record<string, unknown>).en ?? '').trim()
            : chTitleEn;

      const rawClauses = Array.isArray(chObj.clauses) ? chObj.clauses : [];
      const clauses: Clause[] = [];

      rawClauses.forEach((rawCl, clIdx) => {
        if (typeof rawCl !== 'object' || rawCl === null) return;
        const clObj = rawCl as Record<string, unknown>;
        const readLoc = (field: unknown, fallback = ''): { en: string; te?: string } => {
          if (typeof field === 'string') return { en: field.trim() || fallback };
          if (typeof field === 'object' && field !== null) {
            const m = field as Record<string, unknown>;
            const en = String(m.en ?? fallback).trim();
            const te = String(m.te ?? '').trim();
            return { en, ...(te ? { te } : {}) };
          }
          return { en: fallback };
        };

        const textLoc = readLoc(clObj.text);
        const expLoc = readLoc(clObj.explanation);
        if (textLoc.en.length < 10 || expLoc.en.length < 10) {
          errors.push(
            `Book "${titleEn}" Chapter ${chIdx + 1} Clause ${clIdx + 1}: text.en and explanation.en must be at least 10 characters.`
          );
          return;
        }

        const number = String(clObj.number ?? `Article ${clIdx + 1}`).trim();
        clauses.push({
          id: sanitizeSlugId(String(clObj.id ?? `${bookId}-c${chIdx + 1}-v${clIdx + 1}`), `cl-${clIdx + 1}`),
          number,
          principle: readLoc(clObj.principle, number),
          text: textLoc,
          explanation: expLoc,
          realWorldExample: readLoc(clObj.realWorldExample, `Real-world civic guidance for ${number}.`),
        });
      });

      if (clauses.length > 0) {
        chapters.push({
          id: sanitizeSlugId(String(chObj.id ?? `${bookId}-ch-${chIdx + 1}`), `ch-${chIdx + 1}`),
          number: String(chObj.number ?? `Chapter ${chIdx + 1}`),
          title: { en: chTitleEn, ...(chTitleTe ? { te: chTitleTe } : {}) },
          summary: { en: chSummaryEn },
          estimatedMinutes: Number(chObj.estimatedMinutes) || Math.max(3, clauses.length * 3),
          clauses,
        });
      }
    });

    if (chapters.length === 0) {
      errors.push(`Book "${titleEn}": No valid chapters/clauses found.`);
      return;
    }

    books.push({
      id: bookId,
      shortTitle: String(item.shortTitle ?? titleEn).trim().slice(0, 80),
      title: { en: titleEn, ...(titleTe ? { te: titleTe } : {}) },
      subtitle: { en: subtitleEn, ...(subtitleTe ? { te: subtitleTe } : {}) },
      jurisdiction: String(item.jurisdiction ?? 'Republic of India').trim(),
      year: String(item.year ?? '2025').trim(),
      category: normalizeCategory(item.category),
      coverTone: normalizeCoverTone(item.coverTone),
      status: initialStatus,
      sourceAttribution: String(item.sourceAttribution ?? 'Official Statutory Publication').trim(),
      rightsLicense: String(item.rightsLicense ?? 'Public Domain / Open Civic Education').trim(),
      chapters,
      createdByUid: actor.uid,
      createdByEmail: actor.email,
      reviewedByEmail: '',
      reviewNotes: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  });

  return {
    books,
    errors,
    warnings,
    rowCount: rawItems.length,
  };
}

export const SAMPLE_BULK_JSON = JSON.stringify(
  {
    books: [
      {
        id: 'rti-act-2005',
        shortTitle: 'RTI Act 2005',
        title: {
          en: 'Right to Information Act, 2005',
          te: 'సమాచార హక్కు చట్టం, 2005',
        },
        subtitle: {
          en: 'Citizens’ statutory right to transparency and public accountability.',
          te: 'ప్రభుత్వ పారదర్శకత మరియు జవాబుదారీతనం కోసం పౌరుల హక్కు.',
        },
        jurisdiction: 'Republic of India',
        year: '2005',
        category: 'statutory',
        coverTone: 'emerald',
        sourceAttribution: 'Gazette of India — Ministry of Law and Justice',
        rightsLicense: 'Government Work — Public Domain',
        chapters: [
          {
            id: 'rti-ch-1',
            number: 'Chapter II',
            title: {
              en: 'Right to Information & Public Obligations',
              te: 'సమాచార హక్కు మరియు ప్రభుత్వ బాధ్యతలు',
            },
            summary: { en: 'Core right of every citizen to request public records within 30 days.' },
            clauses: [
              {
                id: 'rti-sec-3',
                number: 'Section 3',
                principle: {
                  en: 'Universal Citizen Right to Public Information',
                  te: 'పౌరులందరికీ సమాచార హక్కు',
                },
                text: {
                  en: 'Subject to the provisions of this Act, all citizens shall have the right to information.',
                  te: 'ఈ చట్టం యొక్క నిబంధనలకు లోబడి, పౌరులందరికీ సమాచారం పొందే హక్కు ఉంటుంది.',
                },
                explanation: {
                  en: 'Every Indian citizen can formally ask government offices for certified records, files, or decisions without needing to give a reason.',
                  te: 'ప్రతి భారతీయ పౌరుడు కారణం చెప్పాల్సిన అవసరం లేకుండా ప్రభుత్వ కార్యాలయాల నుండి అధికారిక రికార్డులను అడగవచ్చు.',
                },
                realWorldExample: {
                  en: 'Filing an online RTI request to check the sanctioned budget and completion report of a local public road.',
                  te: 'స్థానిక రహదారి నిర్మాణ బడ్జెట్ మరియు పూర్తి నివేదిక కోసం ఆన్‌లైన్ ఆర్టీఐ దరఖాస్తు చేయడం.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  null,
  2
);

export const SAMPLE_BULK_CSV = [
  'book_id,short_title,title_en,title_te,jurisdiction,year,category,cover_tone,source_attribution,rights_license,chapter_number,chapter_title_en,clause_number,principle_en,clause_text_en,explanation_en,clause_text_te,explanation_te,example_en',
  'consumer-protection-2019,Consumer Act 2019,"Consumer Protection Act, 2019","వినియోగదారుల రక్షణ చట్టం, 2019",Republic of India,2019,statutory,amber,Ministry of Consumer Affairs,Public Domain,Chapter I,Consumer Rights,Section 2(9),Six Core Consumer Rights,"Consumer rights include the right to be protected against hazardous goods, the right to be informed about quality and price, and the right to seek redressal.","Protects buyers from unsafe products, hidden pricing, and unfair online or offline trade practices with dedicated consumer commissions.","ప్రమాదకరమైన వస్తువుల నుండి రక్షణ, నాణ్యత మరియు ధర గురించి తెలుసుకునే హక్కు వినియోగదారులకు ఉంది.","అసురక్షిత ఉత్పత్తులు మరియు అన్యాయమైన వ్యాపార పద్ధతుల నుండి వినియోగదారులను రక్షిస్తుంది.","Filing a complaint on the E-Daakhil portal when an e-commerce seller refuses to refund a defective item."',
].join('\n');
