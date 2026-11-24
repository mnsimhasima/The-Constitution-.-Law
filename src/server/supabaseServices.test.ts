import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildAudioS3Key,
  buildSupabasePublicObjectUrl,
  sanitizeS3Segment,
} from './supabaseS3.ts';
import { isValidRecordId, SupabaseDataService } from './supabaseDataService.ts';

test('Supabase S3 helpers sanitize path traversal and URL-encode bucket names with spaces', () => {
  assert.equal(sanitizeS3Segment('../../etc/passwd'), 'etc-passwd');
  assert.equal(sanitizeS3Segment('  '), 'node');

  const key = buildAudioS3Key({
    entityType: 'legal_unit',
    entityId: 'u-coi-en-art14',
    assetId: 'aud-123456',
    ext: '.wav',
  });
  assert.equal(key, 'audio/legal_unit/u-coi-en-art14/aud-123456.wav');

  const publicUrl = buildSupabasePublicObjectUrl(key, {
    supabaseUrl: 'https://example.supabase.co/',
    bucket: 'Constitution Files',
  });
  assert.equal(
    publicUrl,
    'https://example.supabase.co/storage/v1/object/public/Constitution%20Files/audio/legal_unit/u-coi-en-art14/aud-123456.wav'
  );
});

test('SupabaseDataService validates IDs and persists CMS + Reader state reliably in fallback mode', async () => {
  assert.equal(isValidRecordId('user_123-abc@test'), true);
  assert.equal(isValidRecordId('../bad/id'), false);
  assert.equal(isValidRecordId(''), false);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'supabase-svc-test-'));
  const fallbackFile = path.join(tmpDir, 'cms.json');
  try {
    const svc = new SupabaseDataService({
      fallbackFilePath: fallbackFile,
      forceLocalFallback: true,
    });

    await svc.upsertUserProfile('uid-scholar-1', {
      displayName: 'Meera Rao',
      email: 'meera@example.org',
      preferredLanguage: 'te',
      streakDays: 7,
      audioMinutes: 45,
      readChapterIds: ['ch-coi-te-1'],
    });

    await svc.upsertUserNote('uid-scholar-1', {
      id: 'note-art21',
      clauseKey: 'coi::part3::art21',
      bookId: 'mb-constitution-india',
      chapterId: 'ch-coi-te-1',
      clauseId: 'u-coi-te-art21',
      content: 'Article 21 protects life, dignity, and privacy.',
    });

    await svc.upsertUserAnnotation('uid-scholar-1', {
      id: 'hl-art21',
      clauseKey: 'coi::part3::art21',
      bookId: 'mb-constitution-india',
      chapterId: 'ch-coi-te-1',
      clauseId: 'u-coi-te-art21',
      kind: 'highlight',
      color: 'sky',
    });

    await svc.upsertUserAnnotation('uid-scholar-1', {
      id: 'bm-art21',
      clauseKey: 'coi::part3::art21',
      bookId: 'mb-constitution-india',
      chapterId: 'ch-coi-te-1',
      clauseId: 'u-coi-te-art21',
      kind: 'bookmark',
      color: 'none',
    });

    const userState = await svc.getUserCloudState('uid-scholar-1');
    assert.equal(userState.profile?.displayName, 'Meera Rao');
    assert.equal(userState.profile?.preferredLanguage, 'te');
    assert.equal(userState.notes.length, 1);
    assert.equal(userState.notes[0].content, 'Article 21 protects life, dignity, and privacy.');
    assert.equal(userState.highlights['coi::part3::art21']?.color, 'sky');
    assert.ok(userState.bookmarks['coi::part3::art21']);

    await svc.deleteUserNote('uid-scholar-1', 'note-art21');
    const afterDelete = await svc.getUserCloudState('uid-scholar-1');
    assert.equal(afterDelete.notes.length, 0);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
