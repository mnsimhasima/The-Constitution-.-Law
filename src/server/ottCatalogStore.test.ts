import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { OttCatalogStore } from './ottCatalogStore.ts';

async function createTempStore(): Promise<{ store: OttCatalogStore; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ott-store-test-'));
  const store = new OttCatalogStore({
    dbFilePath: path.join(dir, 'ott-catalog.json'),
    audioDir: path.join(dir, 'audio-uploads'),
  });
  return {
    store,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  };
}

test('Constitution of India is seeded with all 6 requested languages (EN, TE, KN, TA, ML, HI) and playable audio for every edition', async () => {
  const { store, cleanup } = await createTempStore();
  try {
    const books = await store.listMasterBooks();
    const coi = books.find((b) => b.slug === 'constitution-of-india');
    assert.ok(coi);
    assert.equal(coi.bookType, 'constitutional');

    const expectedLangs = ['en', 'te', 'kn', 'ta', 'ml', 'hi'];
    for (const code of expectedLangs) {
      const ed = coi.editions.find((e) => e.languageCode === code);
      assert.ok(ed, `Expected ${code} edition under Constitution of India`);
      assert.ok(ed.chapterCount >= 2, `Expected >=2 chapters for ${code}`);
      assert.ok(ed.unitCount >= 3, `Expected >=3 articles for ${code}`);
      assert.ok(ed.descriptionAudioUrl, `Expected description audio for ${code}`);

      // Verify audio stream returns a valid RIFF WAV buffer
      const assetId = ed.descriptionAudioUrl.replace('/api/ott/audio/', '');
      const audio = await store.readAudioAssetFile(assetId);
      assert.ok(audio && audio.buffer.subarray(0, 4).toString('ascii') === 'RIFF');
      assert.equal(audio.mimeType, 'audio/wav');
    }

    // Verify Directive Principles Charter & RTI Act General Law books are also seeded with deep content
    const charter = books.find((b) => b.slug === 'directive-principles-fundamental-duties-charter');
    assert.ok(charter && charter.bookType === 'constitutional');

    const rti = books.find((b) => b.slug === 'right-to-information-act-2005');
    assert.ok(rti && rti.bookType === 'general_law');
    const rtiTree = await store.getEditionTree('ed-rti-en');
    assert.ok(rtiTree);
    assert.equal(rtiTree.chapters.length, 2);
    assert.ok(rtiTree.chapters[1].units.some((u) => u.unitNumber === 'Section 7(1)'));

    // Adding a brand new Spanish edition succeeds and duplicate is rejected
    const esEdition = await store.createEdition(coi.id, {
      languageCode: 'es',
      languageName: 'Spanish',
      nativeLanguageName: 'Español',
      title: 'Constitución de la India',
      subtitle: 'Derechos Fundamentales y Remedios Constitucionales',
      description: 'Edición constitucional redactada manualmente en español.',
    });
    assert.equal(esEdition.languageCode, 'es');

    await assert.rejects(
      () =>
        store.createEdition(coi.id, {
          languageCode: 'es',
          languageName: 'Spanish',
          nativeLanguageName: 'Español',
          title: 'Duplicate Spanish',
        }),
      /already exists/i
    );
  } finally {
    await cleanup();
  }
});

