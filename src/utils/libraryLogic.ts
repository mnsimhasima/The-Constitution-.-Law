import type {
  AudioMode,
  AudioSegment,
  BookCategory,
  Chapter,
  ClauseHighlight,
  HighlightColor,
  LanguageCode,
  LawBook,
  LocalizedText,
  NewBookFormInput,
  ReadingPlan,
  ValidationResult,
} from '../types/library';

export function getLocalizedText(localized: LocalizedText | undefined, lang: LanguageCode): string {
  if (!localized) return '';
  const candidate = localized[lang];
  if (candidate && candidate.trim().length > 0) {
    return candidate;
  }
  return localized.en;
}

export function isRtlLanguage(lang: LanguageCode): boolean {
  return lang === 'ar';
}

export function getClauseKey(bookId: string, chapterId: string, clauseId: string): string {
  return `${bookId}::${chapterId}::${clauseId}`;
}

export function sanitizeDocId(raw: string): string {
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'doc';
}

export function searchLibrary(
  books: LawBook[],
  query: string,
  category: BookCategory | 'all',
  lang: LanguageCode
): LawBook[] {
  const normalizedQuery = query.trim().toLowerCase();

  return books.filter((book) => {
    const categoryMatches =
      category === 'all'
        ? true
        : category === 'custom'
          ? Boolean(book.isUserAdded || book.category === 'custom')
          : book.category === category;

    if (!categoryMatches) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystackParts: string[] = [
      book.shortTitle,
      book.jurisdiction,
      book.year,
      getLocalizedText(book.title, lang),
      book.title.en,
      book.title.te ?? '',
      getLocalizedText(book.subtitle, lang),
    ];

    for (const chapter of book.chapters) {
      haystackParts.push(chapter.number, getLocalizedText(chapter.title, lang));
      for (const clause of chapter.clauses) {
        haystackParts.push(
          clause.number,
          getLocalizedText(clause.principle, lang),
          getLocalizedText(clause.text, lang),
          getLocalizedText(clause.explanation, lang)
        );
      }
    }

    return haystackParts.join(' ').toLowerCase().includes(normalizedQuery);
  });
}

export const CHAPTER_HEADER_CLAUSE_ID = '__chapter_header__';

const NARRATION_LABELS: Record<
  LanguageCode,
  {
    headerTag: string;
    headlineTag: string;
    contentTag: string;
    deepExplanation: string;
    realWorldContext: string;
  }
> = {
  en: {
    headerTag: 'Chapter Header',
    headlineTag: 'Clause Headline',
    contentTag: 'Clause Content',
    deepExplanation: 'Deep Explanation',
    realWorldContext: 'Real-world context',
  },
  te: {
    headerTag: 'అధ్యాయ శీర్షిక & పరిచయం',
    headlineTag: 'నిబంధన శీర్షిక',
    contentTag: 'మూల పాఠ్యం',
    deepExplanation: 'సులభ మరియు లోతైన వివరణ',
    realWorldContext: 'నిజ జీవిత ఉదాహరణ',
  },
  hi: {
    headerTag: 'अध्याय शीर्षक व परिचय',
    headlineTag: 'खंड शीर्षक',
    contentTag: 'मूल पाठ',
    deepExplanation: 'गहन व्याख्या',
    realWorldContext: 'व्यावहारिक उदाहरण',
  },
  es: {
    headerTag: 'Encabezado y Resumen',
    headlineTag: 'Titular de Cláusula',
    contentTag: 'Texto Original',
    deepExplanation: 'Explicación profunda',
    realWorldContext: 'Contexto real',
  },
  fr: {
    headerTag: 'En-tête et Aperçu',
    headlineTag: 'Titre de Clause',
    contentTag: 'Texte Original',
    deepExplanation: 'Explication approfondie',
    realWorldContext: 'Contexte concret',
  },
  ar: {
    headerTag: 'عنوان الفصل والملخص',
    headlineTag: 'عنوان البند',
    contentTag: 'النص الأصلي',
    deepExplanation: 'الشرح التفصيلي',
    realWorldContext: 'التطبيق الواقعي',
  },
};

