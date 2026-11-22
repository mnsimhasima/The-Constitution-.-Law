import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS, INITIAL_READING_PLANS } from '../data/booksData';
import {
  buildAudioQueue,
  calculatePlanProgress,
  CHAPTER_HEADER_CLAUSE_ID,
  createCustomBook,
  formatDurationSeconds,
  getClauseKey,
  getLocalizedText,
  isRtlLanguage,
  localizeStructuralLabel,
  sanitizeDocId,
  searchLibrary,
  toggleHighlightInMap,
  validateNewBookInput,
} from './libraryLogic';

test('getLocalizedText resolves Telugu and falls back cleanly to English', () => {
  const sample = { en: 'Equality', te: 'సమానత్వం', ar: 'المساواة' };
  assert.equal(getLocalizedText(sample, 'te'), 'సమానత్వం');
  assert.equal(getLocalizedText(sample, 'ar'), 'المساواة');
  assert.equal(getLocalizedText(sample, 'hi'), 'Equality');
  assert.equal(isRtlLanguage('ar'), true);
  assert.equal(isRtlLanguage('te'), false);
});

test('localizeStructuralLabel translates Clause, Chapter, Article, Section labels into Telugu', () => {
  assert.equal(localizeStructuralLabel('Clause 39', 'te'), 'నిబంధన 39');
  assert.equal(localizeStructuralLabel('Clauses 39–40', 'te'), 'నిబంధనలు 39–40');
  assert.equal(localizeStructuralLabel('Chapter 1', 'te'), 'అధ్యాయం 1');
  assert.equal(localizeStructuralLabel('Article 21', 'te'), 'ఆర్టికల్ 21');
  assert.equal(localizeStructuralLabel('Clause 39', 'en'), 'Clause 39');
});

test('searchLibrary finds Dr. Ambedkar history book and Law Handbook in English and Telugu', () => {
  const historyBooks = searchLibrary(INITIAL_LAW_BOOKS, '', 'history', 'en');
  assert.equal(historyBooks.length, 1);
  assert.equal(historyBooks[0].id, 'ambedkar-constitutional-history');

  const teluguAmbedkar = searchLibrary(INITIAL_LAW_BOOKS, 'అంబేద్కర్', 'all', 'te');
  assert.ok(teluguAmbedkar.some((b) => b.id === 'ambedkar-constitutional-history'));

  const teluguLaw = searchLibrary(INITIAL_LAW_BOOKS, 'వినియోగదారుల', 'statutory', 'te');
  assert.ok(teluguLaw.some((b) => b.id === 'indian-law-handbook'));
});

test('buildAudioQueue plays Magna Carta in Telugu from top headline & summary through Clause 39, Clause 40, and deep explanations', () => {
  const magnaCarta = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaCarta);
  const chapter = magnaCarta.chapters[0];

  const queue = buildAudioQueue(chapter, 0, 'te', 'both', { bookTitle: magnaCarta.title });
  // 1 chapter header + 2 clauses x (headline + text + deep explanation) = 7 segments
  assert.equal(queue.length, 7);

  // Segment 0: Top Chapter Header (Book title + localized chapter number + headline + summary)
  assert.equal(queue[0].kind, 'header');
  assert.equal(queue[0].clauseId, CHAPTER_HEADER_CLAUSE_ID);
  assert.ok(queue[0].spokenText.includes('మాగ్నా కార్టా'));
  assert.ok(queue[0].spokenText.includes('చట్టబద్ధ పాలన మరియు ఆలస్యం లేని న్యాయం'));
  assert.ok(
    queue[0].spokenText.includes(
      'ఆధునిక న్యాయ ప్రక్రియకు మరియు అందరికీ అందుబాటులో ఉండే కోర్టులకు జన్మనిచ్చిన చారిత్రక జంట నిబంధనలు'
    )
  );

  // Segment 1: Clause 39 Headline
  assert.equal(queue[1].kind, 'headline');
  assert.equal(queue[1].clauseNumber, 'నిబంధన 39');
  assert.ok(queue[1].spokenText.includes('చట్టబద్ధమైన తీర్పు మరియు రూల్ ఆఫ్ లా'));

  // Segment 2: Clause 39 Content
  assert.equal(queue[2].kind, 'text');
  assert.equal(queue[2].clauseNumber, 'నిబంధన 39');
  assert.ok(queue[2].spokenText.includes('బంధించకూడదు'));

  // Segment 3: Clause 39 Deep Explanation + Real-World Context
  assert.equal(queue[3].kind, 'explanation');
  assert.ok(queue[3].spokenText.includes('సులభ మరియు లోతైన వివరణ'));
  assert.ok(queue[3].spokenText.includes('చట్టబద్ధ ప్రక్రియ'));
  assert.ok(queue[3].spokenText.includes('హెబియస్ కార్పస్'));

  // Segments 4, 5, 6: Clause 40 Headline + Content + Deep Explanation
  assert.equal(queue[4].kind, 'headline');
  assert.equal(queue[4].clauseNumber, 'నిబంధన 40');
  assert.ok(queue[4].spokenText.includes('న్యాయం అమ్మబడదు'));
  assert.equal(queue[5].kind, 'text');
  assert.ok(queue[5].spokenText.includes('ఆలస్యం చేయము'));
  assert.equal(queue[6].kind, 'explanation');
  assert.ok(queue[6].spokenText.includes('అవినీతిని నిషేధిస్తుంది'));
  assert.ok(queue[6].spokenText.includes('ఉచిత న్యాయ సహాయం'));

  // Starting mid-chapter (Clause 40 directly) skips chapter header by default
  const fromClause40 = buildAudioQueue(chapter, 1, 'te', 'both', { bookTitle: magnaCarta.title });
  assert.equal(fromClause40.length, 3);
  assert.equal(fromClause40[0].kind, 'headline');
  assert.equal(fromClause40[0].clauseNumber, 'నిబంధన 40');
});