test('createMasterBookBundle creates a Master Book, Edition, Chapter, and multiple Articles at the same time', async () => {
  const { store, cleanup } = await createTempStore();
  try {
    const bundle = await store.createMasterBookBundle({
      canonicalTitle: 'Constitutional Writs & Judicial Review Handbook',
      bookType: 'constitutional',
      jurisdiction: 'Republic of India',
      enactmentYear: '1950',
      edition: {
        languageCode: 'en',
        languageName: 'English',
        nativeLanguageName: 'English',
        title: 'Constitutional Writs & Judicial Review Handbook',
        description: 'Practical guide to Article 32 and Article 226 constitutional writs.',
        narratorName: 'Judicial Studio (EN)',
      },
      chapter: {
        chapterNumber: 'Part I · Chapter 1',
        title: 'Supreme Court & High Court Writ Remedies',
        overviewDefinition: 'Overview of habeas corpus, mandamus, certiorari, and prohibition writs.',
        estimatedMinutes: 10,
      },
      units: [
        {
          unitNumber: 'Article 226',
          title: 'Power of High Courts to Issue Certain Writs',
          definition:
            'Every High Court shall have power throughout its territory to issue writs for enforcement of Fundamental Rights and for any other legal purpose.',
          purposeBackground:
            'Provides accessible state-level constitutional remedies without travelling to New Delhi.',
          deepExplanation:
            'High Court jurisdiction under Article 226 is wider than Article 32 because it covers both Fundamental Rights and ordinary statutory legal rights.',
          practicalExamples:
            'A student wrongly denied an examination admit card can seek an urgent Mandamus writ from the State High Court.',
        },
        {
          unitNumber: 'Article 13',
          title: 'Laws Inconsistent with Fundamental Rights',
          definition:
            'All laws in force or enacted by the State that abridge Fundamental Rights shall, to the extent of inconsistency, be void.',
          purposeBackground:
            'Anchors the doctrine of Judicial Review so constitutional supremacy prevails over ordinary legislation.',
          deepExplanation:
            'Empowers constitutional courts to strike down unconstitutional statutes and executive orders under the doctrines of severability and eclipse.',
          practicalExamples:
            'Courts invalidated vague censorship provisions under Article 13 read with Article 19(1)(a).',
        },
      ],
    });

    assert.ok(bundle.masterBook.id);
    assert.ok(bundle.edition);
    assert.ok(bundle.chapter);
    assert.equal(bundle.units.length, 2);
    assert.ok(bundle.units[0].fullUnitAudioUrl);
    assert.ok(bundle.units[1].definitionAudioUrl);

    const tree = await store.getEditionTree(bundle.edition.id);
    assert.ok(tree);
    assert.equal(tree.chapters.length, 1);
    assert.equal(tree.chapters[0].units.length, 2);
  } finally {
    await cleanup();
  }
});

test('Delta-Sync detects newly added Chapter 3 and updated Chapter 2 for an offline device holding Chapters 1 & 2', async () => {
  const { store, cleanup } = await createTempStore();
  try {
    const initialTree = await store.getEditionTree('ed-coi-en');
    assert.ok(initialTree);
    assert.equal(initialTree.chapters.length, 2);

    const chapterVersions: Record<string, number> = {};
    const unitVersions: Record<string, number> = {};
    for (const ch of initialTree.chapters) {
      chapterVersions[ch.id] = ch.versionNumber;
      for (const u of ch.units) {
        unitVersions[u.id] = u.versionNumber;
      }
    }

    const cleanSync = await store.computeDeltaSync({
      downloadedEditions: [
        {
          editionId: 'ed-coi-en',
          editionVersion: initialTree.edition.versionNumber,
          chapterVersions,
          unitVersions,
        },
      ],
    });
    assert.equal(cleanSync.results[0].upToDate, true);
    assert.equal(cleanSync.totalAddedChapters, 0);

    const ch3 = await store.createChapter('ed-coi-en', {
      chapterNumber: 'Part IV · Chapter 3',
      title: 'Directive Principles of State Policy',
      overviewDefinition: 'Guiding social and economic justice duties for the State.',
      estimatedMinutes: 7,
    });
    const art39A = await store.createLegalUnit(ch3.id, {
      unitNumber: 'Article 39A',
      title: 'Equal Justice and Free Legal Aid',
      definition:
        'The State shall secure that the operation of the legal system promotes justice on a basis of equal opportunity.',
      purposeBackground:
        'Introduced by the 42nd Amendment so economic hardship never bars citizens from accessing courts.',
      deepExplanation:
        'Mandates State Legal Services Authorities to provide free legal counsel to marginalized and low-income litigants.',
      practicalExamples:
        'Any eligible citizen can visit a District Legal Services Authority (DLSA) for free representation.',
    });
    await store.updateChapter('ch-coi-en-2', {
      overviewDefinition: 'Updated Chapter 2 overview including landmark right-to-privacy jurisprudence.',
    });

    const delta = await store.computeDeltaSync({
      downloadedEditions: [
        {
          editionId: 'ed-coi-en',
          editionVersion: initialTree.edition.versionNumber,
          chapterVersions,
          unitVersions,
        },
      ],
    });

    const result = delta.results[0];
    assert.equal(result.upToDate, false);
    assert.equal(result.addedChapters.length, 1);
    assert.equal(result.addedChapters[0].id, ch3.id);
    assert.equal(result.updatedChapters.length, 1);
    assert.equal(result.updatedChapters[0].id, 'ch-coi-en-2');
    assert.equal(result.addedUnits.length, 1);
    assert.equal(result.addedUnits[0].id, art39A.id);
    assert.ok(result.audioUrlsToPrefetch.includes(ch3.overviewAudioUrl!));
    assert.ok(result.audioUrlsToPrefetch.includes(art39A.fullUnitAudioUrl!));
  } finally {
    await cleanup();
  }
});

