import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_LAW_BOOKS } from '../data/booksData';
import {
  buildClauseSharePayload,
  buildQuoteCardFilename,
  buildShareCaption,
  buildSocialPlatformLinks,
  resolveCardThemeFromHighlight,
  wrapCanvasTextLines,
} from './quoteShareCard';

test('buildClauseSharePayload resolves localized Telugu & English clauses and builds clean deep link', () => {
  const magnaBook = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaBook);
  const chapter = magnaBook.chapters[0];
  const clause39 = chapter.clauses[0];

  const payloadTe = buildClauseSharePayload({
    book: magnaBook,
    chapter,
    clause: clause39,
    language: 'te',
    highlightColor: 'amber',
    includeExplanation: true,
    originUrl: 'https://constitution.example.org/',
  });

  assert.equal(payloadTe.clauseNumber, 'నిబంధన 39');
  assert.ok(payloadTe.quoteText.length > 10);
  assert.ok(payloadTe.shareUrl.includes('book=magna-carta'));
  assert.ok(payloadTe.shareUrl.includes(`clause=${clause39.id}`));
  assert.ok(payloadTe.shareUrl.includes('lang=te'));
  assert.equal(resolveCardThemeFromHighlight('amber'), 'parchment');
  assert.equal(resolveCardThemeFromHighlight('sky'), 'indigo');
  assert.equal(resolveCardThemeFromHighlight(undefined), 'indigo');
});

test('buildShareCaption respects max length and custom quote excerpts', () => {
  const magnaBook = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaBook);
  const chapter = magnaBook.chapters[0];
  const clause40 = chapter.clauses[1];

  const payload = buildClauseSharePayload({
    book: magnaBook,
    chapter,
    clause: clause40,
    language: 'en',
    customQuote: 'To no one will we sell, to no one deny or delay right or justice.',
    includeExplanation: false,
    originUrl: 'https://constitution.example.org/',
  });

  const caption = buildShareCaption(payload, 260);
  assert.ok(caption.includes('To no one will we sell'));
  assert.ok(caption.includes('Clause 40'));
  assert.ok(caption.includes('#ConstitutionAndLaw'));
  assert.ok(caption.length <= 260);

  const tightCaption = buildShareCaption(
    { ...payload, quoteText: 'A '.repeat(220) },
    180
  );
  assert.ok(tightCaption.includes('…'));
  assert.ok(tightCaption.length <= 220);
});

test('buildSocialPlatformLinks generates valid encoded HTTPS share links for 5 social platforms', () => {
  const magnaBook = INITIAL_LAW_BOOKS.find((b) => b.id === 'magna-carta');
  assert.ok(magnaBook);
  const chapter = magnaBook.chapters[0];
  const clause39 = chapter.clauses[0];

  const payload = buildClauseSharePayload({
    book: magnaBook,
    chapter,
    clause: clause39,
    language: 'en',
    originUrl: 'https://constitution.example.org/',
  });

  const links = buildSocialPlatformLinks(payload);
  assert.equal(links.length, 5);
  assert.deepEqual(
    links.map((l) => l.id),
    ['x', 'whatsapp', 'linkedin', 'facebook', 'telegram']
  );

  for (const link of links) {
    assert.ok(link.href.startsWith('https://'), `${link.id} should be HTTPS`);
    assert.ok(
      link.href.includes(encodeURIComponent('book=magna-carta')),
      `${link.id} should carry encoded deep link`
    );
  }

  assert.equal(buildQuoteCardFilename(payload), 'magna-carta-clause-39-card.png');
});

test('wrapCanvasTextLines wraps text cleanly and applies ellipsis on maxLines overflow', () => {
  const charMeasure = (s: string) => s.length * 10;
  const wrapped = wrapCanvasTextLines(
    'No free man shall be seized or imprisoned except by the lawful judgment of his equals or by the law of the land.',
    220,
    charMeasure,
    3
  );

  assert.equal(wrapped.length, 3);
  assert.ok(wrapped[2].endsWith('…'));
  for (const line of wrapped) {
    assert.ok(charMeasure(line) <= 230);
  }
});