export function localizeStructuralLabel(raw: string, lang: LanguageCode): string {
  const trimmed = raw.trim();
  if (!trimmed || lang === 'en') return trimmed;

  if (lang === 'te') {
    return trimmed
      .replace(/^Clauses\b/i, 'నిబంధనలు')
      .replace(/^Clause\b/i, 'నిబంధన')
      .replace(/^Chapters\b/i, 'అధ్యాయాలు')
      .replace(/^Chapter\b/i, 'అధ్యాయం')
      .replace(/^Articles\b/i, 'ఆర్టికల్స్')
      .replace(/^Article\b/i, 'ఆర్టికల్')
      .replace(/^Sections\b/i, 'విభాగాలు')
      .replace(/^Section\b/i, 'విభాగం')
      .replace(/^Rules\b/i, 'నియమాలు')
      .replace(/^Rule\b/i, 'నియమం')
      .replace(/^Part\b/i, 'భాగం')
      .replace(/^Preamble\b/i, 'ప్రవేశిక')
      .replace(/^Amendment\b/i, 'సవరణ');
  }

  if (lang === 'hi') {
    return trimmed
      .replace(/^Clauses\b/i, 'खंड')
      .replace(/^Clause\b/i, 'खंड')
      .replace(/^Chapter\b/i, 'अध्याय')
      .replace(/^Articles\b/i, 'अनुच्छेद')
      .replace(/^Article\b/i, 'अनुच्छेद')
      .replace(/^Section\b/i, 'धारा')
      .replace(/^Rule\b/i, 'नियम')
      .replace(/^Part\b/i, 'भाग');
  }

  return trimmed;
}

export function getNarrationStageLabel(kind: AudioSegment['kind'], lang: LanguageCode): string {
  const labels = NARRATION_LABELS[lang] ?? NARRATION_LABELS.en;
  if (kind === 'header') return labels.headerTag;
  if (kind === 'headline') return labels.headlineTag;
  if (kind === 'explanation') return labels.deepExplanation;
  return labels.contentTag;
}

export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.round(words / 2.2));
}

export interface BuildAudioQueueOptions {
  bookTitle?: LocalizedText;
  includeChapterHeader?: boolean;
}

export function buildAudioQueue(
  chapter: Chapter,
  startClauseIndex: number,
  lang: LanguageCode,
  mode: AudioMode,
  options?: BuildAudioQueueOptions
): AudioSegment[] {
  const safeStart = Math.max(0, Math.min(startClauseIndex, Math.max(0, chapter.clauses.length - 1)));
  const segments: AudioSegment[] = [];
  const labels = NARRATION_LABELS[lang] ?? NARRATION_LABELS.en;

  const shouldIncludeHeader =
    options?.includeChapterHeader !== undefined
      ? options.includeChapterHeader
      : startClauseIndex === 0;

  if (shouldIncludeHeader) {
    const bookTitleText = options?.bookTitle ? getLocalizedText(options.bookTitle, lang).trim() : '';
    const chapterNumText = localizeStructuralLabel(chapter.number, lang);
    const chapterTitleText = getLocalizedText(chapter.title, lang).trim();
    const chapterSummaryText = getLocalizedText(chapter.summary, lang).trim();

    const headerParts = [bookTitleText, chapterNumText, chapterTitleText, chapterSummaryText].filter(
      (part) => part.length > 0
    );

    if (headerParts.length > 0) {
      const spokenHeader = headerParts.join('. ');
      segments.push({
        id: `${chapter.id}-header`,
        clauseId: CHAPTER_HEADER_CLAUSE_ID,
        clauseNumber: chapterNumText || chapter.number,
        headline: chapterTitleText || labels.headerTag,
        kind: 'header',
        spokenText: spokenHeader,
        estimatedSeconds: estimateSpeechSeconds(spokenHeader),
        domTargetId: `reader-chapter-header-${chapter.id}`,
        ...(chapter.overviewAudioUrl ? { audioUrl: chapter.overviewAudioUrl } : {}),
      });
    }
  }

  for (let i = safeStart; i < chapter.clauses.length; i++) {
    const clause = chapter.clauses[i];
    const localizedClauseNum = localizeStructuralLabel(clause.number, lang);
    const headingText = clause.heading ? getLocalizedText(clause.heading, lang).trim() : '';
    const principleText = getLocalizedText(clause.principle, lang).trim();
    const clauseText = getLocalizedText(clause.text, lang).trim();
    const explanationText = getLocalizedText(clause.explanation, lang).trim();
    const realWorldText = getLocalizedText(clause.realWorldExample, lang).trim();

    const fullAudio = clause.audioAttachments?.full?.audioUrl;
    const defAudio =
      clause.audioAttachments?.definition?.audioUrl ??
      clause.audioAttachments?.text?.audioUrl ??
      fullAudio;
    const expAudio =
      clause.audioAttachments?.explanation?.audioUrl ??
      clause.audioAttachments?.purpose?.audioUrl ??
      clause.audioAttachments?.example?.audioUrl ??
      fullAudio;
    const headlineAudio = fullAudio ?? defAudio;

    // 1. Clause Headline (number + optional heading + principle)
    const headlineParts = [localizedClauseNum, headingText, principleText].filter(Boolean);
    if (headlineParts.length > 0) {
      const spokenHeadline = headlineParts.join('. ');
      segments.push({
        id: `${clause.id}-headline`,
        clauseId: clause.id,
        clauseNumber: localizedClauseNum,
        headline: principleText || headingText || localizedClauseNum,
        kind: 'headline',
        spokenText: spokenHeadline,
        estimatedSeconds: estimateSpeechSeconds(spokenHeadline),
        domTargetId: `reader-clause-headline-${clause.id}`,
        ...(headlineAudio ? { audioUrl: headlineAudio } : {}),
      });
    }

    // 2. Clause Content (primary legal / historical text)
    if ((mode === 'text' || mode === 'both') && clauseText) {
      segments.push({
        id: `${clause.id}-text`,
        clauseId: clause.id,
        clauseNumber: localizedClauseNum,
        headline: principleText || localizedClauseNum,
        kind: 'text',
        spokenText: clauseText,
        estimatedSeconds: estimateSpeechSeconds(clauseText),
        domTargetId: `reader-clause-text-${clause.id}`,
        ...(defAudio ? { audioUrl: defAudio } : {}),
      });
    }

    // 3. Clause Deep Explanation & Real-World Context
    if ((mode === 'explanation' || mode === 'both') && (explanationText || realWorldText)) {
      const explanationParts = [
        `${labels.deepExplanation}`,
        explanationText,
        realWorldText ? `${labels.realWorldContext}: ${realWorldText}` : '',
      ].filter(Boolean);
      const spokenExplanation = explanationParts.join('. ');
      segments.push({
        id: `${clause.id}-explanation`,
        clauseId: clause.id,
        clauseNumber: localizedClauseNum,
        headline: principleText || localizedClauseNum,
        kind: 'explanation',
        spokenText: spokenExplanation,
        estimatedSeconds: estimateSpeechSeconds(spokenExplanation),
        domTargetId: `reader-clause-explanation-${clause.id}`,
        ...(expAudio ? { audioUrl: expAudio } : {}),
      });
    }
  }

  return segments.map((seg, idx) => ({
    ...seg,
    orderIndex: idx,
  }));
}

