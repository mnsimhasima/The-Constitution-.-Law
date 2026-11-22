import type { BookCategory, LanguageCode, LawBook } from '../types/library';
import type { FlashcardMastery, FlashcardTopic, LegalFlashcard } from './legalFlashcards';
import { shuffleFlashcards } from './legalFlashcards';
import { getLocalizedText } from './libraryLogic';

export type QuizQuestionStyle = 'definition_to_term' | 'scenario_to_term' | 'term_to_definition';

export interface QuizOption {
  id: string;
  label: string;
  text: string;
  cardId: string;
}

export interface QuizQuestion {
  id: string;
  cardId: string;
  style: QuizQuestionStyle;
  styleLabel: string;
  prompt: string;
  supportingText?: string;
  citation: string;
  topicLabel: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  example: string;
  sourceBookId?: string;
  sourceChapterId?: string;
  sourceClauseId?: string;
}

export interface QuizContextTarget {
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterLabel: string;
  chapterTitle: string;
  bookCategory?: BookCategory;
}

export interface QuizAttemptSummary {
  id: string;
  completedAt: string;
  contextLabel: string;
  bookId?: string;
  chapterId?: string;
  correctCount: number;
  totalCount: number;
  accuracyPercent: number;
  ratingLabel: string;
  correctCardIds: string[];
  missedCardIds: string[];
}

export interface CompletedChapterRecord {
  chapterKey: string;
  bookId: string;
  chapterId: string;
  completedAt: string;
}

export const QUIZ_HISTORY_STORAGE_KEY = 'constitution_law_quiz_history_v1';
export const COMPLETED_CHAPTERS_STORAGE_KEY = 'constitution_law_completed_chapters_v1';
export const DEFAULT_QUIZ_QUESTION_COUNT = 5;

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const BOOK_CATEGORY_TOPICS: Record<BookCategory, readonly FlashcardTopic[]> = {
  constitutions: ['constitutional', 'rights', 'writs_doctrines'],
  history: ['constitutional', 'rights'],
  statutory: ['civil_everyday', 'writs_doctrines'],
  international: ['rights', 'constitutional'],
  custom: ['constitutional', 'rights', 'writs_doctrines', 'civil_everyday'],
};

export function getChapterCompletionKey(bookId: string, chapterId: string): string {
  return `${bookId}::${chapterId}`;
}

export function buildQuizContextFromBook(
  books: readonly LawBook[],
  bookId: string,
  chapterId: string,
  language: LanguageCode
): QuizContextTarget | null {
  const book = books.find((b) => b.id === bookId);
  if (!book) return null;
  const chapter = book.chapters.find((c) => c.id === chapterId) ?? book.chapters[0];
  if (!chapter) return null;

  return {
    bookId: book.id,
    chapterId: chapter.id,
    bookTitle: getLocalizedText(book.title, language) || book.shortTitle,
    chapterLabel: chapter.number,
    chapterTitle: getLocalizedText(chapter.title, language),
    bookCategory: book.category,
  };
}

function getCardRelevanceRank(
  card: LegalFlashcard,
  context?: QuizContextTarget | null
): number {
  if (!context) return 3;
  if (card.sourceBookId === context.bookId && card.sourceChapterId === context.chapterId) {
    return 0;
  }
  if (card.sourceBookId === context.bookId) {
    return 1;
  }
  const preferredTopics = context.bookCategory
    ? BOOK_CATEGORY_TOPICS[context.bookCategory]
    : undefined;
  if (preferredTopics && preferredTopics.includes(card.topic)) {
    return 2;
  }
  return 3;
}

export interface GenerateQuizOptions {
  language: LanguageCode;
  questionCount?: number;
  context?: QuizContextTarget | null;
  seed?: number;
}

