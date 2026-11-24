import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClauseAudioAttachment,
  buildContentAudioDocId,
  CONTENT_AUDIO_ID_PATTERN,
  findAudioMetadataForNode,
  formatAudioDurationLabel,
  formatAudioFileSize,
  inferContentNodeType,
  mapOttBlockRoleToContentRole,
  MAX_CONTENT_AUDIO_BYTES,
  sanitizeContentAudioMetadataRecord,
  validateContentAudioFile,
} from './contentAudioMetadata';

test('inferContentNodeType accurately distinguishes articles, sections, and clauses', () => {
  assert.equal(inferContentNodeType('Article 21A'), 'article');
  assert.equal(inferContentNodeType('Art. 14'), 'article');
  assert.equal(inferContentNodeType('अनुच्छेद 32'), 'article');
  assert.equal(inferContentNodeType('Section 7(1)'), 'section');
  assert.equal(inferContentNodeType('Sec. 35'), 'section');
  assert.equal(inferContentNodeType('Topic 1.1'), 'topic');
  assert.equal(inferContentNodeType('Clause 39'), 'clause');
});

test('buildContentAudioDocId generates deterministic Firestore-safe IDs within 128 chars', () => {
  const id = buildContentAudioDocId(
    'cms_books',
    'rte-sec-3/sub:1',
    'explanation',
    'te'
  );
  assert.equal(id, 'cam-cms-rte-sec-3-sub-1-explanation-te');
  assert.ok(CONTENT_AUDIO_ID_PATTERN.test(id));
  assert.ok(id.length <= 128);

  const longId = buildContentAudioDocId('ott_catalog', 'x'.repeat(200), 'full', 'kn');
  assert.ok(longId.length <= 128);
  assert.ok(CONTENT_AUDIO_ID_PATTERN.test(longId));
});

test('validateContentAudioFile enforces allowed MIME types and 10MB size ceiling', () => {
  const validWav = validateContentAudioFile({
    name: 'article-21.wav',
    type: 'audio/wav',
    size: 48_044,
  });
  assert.equal(validWav.valid, true);
  assert.equal(validWav.normalizedMime, 'audio/wav');

  // Extension fallback when browser omits MIME type
  const validExtFallback = validateContentAudioFile({
    name: 'section-6.mp3',
    type: '',
    size: 120_000,
  });
  assert.equal(validExtFallback.valid, true);
  assert.equal(validExtFallback.normalizedMime, 'audio/mpeg');

  const invalidHtml = validateContentAudioFile({
    name: 'payload.html',
    type: 'text/html',
    size: 512,
  });
  assert.equal(invalidHtml.valid, false);

  const emptyFile = validateContentAudioFile({
    name: 'empty.wav',
    type: 'audio/wav',
    size: 0,
  });
  assert.equal(emptyFile.valid, false);

  const oversized = validateContentAudioFile({
    name: 'huge.mp3',
    type: 'audio/mpeg',
    size: MAX_CONTENT_AUDIO_BYTES + 1,
  });
  assert.equal(oversized.valid, false);
});