export function calculatePlanProgress(
  plan: ReadingPlan,
  completedDayIds: string[]
): { completedCount: number; totalCount: number; percentage: number } {
  const completedSet = new Set(completedDayIds);
  const totalCount = plan.days.length;
  const completedCount = plan.days.filter((day) => completedSet.has(day.id)).length;
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  return { completedCount, totalCount, percentage };
}

export function toggleHighlightInMap(
  highlights: Record<string, ClauseHighlight>,
  bookId: string,
  chapterId: string,
  clauseId: string,
  color: HighlightColor | null
): Record<string, ClauseHighlight> {
  const key = getClauseKey(bookId, chapterId, clauseId);
  const next = { ...highlights };

  if (color === null || next[key]?.color === color) {
    delete next[key];
  } else {
    next[key] = {
      clauseKey: key,
      bookId,
      chapterId,
      clauseId,
      color,
      updatedAt: new Date().toISOString(),
    };
  }

  return next;
}

export function validateNewBookInput(input: NewBookFormInput): ValidationResult {
  const errors: Partial<Record<keyof NewBookFormInput, string>> = {};

  if (!input.title.trim()) {
    errors.title = 'Book title is required.';
  } else if (input.title.trim().length < 3 || input.title.trim().length > 160) {
    errors.title = 'Book title must be between 3 and 160 characters.';
  }

  if (!input.jurisdiction.trim() || input.jurisdiction.trim().length < 2) {
    errors.jurisdiction = 'Jurisdiction or legal domain is required.';
  } else if (input.jurisdiction.trim().length > 120) {
    errors.jurisdiction = 'Jurisdiction must be 120 characters or fewer.';
  }

  if (!input.chapterTitle.trim() || input.chapterTitle.trim().length < 2) {
    errors.chapterTitle = 'First chapter or part title is required.';
  } else if (input.chapterTitle.trim().length > 160) {
    errors.chapterTitle = 'Chapter title must be 160 characters or fewer.';
  }

  if (!input.clauseNumber.trim()) {
    errors.clauseNumber = 'Article or section number is required.';
  } else if (input.clauseNumber.trim().length > 60) {
    errors.clauseNumber = 'Article number must be 60 characters or fewer.';
  }

  if (!input.clauseTextEn.trim() || input.clauseTextEn.trim().length < 15) {
    errors.clauseTextEn = 'Legal text must be at least 15 characters.';
  } else if (input.clauseTextEn.trim().length > 4000) {
    errors.clauseTextEn = 'Legal text must be 4,000 characters or fewer.';
  }

  if (!input.explanationEn.trim() || input.explanationEn.trim().length < 15) {
    errors.explanationEn = 'Plain-language explanation must be at least 15 characters.';
  } else if (input.explanationEn.trim().length > 4000) {
    errors.explanationEn = 'Explanation must be 4,000 characters or fewer.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function createCustomBook(input: NewBookFormInput, nowMs: number = Date.now()): LawBook {
  const slug = input.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const bookId = sanitizeDocId(`custom-${slug || 'statute'}-${nowMs}`);
  const chapterId = `${bookId}-ch1`;
  const clauseId = `${bookId}-cl1`;

  const localizedText: LocalizedText = {
    en: input.clauseTextEn.trim().slice(0, 4000),
    ...(input.clauseTextTe?.trim() ? { te: input.clauseTextTe.trim().slice(0, 4000) } : {}),
    ...(input.clauseTextHi?.trim() ? { hi: input.clauseTextHi.trim().slice(0, 4000) } : {}),
    ...(input.clauseTextEs?.trim() ? { es: input.clauseTextEs.trim().slice(0, 4000) } : {}),
    ...(input.clauseTextFr?.trim() ? { fr: input.clauseTextFr.trim().slice(0, 4000) } : {}),
    ...(input.clauseTextAr?.trim() ? { ar: input.clauseTextAr.trim().slice(0, 4000) } : {}),
  };

  const localizedExplanation: LocalizedText = {
    en: input.explanationEn.trim().slice(0, 4000),
    ...(input.explanationTe?.trim() ? { te: input.explanationTe.trim().slice(0, 4000) } : {}),
    ...(input.explanationHi?.trim() ? { hi: input.explanationHi.trim().slice(0, 4000) } : {}),
    ...(input.explanationEs?.trim() ? { es: input.explanationEs.trim().slice(0, 4000) } : {}),
    ...(input.explanationFr?.trim() ? { fr: input.explanationFr.trim().slice(0, 4000) } : {}),
    ...(input.explanationAr?.trim() ? { ar: input.explanationAr.trim().slice(0, 4000) } : {}),
  };

  const tones: LawBook['coverTone'][] = ['cobalt', 'sapphire', 'slate', 'emerald', 'amber', 'obsidian'];
  const coverTone = tones[nowMs % tones.length];

  return {
    id: bookId,
    shortTitle: (input.shortTitle.trim() || input.title.trim().slice(0, 24)).slice(0, 80),
    title: { en: input.title.trim().slice(0, 160) },
    subtitle: {
      en: `${input.jurisdiction.trim().slice(0, 120)} · Custom legal edition with multilingual audio & commentary`,
    },
    jurisdiction: input.jurisdiction.trim().slice(0, 120),
    year: (input.year.trim() || String(new Date().getFullYear())).slice(0, 32),
    category: input.category,
    coverTone,
    isUserAdded: true,
    chapters: [
      {
        id: chapterId,
        number: 'Chapter 1',
        title: { en: input.chapterTitle.trim().slice(0, 160) },
        summary: { en: input.explanationEn.trim().slice(0, 140) },
        estimatedMinutes: Math.max(
          2,
          Math.ceil(estimateSpeechSeconds(input.clauseTextEn + ' ' + input.explanationEn) / 60)
        ),
        clauses: [
          {
            id: clauseId,
            number: input.clauseNumber.trim().slice(0, 60),
            principle: { en: (input.principle.trim() || 'Core Legal Provision').slice(0, 120) },
            text: localizedText,
            explanation: localizedExplanation,
            realWorldExample: {
              en:
                input.realWorldExampleEn.trim().slice(0, 500) ||
                'Applied by courts and citizens within this jurisdiction to clarify rights and duties.',
            },
          },
        ],
      },
    ],
  };
}

export function formatDurationSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