test('Audio upload validates MIME allowlist, stores file securely, attaches URL, and bumps sync version', async () => {
  const { store, cleanup } = await createTempStore();
  try {
    const before = await store.getEditionTree('ed-cpa-en');
    assert.ok(before);
    const beforeVersion = before.edition.versionNumber;

    await assert.rejects(
      () =>
        store.saveUploadedAudio({
          entityType: 'chapter',
          entityId: 'ch-cpa-en-1',
          blockRole: 'chapter_overview',
          originalFilename: 'script.exe',
          mimeType: 'application/x-msdownload',
          base64Data: Buffer.from('not-audio').toString('base64'),
        }),
      /Unsupported audio format/i
    );

    const fakeWav = Buffer.from('RIFFxxxxWAVEfmt ').toString('base64');
    const asset = await store.saveUploadedAudio({
      entityType: 'chapter',
      entityId: 'ch-cpa-en-1',
      blockRole: 'chapter_overview',
      originalFilename: 'chapter1-overview.wav',
      mimeType: 'audio/wav',
      base64Data: fakeWav,
      durationSec: 42,
    });

    assert.ok(asset.storageUrl.startsWith('/api/ott/audio/aud-'));
    const loaded = await store.readAudioAssetFile(asset.id);
    assert.ok(loaded);
    assert.equal(loaded.mimeType, 'audio/wav');

    const after = await store.getEditionTree('ed-cpa-en');
    assert.ok(after);
    assert.ok(after.edition.versionNumber > beforeVersion);
    assert.equal(after.chapters[0].overviewAudioUrl, asset.storageUrl);
  } finally {
    await cleanup();
  }
});

test('Master Book glossary metadata resolves per active book and supports upserting custom terms', async () => {
  const { store, cleanup } = await createTempStore();
  try {
    const ambedkarGlossary = await store.getMasterBookGlossary({
      bookId: 'ambedkar-constitutional-history',
      bookTitle: 'Dr. B. R. Ambedkar: Architect of Equality & the Constitution',
    });
    assert.equal(ambedkarGlossary.matchedMasterBook?.id, 'mb-constitutional-duties-charter');
    assert.ok(ambedkarGlossary.terms.length >= 25);
    assert.ok(
      ambedkarGlossary.terms.some((t) => t.term === 'Constitutional Morality'),
      'Expected Constitutional Morality glossary term'
    );

    const added = await store.upsertMasterBookGlossaryTerm('mb-constitution-india', {
      term: 'Ultra Vires',
      aliases: ['beyond legal powers'],
      category: 'Judicial Remedy',
      simpleDefinition: 'An act or rule made beyond the legal authority granted by the Constitution or statute.',
      citation: 'Administrative & Constitutional Law',
    });
    assert.equal(added.term, 'Ultra Vires');
    assert.equal(added.masterBookId, 'mb-constitution-india');

    const refreshed = await store.getMasterBookGlossary({ masterBookId: 'mb-constitution-india' });
    assert.ok(refreshed.terms.some((t) => t.term === 'Ultra Vires'));
  } finally {
    await cleanup();
  }
});