test('sanitizeContentAudioMetadataRecord enforces firebase-blueprint.json boundaries verbatim', () => {
  const sanitized = sanitizeContentAudioMetadataRecord({
    id: 'bad id with spaces!!!',
    contentSource: 'cms_books',
    bookId: 'b'.repeat(200),
    bookTitle: 'T'.repeat(250),
    editionId: '',
    chapterId: 'ch-1',
    chapterTitle: 'Chapter 1',
    contentNodeId: 'art-21',
    contentNodeType: 'article',
    contentNodeNumber: 'Article 21 ' + '9'.repeat(100),
    contentNodeTitle: 'Protection of Life and Personal Liberty',
    blockRole: 'explanation',
    language: 'hi',
    narrator: 'Studio Narrator ' + 'N'.repeat(150),
    fileName: 'audio-' + 'f'.repeat(250) + '.wav',
    mimeType: 'audio/wav; codecs=1',
    byteSize: MAX_CONTENT_AUDIO_BYTES * 2,
    durationSec: 999999,
    durationLabel: '',
    audioUrl: '/api/books-structures/audio/aud-123456',
    assetId: 'aud-123456',
    sha256Checksum: 'abc123',
    status: 'published',
    uploadedByUid: 'uid@bad spaces',
    uploadedByEmail: 'mnsimhasima@gmail.com',
  });

  assert.ok(CONTENT_AUDIO_ID_PATTERN.test(sanitized.id));
  assert.ok(CONTENT_AUDIO_ID_PATTERN.test(sanitized.uploadedByUid));
  assert.equal(sanitized.bookId.length, 128);
  assert.equal(sanitized.bookTitle.length, 160);
  assert.equal(sanitized.contentNodeNumber.length, 60);
  assert.equal(sanitized.narrator.length, 120);
  assert.equal(sanitized.fileName.length, 200);
  assert.equal(sanitized.mimeType, 'audio/wav');
  assert.equal(sanitized.byteSize, MAX_CONTENT_AUDIO_BYTES);
  assert.equal(sanitized.durationSec, 86400);
  assert.equal(formatAudioDurationLabel(95), '01:35');
  assert.equal(formatAudioFileSize(48 * 1024), '48.0 KB');
});

test('findAudioMetadataForNode, buildClauseAudioAttachment, and mapOttBlockRoleToContentRole link nodes cleanly', () => {
  assert.equal(mapOttBlockRoleToContentRole('unit_definition'), 'definition');
  assert.equal(mapOttBlockRoleToContentRole('unit_purpose'), 'purpose');
  assert.equal(mapOttBlockRoleToContentRole('unit_explanation'), 'explanation');
  assert.equal(mapOttBlockRoleToContentRole('unit_examples'), 'example');
  assert.equal(mapOttBlockRoleToContentRole('unit_full'), 'full');

  const recA = sanitizeContentAudioMetadataRecord({
    id: 'cam-cms-sec-3-full-en',
    contentSource: 'cms_books',
    bookId: 'rte-act-2009',
    bookTitle: 'RTE Act 2009',
    editionId: '',
    chapterId: 'rte-ch-2',
    chapterTitle: 'Right to Free and Compulsory Education',
    contentNodeId: 'rte-sec-3',
    contentNodeType: 'section',
    contentNodeNumber: 'Section 3',
    contentNodeTitle: 'Neighborhood Elementary School Guarantee',
    blockRole: 'full',
    language: 'en',
    narrator: 'Studio Voice',
    fileName: 'section-3-full.wav',
    mimeType: 'audio/wav',
    byteSize: 48044,
    durationSec: 42,
    durationLabel: '00:42',
    audioUrl: '/api/books-structures/audio/aud-abc123',
    assetId: 'aud-abc123',
    sha256Checksum: 'deadbeef',
    status: 'published',
    uploadedByUid: 'admin-1',
    uploadedByEmail: 'mnsimhasima@gmail.com',
  });

  const recB = sanitizeContentAudioMetadataRecord({
    ...recA,
    id: 'cam-cms-sec-3-explanation-te',
    blockRole: 'explanation',
    language: 'te',
    fileName: 'section-3-meaning-te.wav',
  });

  const matchesAll = findAudioMetadataForNode([recA, recB], 'rte-sec-3');
  assert.equal(matchesAll.length, 2);

  const matchesTeluguMeaning = findAudioMetadataForNode([recA, recB], 'rte-sec-3', {
    blockRole: 'explanation',
    language: 'te',
  });
  assert.equal(matchesTeluguMeaning.length, 1);
  assert.equal(matchesTeluguMeaning[0].id, 'cam-cms-sec-3-explanation-te');

  const attachment = buildClauseAudioAttachment(recA);
  assert.equal(attachment.audioMetadataId, recA.id);
  assert.equal(attachment.audioUrl, '/api/books-structures/audio/aud-abc123');
  assert.equal(attachment.blockRole, 'full');
});
