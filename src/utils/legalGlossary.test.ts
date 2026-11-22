import assert from 'node:assert/strict';
import test from 'node:test';
import type { OttGlossaryTerm } from '../types/ott';
import {
  extractMatchedGlossaryTerms,
  filterGlossaryTerms,
  getGlossaryCategories,
  tokenizeTextWithGlossary,
} from './legalGlossary';

const SAMPLE_TERMS: OttGlossaryTerm[] = [
  {
    id: 'gl-writ',
    term: 'Writs',
    aliases: ['Writ'],
    category: 'Judicial Remedy',
    simpleDefinition: 'Formal court orders enforcing fundamental rights.',
    citation: 'Articles 32 & 226',
    masterBookId: 'mb-constitution-india',
    masterBookTitle: 'Constitution of India',
  },
  {
    id: 'gl-mandamus',
    term: 'Mandamus',
    aliases: ['Writ of Mandamus'],
    category: 'Judicial Remedy',
    simpleDefinition: 'A court command compelling an official to perform a statutory duty.',
    citation: 'Articles 32 & 226',
    masterBookId: 'mb-constitution-india',
    masterBookTitle: 'Constitution of India',
  },
  {
    id: 'gl-habeas-corpus',
    term: 'Habeas Corpus',
    category: 'Judicial Remedy',
    simpleDefinition: 'An order requiring officials to justify a person’s detention before a judge.',
    citation: 'Articles 32 & 226',
    masterBookId: 'mb-constitution-india',
    masterBookTitle: 'Constitution of India',
  },
  {
    id: 'gl-constitutional-morality',
    term: 'Constitutional Morality',
    category: 'Constitutional',
    simpleDefinition: 'Fidelity to constitutional values of equality, dignity, and fairness.',
    citation: 'Constituent Assembly Debates',
    masterBookId: 'mb-constitutional-duties-charter',
    masterBookTitle: 'Directive Principles & Fundamental Duties Charter',
  },
  {
    id: 'gl-barrister',
    term: 'Barrister-at-Law',
    category: 'Statutory & Civic',
    simpleDefinition: 'Senior legal qualification earned at the Inns of Court in London.',
    masterBookId: 'mb-constitutional-duties-charter',
    masterBookTitle: 'Directive Principles & Fundamental Duties Charter',
  },
];

test('tokenizeTextWithGlossary matches longest multi-word phrases and aliases without partial-word false positives', () => {
  const prose =
    'A written petition may seek a Writ of Mandamus or Habeas Corpus under Constitutional Morality, as a Barrister-at-Law argued.';
  const segments = tokenizeTextWithGlossary(prose, SAMPLE_TERMS);

  const matched = segments.filter((s) => s.type === 'term');
  assert.deepEqual(
    matched.map((m) => ({ value: m.value, id: m.entry.id })),
    [
      { value: 'Writ of Mandamus', id: 'gl-mandamus' },
      { value: 'Habeas Corpus', id: 'gl-habeas-corpus' },
      { value: 'Constitutional Morality', id: 'gl-constitutional-morality' },
      { value: 'Barrister-at-Law', id: 'gl-barrister' },
    ]
  );

  // "written" must NOT falsely match the shorter alias "Writ"
  assert.equal(segments[0].type, 'text');
  assert.ok(segments[0].value.includes('written petition'));

  // Reassembling all segments reproduces the exact original string character-for-character
  assert.equal(
    segments.map((s) => s.value).join(''),
    prose
  );
});

test('extractMatchedGlossaryTerms deduplicates entries and counts occurrences across chapter blocks', () => {
  const texts = [
    'High Courts issue Writs such as Habeas Corpus and Mandamus.',
    'A citizen seeking a Writ of Mandamus relies on Constitutional Morality.',
  ];

  const found = extractMatchedGlossaryTerms(texts, SAMPLE_TERMS);
  assert.equal(found.length, 4);

  const mandamus = found.find((f) => f.entry.id === 'gl-mandamus');
  assert.ok(mandamus);
  assert.equal(mandamus.occurrences, 2);
  assert.deepEqual(new Set(mandamus.matchedForms), new Set(['Mandamus', 'Writ of Mandamus']));
});

test('filterGlossaryTerms filters by search query across citations/definitions and by category', () => {
  const byCategory = filterGlossaryTerms(SAMPLE_TERMS, '', 'Constitutional');
  assert.equal(byCategory.length, 1);
  assert.equal(byCategory[0].id, 'gl-constitutional-morality');

  const byCitation = filterGlossaryTerms(SAMPLE_TERMS, '226', 'All');
  assert.equal(byCitation.length, 3);

  const byAlias = filterGlossaryTerms(SAMPLE_TERMS, 'writ of mandamus', 'All');
  assert.equal(byAlias.length, 1);
  assert.equal(byAlias[0].id, 'gl-mandamus');

  const categories = getGlossaryCategories(SAMPLE_TERMS);
  assert.deepEqual(categories, ['Judicial Remedy', 'Constitutional', 'Statutory & Civic']);
});
