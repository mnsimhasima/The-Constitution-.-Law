import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import type { ClauseNote } from '../types/library';
import {
  buildChapterExportDocument,
  containsNonLatinText,
  createStyledChapterPdf,
  paginateExportBlocks,
  sanitizeExportFilename,
} from './chapterPdfExporter';

test('sanitizeExportFilename produces safe, deterministic PDF filenames', () => {
  assert.equal(
    sanitizeExportFilename('Dr. Ambedkar History', 'Chapter 1', 'en'),
    'dr-ambedkar-history-chapter-1-en.pdf'
  );
  assert.equal(
    sanitizeExportFilename('Civil & Tort Law', 'Chapter 2: Writs', 'te'),
    'civil-tort-law-chapter-2-writs-te.pdf'
  );
});

test('containsNonLatinText distinguishes Latin vs Telugu/Hindi/Arabic text', () => {
  assert.equal(containsNonLatinText('Article 21 — Protection of Life & Personal Liberty.'), false);
  assert.equal(containsNonLatinText('భారత రాజ్యాంగం ఆర్టికల్ 21'), true);
  assert.equal(containsNonLatinText('भारतीय संविधान अनुच्छेद 21'), true);
});

test('buildChapterExportDocument respects include toggles, notes, parallel language, and builds valid vector PDF bytes', () => {
  const book = INITIAL_LAW_BOOKS[0];
  const chapter = book.chapters[0];
  const sampleNote: ClauseNote = {
    id: 'n-1',
    clauseKey: `${book.id}::${chapter.id}::${chapter.clauses[0].id}`,
    bookId: book.id,
    chapterId: chapter.id,
    clauseId: chapter.clauses[0].id,
    content: 'Key precedent for constitutional equality study.',
    updatedAt: '2026-11-22T10:00:00.000Z',
  };

  const fullDoc = buildChapterExportDocument({
    book,
    chapter,
    language: 'en',
    languageName: 'English',
    compareLanguageName: 'Español',
    notes: [sampleNote],
    options: {
      paperSize: 'a4',
      includeExplanations: true,
      includeRealWorldExamples: true,
      includeParallelLanguage: true,
      compareLanguage: 'es',
      includeStudyNotes: true,
    },
    now: new Date('2026-11-22T10:00:00.000Z'),
  });

  assert.equal(fullDoc.clauses.length, chapter.clauses.length);
  assert.ok(fullDoc.clauses[0].explanation && fullDoc.clauses[0].explanation.length > 20);
  assert.ok(fullDoc.clauses[0].realWorldExample && fullDoc.clauses[0].realWorldExample.length > 20);
  assert.ok(fullDoc.clauses[0].parallelText && fullDoc.clauses[0].parallelText.length > 20);
  assert.deepEqual(fullDoc.clauses[0].studyNotes, [
    'Key precedent for constitutional equality study.',
  ]);
  assert.ok(fullDoc.wordCount > 100);
  assert.ok(fullDoc.estimatedPages >= 1);

  // Verify jsPDF produces valid PDF output bytes starting with %PDF-
  const pdf = createStyledChapterPdf(fullDoc);
  const rawOutput = pdf.output();
  assert.ok(rawOutput.startsWith('%PDF-'));
  assert.ok(pdf.getNumberOfPages() >= 1);

  // Minimal legal text only (toggles off)
  const minimalDoc = buildChapterExportDocument({
    book,
    chapter,
    language: 'en',
    languageName: 'English',
    notes: [sampleNote],
    options: {
      paperSize: 'letter',
      includeExplanations: false,
      includeRealWorldExamples: false,
      includeParallelLanguage: false,
      includeStudyNotes: false,
    },
  });

  assert.equal(minimalDoc.clauses[0].explanation, undefined);
  assert.equal(minimalDoc.clauses[0].realWorldExample, undefined);
  assert.equal(minimalDoc.clauses[0].parallelText, undefined);
  assert.deepEqual(minimalDoc.clauses[0].studyNotes, []);
  assert.ok(minimalDoc.wordCount < fullDoc.wordCount);
});

test('paginateExportBlocks splits content cleanly without exceeding page line capacity', () => {
  const blocks = Array.from({ length: 7 }, (_, i) => ({
    kind: 'body' as const,
    lines: [`Line A-${i}`, `Line B-${i}`, `Line C-${i}`],
  }));

  const pages = paginateExportBlocks(blocks, 9);
  assert.equal(pages.length, 4);
  assert.equal(pages[0].length, 2);
  assert.equal(pages[3].length, 1);
});