export function generateQuizQuestions(
  cards: readonly LegalFlashcard[],
  options: GenerateQuizOptions
): QuizQuestion[] {
  if (cards.length < 2) return [];

  const { language, context, seed } = options;
  const requestedCount = Math.max(
    1,
    Math.min(options.questionCount ?? DEFAULT_QUIZ_QUESTION_COUNT, cards.length)
  );
  const baseSeed = typeof seed === 'number' ? seed : Date.now();

  // Group cards by relevance tier, shuffle inside each tier for freshness, then take top N
  const tiers: LegalFlashcard[][] = [[], [], [], []];
  for (const card of cards) {
    const rank = getCardRelevanceRank(card, context);
    tiers[rank].push(card);
  }

  const prioritizedPool = tiers.flatMap((tier, idx) =>
    shuffleFlashcards(tier, baseSeed + (idx + 1) * 97)
  );

  const selectedCards = prioritizedPool.slice(0, requestedCount);
  const styles: QuizQuestionStyle[] = [
    'definition_to_term',
    'scenario_to_term',
    'term_to_definition',
  ];

  return selectedCards.map((card, index) => {
    const style = styles[index % styles.length];
    const distractorsPool = cards.filter((c) => c.id !== card.id);
    const sameTopicDistractors = shuffleFlashcards(
      distractorsPool.filter((c) => c.topic === card.topic),
      baseSeed + index * 31 + 11
    );
    const otherDistractors = shuffleFlashcards(
      distractorsPool.filter((c) => c.topic !== card.topic),
      baseSeed + index * 31 + 29
    );

    const distractorCount = Math.min(3, distractorsPool.length);
    const chosenDistractors = [...sameTopicDistractors, ...otherDistractors].slice(
      0,
      distractorCount
    );

    const optionCards = shuffleFlashcards([card, ...chosenDistractors], baseSeed + index * 53 + 7);
    const useDefinitionAsAnswer = style === 'term_to_definition';

    const optionsList: QuizOption[] = optionCards.map((optCard, optIdx) => ({
      id: `${card.id}-opt-${optIdx}`,
      label: OPTION_LETTERS[optIdx] ?? String(optIdx + 1),
      text: useDefinitionAsAnswer
        ? getLocalizedText(optCard.definition, language)
        : getLocalizedText(optCard.term, language),
      cardId: optCard.id,
    }));

    const correctOption = optionsList.find((o) => o.cardId === card.id) ?? optionsList[0];

    const localizedTerm = getLocalizedText(card.term, language);
    const localizedDefinition = getLocalizedText(card.definition, language);
    const localizedExample = getLocalizedText(card.example, language);

    let styleLabel = 'Identify the Concept';
    let prompt = '';
    let supportingText: string | undefined;

    if (style === 'definition_to_term') {
      styleLabel = language === 'te' ? 'నిర్వచనం నుండి భావన' : 'Concept Recall';
      prompt =
        language === 'te'
          ? 'కింది నిర్వచనానికి సరిపోయే న్యాయ భావన ఏది?'
          : 'Which legal concept matches this definition?';
      supportingText = localizedDefinition;
    } else if (style === 'scenario_to_term') {
      styleLabel = language === 'te' ? 'నిజ జీవిత సందర్భం' : 'Applied Scenario';
      prompt =
        language === 'te'
          ? 'ఈ నిజ జీవిత సందర్భంలో ఏ రాజ్యాంగ లేదా న్యాయ సూత్రం వర్తిస్తుంది?'
          : 'Which legal principle applies in this real-world scenario?';
      supportingText = localizedExample;
    } else {
      styleLabel = language === 'te' ? 'అర్థం & వివరణ' : 'Definition Match';
      prompt =
        language === 'te'
          ? `“${localizedTerm}” యొక్క సరైన వివరణ ఏది?`
          : `Which statement best defines “${localizedTerm}”?`;
      supportingText = card.citation;
    }

    return {
      id: `q-${index + 1}-${card.id}`,
      cardId: card.id,
      style,
      styleLabel,
      prompt,
      supportingText,
      citation: card.citation,
      topicLabel: card.topicLabel,
      options: optionsList,
      correctOptionId: correctOption.id,
      explanation: localizedDefinition,
      example: localizedExample,
      sourceBookId: card.sourceBookId,
      sourceChapterId: card.sourceChapterId,
      sourceClauseId: card.sourceClauseId,
    };
  });
}