test('calculatePlanProgress computes Ambedkar track completion accurately', () => {
  const plan = INITIAL_READING_PLANS[0];
  assert.equal(plan.id, 'plan-ambedkar-morality');
  assert.deepEqual(calculatePlanProgress(plan, []), {
    completedCount: 0,
    totalCount: 4,
    percentage: 0,
  });
  assert.deepEqual(calculatePlanProgress(plan, ['amb-day-1', 'amb-day-2']), {
    completedCount: 2,
    totalCount: 4,
    percentage: 50,
  });
});

test('toggleHighlightInMap sets, updates, and clears clause highlights', () => {
  const key = getClauseKey('india-constitution', 'in-part3', 'in-art-21');
  let map = toggleHighlightInMap({}, 'india-constitution', 'in-part3', 'in-art-21', 'amber');
  assert.equal(map[key]?.color, 'amber');
  map = toggleHighlightInMap(map, 'india-constitution', 'in-part3', 'in-art-21', 'amber');
  assert.equal(map[key], undefined);
});

test('validateNewBookInput validates bounds and createCustomBook stores Telugu text and explanations', () => {
  const invalid = validateNewBookInput({
    title: 'A',
    shortTitle: '',
    jurisdiction: '',
    year: '',
    category: 'history',
    chapterTitle: '',
    clauseNumber: '',
    principle: '',
    clauseTextEn: 'Too short',
    explanationEn: '',
    realWorldExampleEn: '',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.clauseTextEn);

  const validInput = {
    title: 'Andhra Pradesh Legal Primer',
    shortTitle: 'AP Legal Primer',
    jurisdiction: 'India · State Law',
    year: '2025',
    category: 'statutory' as const,
    chapterTitle: 'Chapter 1: Local Self-Governance',
    clauseNumber: 'Section 1',
    principle: 'Gram Sabha Empowerment',
    clauseTextEn: 'Every village assembly holds statutory authority to review local development plans and civic budgets transparently.',
    explanationEn: 'Ensures grassroots citizens participate directly in village governance and verify public spending.',
    realWorldExampleEn: 'Villagers convene in Gram Sabha meetings to approve clean-water projects.',
    clauseTextTe: 'ప్రతి గ్రామ సభ స్థానిక అభివృద్ధి ప్రణాళికలను పారదర్శకంగా సమీక్షించే చట్టపరమైన అధికారాన్ని కలిగి ఉంటుంది.',
    explanationTe: 'గ్రామీణ పౌరులు స్థానిక పాలనలో ప్రత్యక్షంగా పాల్గొనేందుకు ఈ చట్టం తోడ్పడుతుంది.',
  };

  assert.equal(validateNewBookInput(validInput).valid, true);
  const created = createCustomBook(validInput, 1700000000000);
  assert.equal(created.chapters[0].clauses[0].text.te, validInput.clauseTextTe);
  assert.equal(created.chapters[0].clauses[0].explanation.te, validInput.explanationTe);
  assert.match(created.id, /^[a-zA-Z0-9_-]+$/);
});

test('sanitizeDocId and formatDurationSeconds produce safe outputs', () => {
  assert.match(sanitizeDocId('us-const::art 1!@#'), /^[a-zA-Z0-9_-]+$/);
  assert.equal(formatDurationSeconds(125), '2:05');
});
