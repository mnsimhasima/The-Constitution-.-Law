import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import { buildLibraryFlashcards } from './legalFlashcards';
import {
  COMPLETED_CHAPTERS_STORAGE_KEY,
  QUIZ_HISTORY_STORAGE_KEY,
  applyQuizResultsToMastery,
  buildQuizContextFromBook,
  generateQuizQuestions,
  getBestQuizScore,
  getChapterCompletionKey,
  loadCompletedChaptersFromStorage,
  loadQuizHistoryFromStorage,
  saveCompletedChaptersToStorage,
  saveQuizHistoryToStorage,
  scoreQuizAttempt,
} from './legalQuiz';

test('generateQuizQuestions produces 4 unique options per question and prioritizes chapter-linked flashcards', () => {
  const cards = buildLibraryFlashcards(INITIAL_LAW_BOOKS);
  const context = buildQuizContextFromBook(
    INITIAL_LAW_BOOKS,
    'magna-carta',
    'mc-rule-of-law',
    'en'
  );
  assert.ok(context);

  const questions = generateQuizQuestions(cards, {
    language: 'en',
    questionCount: 5,
    context,
    seed: 42,
  });

  assert.equal(questions.length, 5);
  // First question must prioritize the Magna Carta flashcard linked to this chapter
  assert.equal(questions[0]?.sourceBookId, 'magna-carta');

  for (const q of questions) {
    assert.equal(q.options.length, 4);
    const uniqueCardIds = new Set(q.options.map((o) => o.cardId));
    assert.equal(uniqueCardIds.size, 4);
    const correctMatches = q.options.filter((o) => o.id === q.correctOptionId);
    assert.equal(correctMatches.length, 1);
    assert.equal(correctMatches[0]?.cardId, q.cardId);
  }
});

test('generateQuizQuestions localizes prompts, choices, and explanations in Telugu', () => {
  const cards = buildLibraryFlashcards(INITIAL_LAW_BOOKS);
  const questions = generateQuizQuestions(cards, {
    language: 'te',
    questionCount: 3,
    seed: 99,
  });

  assert.equal(questions.length, 3);
  assert.ok(/[\u0C00-\u0C7F]/.test(questions[0].prompt));
  assert.ok(/[\u0C00-\u0C7F]/.test(questions[0].explanation));
  assert.ok(questions[0].options.every((opt) => /[\u0C00-\u0C7F]/.test(opt.text)));
});

test('scoreQuizAttempt and applyQuizResultsToMastery compute accuracy and sync flashcard mastery immutably', () => {
  const cards = buildLibraryFlashcards(INITIAL_LAW_BOOKS);
  const questions = generateQuizQuestions(cards, {
    language: 'en',
    questionCount: 4,
    seed: 7,
  });

  const answers: Record<string, string> = {};
  questions.forEach((q, idx) => {
    if (idx < 3) {
      answers[q.id] = q.correctOptionId;
    } else {
      const wrong = q.options.find((o) => o.id !== q.correctOptionId)!;
      answers[q.id] = wrong.id;
    }
  });

  const summary = scoreQuizAttempt(questions, answers, {
    contextLabel: 'Indian Constitution · Part III',
    bookId: 'india-constitution',
    chapterId: 'in-part3',
    nowIso: '2026-11-22T12:00:00.000Z',
  });

  assert.equal(summary.correctCount, 3);
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.accuracyPercent, 75);
  assert.equal(summary.ratingLabel, 'Strong Command');
  assert.equal(summary.correctCardIds.length, 3);
  assert.equal(summary.missedCardIds.length, 1);

  const initialMastery = { [questions[3].cardId]: 'mastered' as const };
  const nextMastery = applyQuizResultsToMastery(initialMastery, summary);
  assert.equal(initialMastery[questions[3].cardId], 'mastered');
  assert.equal(nextMastery[questions[0].cardId], 'mastered');
  assert.equal(nextMastery[questions[3].cardId], 'review');
});

test('quiz history and completed chapters storage helpers round-trip and sanitize invalid entries', () => {
  const map = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };

  const history = [
    {
      id: 'quiz-1',
      completedAt: '2026-11-22T12:00:00.000Z',
      contextLabel: 'Magna Carta',
      bookId: 'magna-carta',
      chapterId: 'mc-rule-of-law',
      correctCount: 4,
      totalCount: 5,
      accuracyPercent: 80,
      ratingLabel: 'Strong Command',
      correctCardIds: ['fc-due-process'],
      missedCardIds: ['fc-habeas-corpus'],
    },
  ];

  saveQuizHistoryToStorage(history, mockStorage);
  const loadedHistory = loadQuizHistoryFromStorage(mockStorage);
  assert.equal(loadedHistory.length, 1);
  assert.equal(getBestQuizScore(loadedHistory), 80);

  map.set(QUIZ_HISTORY_STORAGE_KEY, '{corrupt');
  assert.deepEqual(loadQuizHistoryFromStorage(mockStorage), []);

  const key = getChapterCompletionKey('magna-carta', 'mc-rule-of-law');
  const completed = {
    [key]: {
      chapterKey: key,
      bookId: 'magna-carta',
      chapterId: 'mc-rule-of-law',
      completedAt: '2026-11-22T12:05:00.000Z',
    },
  };
  saveCompletedChaptersToStorage(completed, mockStorage);
  const loadedCompleted = loadCompletedChaptersFromStorage(mockStorage);
  assert.equal(loadedCompleted[key]?.bookId, 'magna-carta');

  map.set(COMPLETED_CHAPTERS_STORAGE_KEY, 'not-json');
  assert.deepEqual(loadCompletedChaptersFromStorage(mockStorage), {});
});