export function getQuizRatingLabel(accuracyPercent: number): string {
  if (accuracyPercent >= 90) return 'Constitutional Scholar';
  if (accuracyPercent >= 70) return 'Strong Command';
  if (accuracyPercent >= 50) return 'Solid Progress';
  return 'Keep Practicing';
}

export function scoreQuizAttempt(
  questions: readonly QuizQuestion[],
  selectedAnswers: Readonly<Record<string, string>>,
  meta: {
    contextLabel: string;
    bookId?: string;
    chapterId?: string;
    nowIso?: string;
  }
): QuizAttemptSummary {
  const correctCardIds: string[] = [];
  const missedCardIds: string[] = [];

  for (const q of questions) {
    const chosenId = selectedAnswers[q.id];
    if (chosenId && chosenId === q.correctOptionId) {
      correctCardIds.push(q.cardId);
    } else {
      missedCardIds.push(q.cardId);
    }
  }

  const totalCount = questions.length;
  const correctCount = correctCardIds.length;
  const accuracyPercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const completedAt = meta.nowIso ?? new Date().toISOString();

  return {
    id: `quiz-${Date.parse(completedAt) || Date.now()}`,
    completedAt,
    contextLabel: meta.contextLabel,
    bookId: meta.bookId,
    chapterId: meta.chapterId,
    correctCount,
    totalCount,
    accuracyPercent,
    ratingLabel: getQuizRatingLabel(accuracyPercent),
    correctCardIds,
    missedCardIds,
  };
}

export function applyQuizResultsToMastery(
  existingMastery: Readonly<Record<string, FlashcardMastery>>,
  summary: Pick<QuizAttemptSummary, 'correctCardIds' | 'missedCardIds'>
): Record<string, FlashcardMastery> {
  const next: Record<string, FlashcardMastery> = { ...existingMastery };
  for (const cardId of summary.correctCardIds) {
    next[cardId] = 'mastered';
  }
  for (const cardId of summary.missedCardIds) {
    next[cardId] = 'review';
  }
  return next;
}

export function getBestQuizScore(history: readonly QuizAttemptSummary[]): number | null {
  if (history.length === 0) return null;
  return history.reduce((best, item) => Math.max(best, item.accuracyPercent), 0);
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadQuizHistoryFromStorage(storage?: StorageLike | null): QuizAttemptSummary[] {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return [];
  try {
    const raw = target.getItem(QUIZ_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is QuizAttemptSummary =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as QuizAttemptSummary).id === 'string' &&
          typeof (item as QuizAttemptSummary).accuracyPercent === 'number' &&
          typeof (item as QuizAttemptSummary).totalCount === 'number'
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveQuizHistoryToStorage(
  history: readonly QuizAttemptSummary[],
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(QUIZ_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
  } catch {
    // Ignore storage write errors
  }
}

export function loadCompletedChaptersFromStorage(
  storage?: StorageLike | null
): Record<string, CompletedChapterRecord> {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return {};
  try {
    const raw = target.getItem(COMPLETED_CHAPTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const sanitized: Record<string, CompletedChapterRecord> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        val &&
        typeof val === 'object' &&
        typeof (val as CompletedChapterRecord).bookId === 'string' &&
        typeof (val as CompletedChapterRecord).chapterId === 'string'
      ) {
        const rec = val as CompletedChapterRecord;
        sanitized[key] = {
          chapterKey: key,
          bookId: rec.bookId,
          chapterId: rec.chapterId,
          completedAt: typeof rec.completedAt === 'string' ? rec.completedAt : new Date().toISOString(),
        };
      }
    }
    return sanitized;
  } catch {
    return {};
  }
}

export function saveCompletedChaptersToStorage(
  completed: Readonly<Record<string, CompletedChapterRecord>>,
  storage?: StorageLike | null
): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return;
  try {
    target.setItem(COMPLETED_CHAPTERS_STORAGE_KEY, JSON.stringify(completed));
  } catch {
    // Ignore storage write errors
  }
}
